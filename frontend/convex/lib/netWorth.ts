import { QueryCtx } from "../_generated/server";
import { valueVaultItem } from "../../../services/finance/metals";
import {
  positionCostBasis,
  positionValue,
  summarizeHoldings,
  type HoldingValuation,
} from "../../../services/portfolio/categorySummary";

/**
 * Server-side net worth for one user, computed from the stored documents.
 *
 * Single source of truth for the nightly/sync portfolio snapshot
 * (`portfolioSnapshots.takeSnapshot`) and the public API
 * (`GET /api/v1/net-worth`). Values are in the base currency (EUR) that the
 * providers' `valueInBaseCurrency` fields are normalised to.
 *
 * Vault items are valued at live spot (metalSpotPrices, refreshed by
 * convex/metalPrices.ts) using the dashboard's formula; an item falls back to
 * purchase price when its metal has no spot price fresher than
 * SPOT_PRICE_MAX_AGE_MS.
 *
 * A category's costBasis sums only the holdings that have one, converted to
 * the base currency (services/portfolio/categorySummary.ts); holdings
 * without a cost basis add value only.
 */
export async function computeNetWorth(ctx: QueryCtx, userId: string) {
  const categoryBreakdown: Array<{
    category: string;
    value: number;
    costBasis?: number;
  }> = [];

  // 1. Bank accounts (Plaid)
  const bankAccounts = await ctx.db
    .query("plaidAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  let cashValue = 0;
  let liabilitiesValue = 0;

  for (const acc of bankAccounts) {
    const value = acc.valueInBaseCurrency ?? acc.currentBalance ?? 0;
    if (acc.investmentCategory === "liabilities") {
      liabilitiesValue += Math.abs(value);
    } else {
      cashValue += value;
    }
  }

  // 2. Broker accounts (SnapTrade)
  const brokerAccounts = await ctx.db
    .query("brokerAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const brokerPositions = await ctx.db
    .query("brokerPositions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  // Build set of accounts that have positions
  const accountsWithPositions = new Set(
    brokerPositions.map((p) => p.accountId),
  );

  // Holdings of the cost-bearing categories, from every provider
  const equities: HoldingValuation[] = [];
  const bonds: HoldingValuation[] = [];
  const crypto: HoldingValuation[] = [];
  const commodities: HoldingValuation[] = [];
  let brokerCashValue = 0;
  let brokerLiabilitiesValue = 0;

  // Process broker positions
  for (const pos of brokerPositions) {
    const holding = {
      value: positionValue(pos),
      costBasis: positionCostBasis(pos),
    };

    switch (pos.investmentCategory) {
      case "bonds":
        bonds.push(holding);
        break;
      case "crypto":
        crypto.push(holding);
        break;
      case "cash":
        brokerCashValue += holding.value;
        break;
      case "liabilities":
        brokerLiabilitiesValue += Math.abs(holding.value);
        break;
      default:
        // Equities, and unclassified positions by default
        equities.push(holding);
    }
  }

  // Process broker account cash (uninvested)
  for (const acc of brokerAccounts) {
    let cashBalance = 0;
    if ((acc.cash ?? 0) > 0) {
      cashBalance = acc.cashValueInBaseCurrency ?? acc.cash ?? 0;
    } else if (
      !accountsWithPositions.has(acc._id) &&
      (acc.balance ?? 0) > 0
    ) {
      // If no positions and balance > 0, treat balance as cash
      cashBalance = acc.balance ?? 0;
    }
    brokerCashValue += cashBalance;
  }

  // 3. Vault items (commodities), valued at live spot like the dashboard,
  //    falling back to purchase price when no fresh spot price exists.
  const vaultItems = await ctx.db
    .query("vaultItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const spotByMetal = new Map(
    (await ctx.db.query("metalSpotPrices").collect()).map((p) => [
      p.metalType,
      p,
    ]),
  );
  const now = Date.now();

  for (const item of vaultItems) {
    const { value, cost } = valueVaultItem(
      item,
      spotByMetal.get(item.metalType),
      now,
    );
    commodities.push({ value, costBasis: cost });
  }

  // 4. Bitpanda holdings (mixed: crypto, metals, commodities, stocks, fiat)
  const bitpandaHoldings = await ctx.db
    .query("bitpandaHoldings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  // Bitpanda reports no cost basis: these count toward value only.
  let bitpandaCashValue = 0;
  let bitpandaLiabilitiesValue = 0;

  for (const h of bitpandaHoldings) {
    const holding = { value: positionValue(h), costBasis: null };
    switch (h.investmentCategory) {
      case "cash":
        bitpandaCashValue += holding.value;
        break;
      case "equities":
        equities.push(holding);
        break;
      case "bonds":
        bonds.push(holding);
        break;
      case "commodities":
        commodities.push(holding);
        break;
      case "liabilities":
        bitpandaLiabilitiesValue += Math.abs(holding.value);
        break;
      default:
        crypto.push(holding);
    }
  }

  // 5. Manual loans (liabilities)
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  let loansValue = 0;
  for (const loan of loans) {
    loansValue += loan.currentBalance ?? loan.originalPrincipal ?? 0;
  }

  // Build category breakdown
  if (cashValue + brokerCashValue + bitpandaCashValue > 0) {
    categoryBreakdown.push({
      category: "cash",
      value: cashValue + brokerCashValue + bitpandaCashValue,
    });
  }

  const investments = [
    { category: "equities", holdings: equities },
    { category: "bonds", holdings: bonds },
    { category: "crypto", holdings: crypto },
    { category: "commodities", holdings: commodities },
  ].map(({ category, holdings }) => ({
    category,
    ...summarizeHoldings(holdings),
  }));

  for (const c of investments) {
    if (c.value > 0) {
      categoryBreakdown.push({
        category: c.category,
        value: c.value,
        costBasis: c.costBasis ?? undefined,
      });
    }
  }

  // Calculate totals
  const costBearing = investments.filter((c) => c.costBasis !== null);
  const totalCostBasis =
    costBearing.length > 0
      ? costBearing.reduce((sum, c) => sum + (c.costBasis ?? 0), 0)
      : undefined;

  const totalAssets =
    cashValue +
    brokerCashValue +
    bitpandaCashValue +
    investments.reduce((sum, c) => sum + c.value, 0);

  const totalLiabilities =
    liabilitiesValue +
    brokerLiabilitiesValue +
    bitpandaLiabilitiesValue +
    loansValue;

  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    totalCostBasis,
    categoryBreakdown,
  };
}
