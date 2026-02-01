/**
 * Portfolio Snapshots
 *
 * Functions to record and retrieve portfolio value snapshots.
 * Snapshots are taken after each sync operation to track portfolio value over time.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

/**
 * Internal mutation to take a portfolio snapshot
 * Called after sync operations complete
 */
export const takeSnapshot = internalMutation({
  args: {
    userId: v.string(),
    source: v.string(), // "plaid", "snaptrade", "manual", "vault", "scheduled"
  },
  handler: async (ctx, { userId, source }) => {
    const now = Date.now();
    const today = new Date(now).toISOString().split("T")[0];

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

    // 4. Manual loans (liabilities)
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let loansValue = 0;
    for (const loan of loans) {
      loansValue += loan.currentBalance ?? loan.originalPrincipal ?? 0;
    }

    // Build category breakdown
    if (cashValue + brokerCashValue > 0) {
      categoryBreakdown.push({
        category: "cash",
        value: cashValue + brokerCashValue,
      });
    }

    if (equitiesValue > 0) {
      categoryBreakdown.push({
        category: "equities",
        value: equitiesValue,
        costBasis: equitiesCost > 0 ? equitiesCost : undefined,
      });
      if (equitiesCost > 0) hasCostBasis = true;
    }

    if (bondsValue > 0) {
      categoryBreakdown.push({
        category: "bonds",
        value: bondsValue,
        costBasis: bondsCost > 0 ? bondsCost : undefined,
      });
      if (bondsCost > 0) hasCostBasis = true;
    }

    if (cryptoValue > 0) {
      categoryBreakdown.push({
        category: "crypto",
        value: cryptoValue,
        costBasis: cryptoCost > 0 ? cryptoCost : undefined,
      });
      if (cryptoCost > 0) hasCostBasis = true;
    }

    if (commoditiesValue > 0) {
      categoryBreakdown.push({
        category: "commodities",
        value: commoditiesValue,
        costBasis: commoditiesCost > 0 ? commoditiesCost : undefined,
      });
      if (commoditiesCost > 0) hasCostBasis = true;
    }

    // Calculate totals
    totalAssets =
      cashValue +
      brokerCashValue +
      equitiesValue +
      bondsValue +
      cryptoValue +
      commoditiesValue;

    totalLiabilities = liabilitiesValue + brokerLiabilitiesValue + loansValue;

    totalCostBasis = equitiesCost + bondsCost + cryptoCost + commoditiesCost;

    const netWorth = totalAssets - totalLiabilities;

    // Check if we already have a snapshot for today
    const existingSnapshot = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", today),
      )
      .first();

    if (existingSnapshot) {
      // Update existing snapshot for today
      await ctx.db.patch(existingSnapshot._id, {
        timestamp: now,
        totalAssets,
        totalLiabilities,
        netWorth,
        totalCostBasis: hasCostBasis ? totalCostBasis : undefined,
        categoryBreakdown,
        source,
      });
    } else {
      // Create new snapshot
      await ctx.db.insert("portfolioSnapshots", {
        userId,
        timestamp: now,
        date: today,
        totalAssets,
        totalLiabilities,
        netWorth,
        totalCostBasis: hasCostBasis ? totalCostBasis : undefined,
        categoryBreakdown,
        source,
      });
    }

    return { totalAssets, totalLiabilities, netWorth };
  },
});

/**
 * Public mutation to manually trigger a snapshot (e.g., after manual edits)
 */
export const takeManualSnapshot = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();
    const today = new Date(now).toISOString().split("T")[0];

    // Reuse the same calculation logic
    // (In a real app, you'd extract this to a shared helper)

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
          equitiesValue += value;
          equitiesCost += cost;
      }
    }

    for (const acc of brokerAccounts) {
      let cashBalance = 0;
      if ((acc.cash ?? 0) > 0) {
        cashBalance = acc.cashValueInBaseCurrency ?? acc.cash ?? 0;
      } else if (
        !accountsWithPositions.has(acc._id) &&
        (acc.balance ?? 0) > 0
      ) {
        cashBalance = acc.balance ?? 0;
      }
      brokerCashValue += cashBalance;
    }

    // 3. Vault items (commodities)
    const vaultItems = await ctx.db
      .query("vaultItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let commoditiesValue = 0;
    let commoditiesCost = 0;

    for (const item of vaultItems) {
      const itemCost = (item.purchasePricePerUnit ?? 0) * item.quantity;
      commoditiesCost += itemCost;
      commoditiesValue += itemCost;
    }

    // 4. Manual loans
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let loansValue = 0;
    for (const loan of loans) {
      loansValue += loan.currentBalance ?? loan.originalPrincipal ?? 0;
    }

    // Build category breakdown
    if (cashValue + brokerCashValue > 0) {
      categoryBreakdown.push({
        category: "cash",
        value: cashValue + brokerCashValue,
      });
    }

    if (equitiesValue > 0) {
      categoryBreakdown.push({
        category: "equities",
        value: equitiesValue,
        costBasis: equitiesCost > 0 ? equitiesCost : undefined,
      });
      if (equitiesCost > 0) hasCostBasis = true;
    }

    if (bondsValue > 0) {
      categoryBreakdown.push({
        category: "bonds",
        value: bondsValue,
        costBasis: bondsCost > 0 ? bondsCost : undefined,
      });
      if (bondsCost > 0) hasCostBasis = true;
    }

    if (cryptoValue > 0) {
      categoryBreakdown.push({
        category: "crypto",
        value: cryptoValue,
        costBasis: cryptoCost > 0 ? cryptoCost : undefined,
      });
      if (cryptoCost > 0) hasCostBasis = true;
    }

    if (commoditiesValue > 0) {
      categoryBreakdown.push({
        category: "commodities",
        value: commoditiesValue,
        costBasis: commoditiesCost > 0 ? commoditiesCost : undefined,
      });
      if (commoditiesCost > 0) hasCostBasis = true;
    }

    totalAssets =
      cashValue +
      brokerCashValue +
      equitiesValue +
      bondsValue +
      cryptoValue +
      commoditiesValue;

    totalLiabilities = liabilitiesValue + brokerLiabilitiesValue + loansValue;
    totalCostBasis = equitiesCost + bondsCost + cryptoCost + commoditiesCost;

    const netWorth = totalAssets - totalLiabilities;

    // Check if we already have a snapshot for today
    const existingSnapshot = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", today),
      )
      .first();

    if (existingSnapshot) {
      await ctx.db.patch(existingSnapshot._id, {
        timestamp: now,
        totalAssets,
        totalLiabilities,
        netWorth,
        totalCostBasis: hasCostBasis ? totalCostBasis : undefined,
        categoryBreakdown,
        source: "manual",
      });
    } else {
      await ctx.db.insert("portfolioSnapshots", {
        userId,
        timestamp: now,
        date: today,
        totalAssets,
        totalLiabilities,
        netWorth,
        totalCostBasis: hasCostBasis ? totalCostBasis : undefined,
        categoryBreakdown,
        source: "manual",
      });
    }

    return { totalAssets, totalLiabilities, netWorth };
  },
});

/**
 * Get portfolio snapshots for historical performance chart
 */
export const getSnapshots = query({
  args: {
    limit: v.optional(v.number()), // Max number of snapshots to return
  },
  handler: async (ctx, { limit = 365 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    const snapshots = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_timestamp", (q) => q.eq("userId", userId))
      .order("asc")
      .take(limit);

    return snapshots;
  },
});

/**
 * Get the latest snapshot for quick portfolio value lookup
 */
export const getLatestSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const snapshot = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_timestamp", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    return snapshot;
  },
});
