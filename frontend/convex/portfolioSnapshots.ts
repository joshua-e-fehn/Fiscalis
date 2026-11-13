/**
 * Portfolio Snapshots
 *
 * One canonical snapshot per user per day: every trigger (the daily cron,
 * a provider sync, a manual vault or loan change) upserts today's row with
 * the current net worth (lib/netWorth.ts computeNetWorth), so the series has
 * one point per day however often the data changed. Manual changes schedule
 * the snapshot through scheduleSnapshot, debounced. Each category entry
 * records its net external flow since the previous day's row.
 */

import { v } from "convex/values";
import {
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { computeNetWorth } from "./lib/netWorth";
import {
  snapshotPartial,
  withoutSnapshotHoldings,
} from "../../services/portfolio/aggregate";
import { getUserId } from "./lib/auth";

/** Delay before a snapshot requested by a manual change is taken. */
export const SNAPSHOT_DEBOUNCE_MS = 60_000;

/**
 * Schedule today's snapshot after a manual change (vault item, loan).
 * Several changes within SNAPSHOT_DEBOUNCE_MS collapse into one write: a
 * scheduled run skips when today's row was written after it was requested.
 */
export async function scheduleSnapshot(
  ctx: MutationCtx,
  userId: string,
  source: string,
): Promise<void> {
  await ctx.scheduler.runAfter(
    SNAPSHOT_DEBOUNCE_MS,
    internal.portfolioSnapshots.takeSnapshot,
    { userId, source, requestedAt: Date.now() },
  );
}

/**
 * Upsert today's portfolio snapshot for a user.
 */
export const takeSnapshot = internalMutation({
  args: {
    userId: v.string(),
    source: v.string(), // "plaid", "snaptrade", "bitpanda", "vault", "loan", "scheduled-daily", ...
    // Set by a full sync only: true when a provider sync before this
    // snapshot failed, so that provider's holdings are the ones stored by its
    // last successful sync. Other writes omit it and keep the row's flag
    // (aggregate.ts snapshotPartial).
    partial: v.optional(v.boolean()),
    // Debounced request (scheduleSnapshot): skip when today's row was
    // written at or after this time
    requestedAt: v.optional(v.number()),
    // Fallback run (daily cron): only write when today has no row yet
    onlyIfMissing: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, source, partial, requestedAt, onlyIfMissing }) => {
    const now = Date.now();
    const today = new Date(now).toISOString().split("T")[0];

    // Newest row of today (days before this policy may hold several)
    const existing = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", today),
      )
      .order("desc")
      .first();

    if (
      existing &&
      (onlyIfMissing ||
        (requestedAt !== undefined && existing.timestamp >= requestedAt))
    ) {
      return {
        totalAssets: existing.totalAssets,
        totalLiabilities: existing.totalLiabilities,
        netWorth: existing.netWorth,
      };
    }

    // The newest row of an earlier day: each category's netFlow is the
    // money moved in or out since then, exact for the holdings traded in
    // between (the providers' trade logs, lib/netWorth.ts loadExactFlows)
    // and derived from the holdings both rows keep for the rest
    // (aggregate.ts categoryFlowFromHoldings)
    const previous = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).lt("date", today),
      )
      .order("desc")
      .first();

    const {
      totalAssets,
      totalLiabilities,
      netWorth,
      totalCostBasis,
      totalCoveredValue,
      categoryBreakdown,
      asOf,
    } = await computeNetWorth(ctx, userId, previous ?? undefined);

    const fields = {
      timestamp: now,
      totalAssets,
      totalLiabilities,
      netWorth,
      totalCostBasis,
      totalCoveredValue,
      categoryBreakdown,
      source,
      partial: snapshotPartial(existing?.partial, partial),
      asOf: asOf ?? undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("portfolioSnapshots", {
        userId,
        date: today,
        ...fields,
      });
      // The first row of a new day: only it and `previous` still need their
      // holdings, so the row before `previous` drops them
      if (previous) {
        const older = await ctx.db
          .query("portfolioSnapshots")
          .withIndex("by_user_date", (q) =>
            q.eq("userId", userId).lt("date", previous.date),
          )
          .order("desc")
          .first();
        if (
          older?.categoryBreakdown?.some((c) =>
            c.sources?.some((s) => s.holdings !== undefined),
          )
        ) {
          await ctx.db.patch(older._id, {
            categoryBreakdown: withoutSnapshotHoldings(older.categoryBreakdown),
          });
        }
      }
    }

    return { totalAssets, totalLiabilities, netWorth };
  },
});

function withoutHoldings(snapshot: Doc<"portfolioSnapshots">) {
  return snapshot.categoryBreakdown
    ? {
        ...snapshot,
        categoryBreakdown: withoutSnapshotHoldings(snapshot.categoryBreakdown),
      }
    : snapshot;
}

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
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const newestFirst = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_timestamp", (q) =>
        since === undefined
          ? q.eq("userId", userId)
          : q.eq("userId", userId).gt("timestamp", since),
      )
      .order("desc")
      .take(limit);

    // Holdings are kept for the snapshot writer only
    const snapshots = newestFirst.reverse().map(withoutHoldings);

    if (since === undefined) return snapshots;

    const baseline = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_timestamp", (q) =>
        q.eq("userId", userId).lte("timestamp", since),
      )
      .order("desc")
      .first();

    return baseline ? [withoutHoldings(baseline), ...snapshots] : snapshots;
  },
});

/**
 * Get the latest snapshot for quick portfolio value lookup
 */
export const getLatestSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

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
