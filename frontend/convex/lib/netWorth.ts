import { QueryCtx } from "../_generated/server";

/**
 * Server-side net worth for one user, computed from the stored documents.
 *
 * Single source of truth for the nightly/sync portfolio snapshot
 * (`portfolioSnapshots.takeSnapshot`) and the public API
 * (`GET /api/v1/net-worth`). Values are in the base currency (EUR) that the
 * providers' `valueInBaseCurrency` fields are normalised to.
 *
 * Known limitation: vault items are valued at purchase price, not live spot.
 */
export async function computeNetWorth(ctx: QueryCtx, userId: string) {
  // Calculate total assets from all sources
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalCostBasis = 0;
  let hasCostBasis = false;

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

  let equitiesValue = 0;
  let equitiesCost = 0;
  let bondsValue = 0;
  let bondsCost = 0;
  let cryptoValue = 0;
  let cryptoCost = 0;
  let brokerCashValue = 0;
  let brokerLiabilitiesValue = 0;

  // Process broker positions
  for (const pos of brokerPositions) {
    const value = pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
    const cost = pos.totalCostBasis ?? 0;

    switch (pos.investmentCategory) {
      case "equities":
        equitiesValue += value;
        equitiesCost += cost;
        break;
      case "bonds":
        bondsValue += value;
        bondsCost += cost;
        break;
      case "crypto":
        cryptoValue += value;
        cryptoCost += cost;
        break;
      case "cash":
        brokerCashValue += value;
        break;
      case "liabilities":
        brokerLiabilitiesValue += Math.abs(value);
        break;
      default:
        // Unclassified goes to equities by default
        equitiesValue += value;
        equitiesCost += cost;
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

  // 3. Vault items (commodities)
  // Note: We don't have live prices here, so we use the quantity * purchasePricePerUnit as estimate
  // The actual market value needs to be calculated with current spot prices
  const vaultItems = await ctx.db
    .query("vaultItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  let commoditiesValue = 0;
  let commoditiesCost = 0;

  for (const item of vaultItems) {
    // Use purchase price as value estimate (actual market value needs live prices)
    const itemCost = (item.purchasePricePerUnit ?? 0) * item.quantity;
    commoditiesCost += itemCost;
    // For now, use cost as value (can be improved with live price lookup later)
    commoditiesValue += itemCost;
  }

  // 4. Bitpanda holdings (mixed: crypto, metals, commodities, stocks, fiat)
  const bitpandaHoldings = await ctx.db
    .query("bitpandaHoldings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  let bitpandaCashValue = 0;
  let bitpandaEquitiesValue = 0;
  let bitpandaBondsValue = 0;
  let bitpandaCryptoValue = 0;
  let bitpandaCommoditiesValue = 0;
  let bitpandaLiabilitiesValue = 0;

  for (const h of bitpandaHoldings) {
    const value = h.valueInBaseCurrency ?? h.marketValue ?? 0;
    switch (h.investmentCategory) {
      case "cash":
        bitpandaCashValue += value;
        break;
      case "equities":
        bitpandaEquitiesValue += value;
        break;
      case "bonds":
        bitpandaBondsValue += value;
        break;
      case "crypto":
        bitpandaCryptoValue += value;
        break;
      case "commodities":
        bitpandaCommoditiesValue += value;
        break;
      case "liabilities":
        bitpandaLiabilitiesValue += Math.abs(value);
        break;
      default:
        bitpandaCryptoValue += value;
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

  const totalEquitiesValue = equitiesValue + bitpandaEquitiesValue;
  if (totalEquitiesValue > 0) {
    categoryBreakdown.push({
      category: "equities",
      value: totalEquitiesValue,
      costBasis: equitiesCost > 0 ? equitiesCost : undefined,
    });
    if (equitiesCost > 0) hasCostBasis = true;
  }

  const totalBondsValue = bondsValue + bitpandaBondsValue;
  if (totalBondsValue > 0) {
    categoryBreakdown.push({
      category: "bonds",
      value: totalBondsValue,
      costBasis: bondsCost > 0 ? bondsCost : undefined,
    });
    if (bondsCost > 0) hasCostBasis = true;
  }

  // Combine broker crypto (SnapTrade) + Bitpanda crypto
  const totalCryptoValue = cryptoValue + bitpandaCryptoValue;
  if (totalCryptoValue > 0) {
    categoryBreakdown.push({
      category: "crypto",
      value: totalCryptoValue,
      costBasis: cryptoCost > 0 ? cryptoCost : undefined,
    });
    if (cryptoCost > 0) hasCostBasis = true;
  }

  const totalCommoditiesValue = commoditiesValue + bitpandaCommoditiesValue;
  if (totalCommoditiesValue > 0) {
    categoryBreakdown.push({
      category: "commodities",
      value: totalCommoditiesValue,
      costBasis: commoditiesCost > 0 ? commoditiesCost : undefined,
    });
    if (commoditiesCost > 0) hasCostBasis = true;
  }

  // Calculate totals
  totalAssets =
    cashValue +
    brokerCashValue +
    bitpandaCashValue +
    equitiesValue +
    bitpandaEquitiesValue +
    bondsValue +
    bitpandaBondsValue +
    cryptoValue +
    bitpandaCryptoValue +
    commoditiesValue +
    bitpandaCommoditiesValue;

  totalLiabilities =
    liabilitiesValue +
    brokerLiabilitiesValue +
    bitpandaLiabilitiesValue +
    loansValue;

  totalCostBasis = equitiesCost + bondsCost + cryptoCost + commoditiesCost;

  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    totalCostBasis: hasCostBasis ? totalCostBasis : undefined,
    categoryBreakdown,
  };
}
