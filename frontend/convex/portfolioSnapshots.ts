/**
 * Portfolio Snapshots
 *
 * Functions to record and retrieve portfolio value snapshots.
 * Snapshots are taken after each sync operation to track portfolio value over time.
 */

import { v } from "convex/values";
import {
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
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

    // Determine if we should create a new snapshot or update existing
    // - "scheduled-daily" updates existing snapshot for the day (one per day)
    // - All other sources (sync-all, manual, etc.) always create new snapshots
    //   to build an irregular time series for tracking changes
    const shouldUpdateExisting = source === "scheduled-daily";

    if (shouldUpdateExisting) {
      // Check if we already have a snapshot for today from scheduled sync
      const existingSnapshot = await ctx.db
        .query("portfolioSnapshots")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", userId).eq("date", today),
        )
        .first();

      if (existingSnapshot && existingSnapshot.source === "scheduled-daily") {
        // Update existing scheduled snapshot for today
        await ctx.db.patch(existingSnapshot._id, {
          timestamp: now,
          totalAssets,
          totalLiabilities,
          netWorth,
          totalCostBasis: hasCostBasis ? totalCostBasis : undefined,
          categoryBreakdown,
          source,
        });
        return { totalAssets, totalLiabilities, netWorth };
      }
    }

    // Create new snapshot (default behavior for manual syncs)
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

/**
 * Internal query to get all unique users who have any financial connections
 * Used by the scheduled daily sync to determine which users to sync
 */
export const getUsersWithConnections = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const userIds = new Set<string>();

    // Get users with Plaid connections
    const plaidItems = await ctx.db.query("plaidItems").collect();
    for (const item of plaidItems) {
      userIds.add(item.userId);
    }

    // Get users with Snaptrade connections
    const brokerConnections = await ctx.db.query("brokerConnections").collect();
    for (const conn of brokerConnections) {
      userIds.add(conn.userId);
    }

    // Get users with Bitpanda connections
    const bitpandaConnections = await ctx.db
      .query("bitpandaConnections")
      .collect();
    for (const conn of bitpandaConnections) {
      userIds.add(conn.userId);
    }

    // Get users with vault items (manual assets)
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      userIds.add(item.userId);
    }

    // Get users with loans (manual liabilities)
    const loans = await ctx.db.query("loans").collect();
    for (const loan of loans) {
      userIds.add(loan.userId);
    }

    return Array.from(userIds);
  },
});
