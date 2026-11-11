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
import { computeNetWorth } from "./lib/netWorth";

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

    const {
      totalAssets,
      totalLiabilities,
      netWorth,
      totalCostBasis,
      categoryBreakdown,
    } = await computeNetWorth(ctx, userId);

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
          totalCostBasis,
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
      totalCostBasis,
      categoryBreakdown,
      source,
    });

    return { totalAssets, totalLiabilities, netWorth };
  },
});

/**
 * Get portfolio snapshots for historical performance charts, oldest first.
 *
 * Returns the NEWEST `limit` snapshots (the limit is a guard, not a window):
 * reading the index ascending and taking N would return the oldest N and
 * freeze "current" values once a user passes the limit.
 *
 * With `since`, only snapshots after that timestamp are returned, plus one
 * baseline snapshot at or before it (when one exists), so callers can read
 * the value at the range start.
 */
export const getSnapshots = query({
  args: {
    limit: v.optional(v.number()), // Max number of snapshots to return
    since: v.optional(v.number()), // Range start (ms); a baseline at/before it is included
  },
  handler: async (ctx, { limit = 365, since }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    const newestFirst = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_timestamp", (q) =>
        since === undefined
          ? q.eq("userId", userId)
          : q.eq("userId", userId).gt("timestamp", since),
      )
      .order("desc")
      .take(limit);

    const snapshots = newestFirst.reverse();

    if (since === undefined) return snapshots;

    const baseline = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_timestamp", (q) =>
        q.eq("userId", userId).lte("timestamp", since),
      )
      .order("desc")
      .first();

    return baseline ? [baseline, ...snapshots] : snapshots;
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
