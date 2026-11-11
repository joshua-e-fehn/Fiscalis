import { QueryCtx } from "../_generated/server";
import { loadFxRates } from "../fxRates";
import { valueVaultItem } from "../../../services/finance/metals";
import {
  bankAccountValue,
  brokerAccountCash,
  loanBalanceInBase,
} from "../../../services/portfolio/categorySummary";
import {
  bucketProviderHoldings,
  buildSnapshotBreakdown,
} from "../../../services/portfolio/netWorthBreakdown";

/**
 * Server-side net worth for one user, computed from the stored documents.
 *
 * Single source of truth for the nightly/sync portfolio snapshot
 * (`portfolioSnapshots.takeSnapshot`) and the public API
 * (`GET /api/v1/net-worth`). Values are in the base currency (EUR): provider
 * documents are read only through their *InBaseCurrency fields, stamped at
 * sync time from the fxRates mirror, and manual loans are converted here by
 * their currency (services/finance/currency.ts). An amount in a currency
 * without a rate is left out rather than counted 1:1 as EUR.
 *
 * Vault items are valued at live spot (metalSpotPrices, refreshed by
 * convex/metalPrices.ts) using the dashboard's formula; an item falls back to
 * purchase price when its metal has no spot price fresher than
 * SPOT_PRICE_MAX_AGE_MS.
 *
 * Provider holdings are routed to categories by
 * services/portfolio/netWorthBreakdown.ts: a category's costBasis sums only
 * the holdings that have one, converted to the base currency, and
 * coveredValue records the value that cost covers; holdings without a cost
 * basis add value only.
 */
export async function computeNetWorth(ctx: QueryCtx, userId: string) {
  // 1. Bank accounts (Plaid)
  const bankAccounts = await ctx.db
    .query("plaidAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  let cashValue = 0;
  let liabilitiesValue = 0;

  for (const acc of bankAccounts) {
    const value = bankAccountValue(acc);
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

  // Broker account cash (uninvested)
  let brokerCashValue = 0;
  for (const acc of brokerAccounts) {
    brokerCashValue += brokerAccountCash(acc, accountsWithPositions.has(acc._id));
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

  const vaultHoldings = vaultItems.map((item) => {
    const { value, cost } = valueVaultItem(
      item,
      spotByMetal.get(item.metalType),
      now,
    );
    return { value, costBasis: cost };
  });

  // 4. Bitpanda holdings (mixed: crypto, metals, commodities, stocks, fiat)
  const bitpandaHoldings = await ctx.db
    .query("bitpandaHoldings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const providers = bucketProviderHoldings({
    brokerPositions,
    vaultHoldings,
    bitpandaHoldings,
  });

  // 5. Manual loans (liabilities): active and defaulted ones, converted by
  //    each loan's currency
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const rates = await loadFxRates(ctx);
  let loansValue = 0;
  for (const loan of loans) {
    loansValue += loanBalanceInBase(loan, rates);
  }

  const { categoryBreakdown, investmentsValue, totalCostBasis, totalCoveredValue } =
    buildSnapshotBreakdown(
      cashValue + brokerCashValue + providers.cash,
      providers.categories,
    );

  const totalAssets =
    cashValue + brokerCashValue + providers.cash + investmentsValue;

  const totalLiabilities =
    liabilitiesValue + providers.liabilities + loansValue;

  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    totalCostBasis,
    totalCoveredValue,
    categoryBreakdown,
  };
}
