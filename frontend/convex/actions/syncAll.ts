"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";

// ═══════════════════════════════════════════════════════════════
// SYNC ALL ACTION
// ═══════════════════════════════════════════════════════════════

export interface SyncAllResult {
  success: boolean;
  plaid: {
    success: boolean;
    itemsSynced: number;
    error?: string;
  };
  snaptrade: {
    success: boolean;
    connectionsProcessed: number;
    accountsProcessed: number;
    positionsProcessed: number;
    error?: string;
  };
  bitpanda: {
    success: boolean;
    connectionsSynced: number;
    error?: string;
  };
  snapshot: {
    success: boolean;
    totalAssets?: number;
    totalLiabilities?: number;
    netWorth?: number;
    error?: string;
  };
}

/**
 * Sync all financial data from all providers (Plaid, Snaptrade, Bitpanda)
 * and create a portfolio snapshot.
 *
 * This action handles partial failures gracefully:
 * - If some providers fail, the snapshot will use the latest available data
 * - Returns detailed status for each provider
 */
export const syncAllProviders = action({
  args: {},
  returns: v.object({
    success: v.boolean(),
    plaid: v.object({
      success: v.boolean(),
      itemsSynced: v.number(),
      error: v.optional(v.string()),
    }),
    snaptrade: v.object({
      success: v.boolean(),
      connectionsProcessed: v.number(),
      accountsProcessed: v.number(),
      positionsProcessed: v.number(),
      error: v.optional(v.string()),
    }),
    bitpanda: v.object({
      success: v.boolean(),
      connectionsSynced: v.number(),
      error: v.optional(v.string()),
    }),
    snapshot: v.object({
      success: v.boolean(),
      totalAssets: v.optional(v.number()),
      totalLiabilities: v.optional(v.number()),
      netWorth: v.optional(v.number()),
      error: v.optional(v.string()),
    }),
  }),
  handler: async (ctx): Promise<SyncAllResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const result: SyncAllResult = {
      success: false,
      plaid: { success: false, itemsSynced: 0 },
      snaptrade: {
        success: false,
        connectionsProcessed: 0,
        accountsProcessed: 0,
        positionsProcessed: 0,
      },
      bitpanda: { success: false, connectionsSynced: 0 },
      snapshot: { success: false },
    };

    // 1. Sync Plaid accounts (skip individual snapshot)
    try {
      const plaidResult = await ctx.runAction(
        api.actions.plaid.refreshAccounts,
        { skipSnapshot: true },
      );
      result.plaid = {
        success: plaidResult.success,
        itemsSynced: plaidResult.itemsSynced,
      };
    } catch (error) {
      console.error("Plaid sync error:", error);
      result.plaid = {
        success: false,
        itemsSynced: 0,
        error: error instanceof Error ? error.message : "Plaid sync failed",
      };
    }

    // 2. Sync Snaptrade broker data (skip individual snapshot)
    try {
      const snaptradeResult = await ctx.runAction(
        api.actions.snaptrade.syncAll,
        { skipSnapshot: true },
      );
      // Handle union type - check if the detailed fields exist
      if ("connectionsProcessed" in snaptradeResult) {
        result.snaptrade = {
          success: true,
          connectionsProcessed: snaptradeResult.connectionsProcessed,
          accountsProcessed: snaptradeResult.accountsProcessed,
          positionsProcessed: snaptradeResult.positionsProcessed,
        };
      } else {
        // It's the simple success/message response
        result.snaptrade = {
          success: snaptradeResult.success,
          connectionsProcessed: 0,
          accountsProcessed: 0,
          positionsProcessed: 0,
        };
      }
    } catch (error) {
      console.error("Snaptrade sync error:", error);
      result.snaptrade = {
        success: false,
        connectionsProcessed: 0,
        accountsProcessed: 0,
        positionsProcessed: 0,
        error: error instanceof Error ? error.message : "Snaptrade sync failed",
      };
    }

    // 3. Sync Bitpanda data (skip individual snapshot)
    try {
      const bitpandaResult = await ctx.runAction(
        api.actions.bitpanda.syncAllConnections,
        { skipSnapshot: true },
      );
      result.bitpanda = {
        success: bitpandaResult.success,
        connectionsSynced: bitpandaResult.count,
      };
    } catch (error) {
      console.error("Bitpanda sync error:", error);
      result.bitpanda = {
        success: false,
        connectionsSynced: 0,
        error: error instanceof Error ? error.message : "Bitpanda sync failed",
      };
    }

    // 4. Take portfolio snapshot
    // The snapshot will use the latest available data in the database,
    // including data from providers that successfully synced
    try {
      const snapshotResult = await ctx.runMutation(
        internal.portfolioSnapshots.takeSnapshot,
        {
          userId,
          source: "sync-all",
        },
      );
      result.snapshot = {
        success: true,
        totalAssets: snapshotResult.totalAssets,
        totalLiabilities: snapshotResult.totalLiabilities,
        netWorth: snapshotResult.netWorth,
      };
    } catch (error) {
      console.error("Snapshot error:", error);
      result.snapshot = {
        success: false,
        error:
          error instanceof Error ? error.message : "Snapshot creation failed",
      };
    }

    // Consider the overall sync successful if at least one provider synced
    // and the snapshot was created
    result.success =
      (result.plaid.success ||
        result.snaptrade.success ||
        result.bitpanda.success) &&
      result.snapshot.success;

    return result;
  },
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULED DAILY SYNC (INTERNAL ACTIONS)
// ═══════════════════════════════════════════════════════════════

export interface ScheduledSyncResult {
  usersProcessed: number;
  usersSuccessful: number;
  usersFailed: number;
  snapshotsCreated: number;
  timestamp: number;
  results: Array<{
    userId: string;
    success: boolean;
    plaidSuccess: boolean;
    snaptradeSuccess: boolean;
    bitpandaSuccess: boolean;
    snapshotSuccess: boolean;
    error?: string;
  }>;
}

/**
 * Internal action to sync all providers for a specific user
 * Called by the scheduled daily sync
 */
export const syncAllForUserInternal = internalAction({
  args: {
    userId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    plaidSuccess: v.boolean(),
    snaptradeSuccess: v.boolean(),
    bitpandaSuccess: v.boolean(),
    snapshotSuccess: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    { userId },
  ): Promise<{
    success: boolean;
    plaidSuccess: boolean;
    snaptradeSuccess: boolean;
    bitpandaSuccess: boolean;
    snapshotSuccess: boolean;
    error?: string;
  }> => {
    console.log(`[SCHEDULED SYNC] Starting sync for user: ${userId}`);

    let plaidSuccess = false;
    let snaptradeSuccess = false;
    let bitpandaSuccess = false;
    let snapshotSuccess = false;

    // 1. Sync Plaid accounts
    try {
      const plaidResult: { success: boolean; itemsSynced: number } =
        await ctx.runAction(internal.actions.plaid.syncAccountsForUserAdmin, {
          userId,
        });
      plaidSuccess = plaidResult.success;
      console.log(
        `[SCHEDULED SYNC] Plaid sync for ${userId}: ${plaidResult.itemsSynced} items`,
      );
    } catch (error) {
      console.error(`[SCHEDULED SYNC] Plaid sync failed for ${userId}:`, error);
    }

    // 2. Sync Snaptrade broker data
    try {
      const snaptradeResult: {
        success: boolean;
        connectionsProcessed: number;
      } = await ctx.runAction(
        internal.actions.snaptrade.syncAllForUserInternal,
        { userId },
      );
      snaptradeSuccess = snaptradeResult.success;
      console.log(
        `[SCHEDULED SYNC] Snaptrade sync for ${userId}: ${snaptradeResult.connectionsProcessed} connections`,
      );
    } catch (error) {
      console.error(
        `[SCHEDULED SYNC] Snaptrade sync failed for ${userId}:`,
        error,
      );
    }

    // 3. Sync Bitpanda data
    try {
      const bitpandaResult: { success: boolean; connectionsSynced: number } =
        await ctx.runAction(internal.actions.bitpanda.syncAllForUserInternal, {
          userId,
        });
      bitpandaSuccess = bitpandaResult.success;
      console.log(
        `[SCHEDULED SYNC] Bitpanda sync for ${userId}: ${bitpandaResult.connectionsSynced} connections`,
      );
    } catch (error) {
      console.error(
        `[SCHEDULED SYNC] Bitpanda sync failed for ${userId}:`,
        error,
      );
    }

    // 4. Take portfolio snapshot
    // The snapshot will use the latest available data in the database
    try {
      await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
        userId,
        source: "scheduled-daily",
      });
      snapshotSuccess = true;
      console.log(`[SCHEDULED SYNC] Snapshot created for ${userId}`);
    } catch (error) {
      console.error(`[SCHEDULED SYNC] Snapshot failed for ${userId}:`, error);
    }

    // Consider successful if at least one provider synced and snapshot created
    const overallSuccess =
      (plaidSuccess || snaptradeSuccess || bitpandaSuccess) && snapshotSuccess;

    return {
      success: overallSuccess,
      plaidSuccess,
      snaptradeSuccess,
      bitpandaSuccess,
      snapshotSuccess,
    };
  },
});

/**
 * Scheduled daily sync action
 * Called by the cron job to sync all users' financial data and create snapshots
 *
 * This runs automatically every day without user interaction.
 * Each user's data is synced and a portfolio snapshot is created.
 * The snapshot is used to track portfolio performance over time.
 */
export const scheduledDailySync = internalAction({
  args: {},
  returns: v.object({
    usersProcessed: v.number(),
    usersSuccessful: v.number(),
    usersFailed: v.number(),
    snapshotsCreated: v.number(),
    timestamp: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    usersProcessed: number;
    usersSuccessful: number;
    usersFailed: number;
    snapshotsCreated: number;
    timestamp: number;
  }> => {
    const timestamp = Date.now();
    console.log(
      `[SCHEDULED DAILY SYNC] Starting at ${new Date(timestamp).toISOString()}`,
    );

    // Get all unique users who have any financial connections
    const usersWithConnections: string[] = await ctx.runQuery(
      internal.portfolioSnapshots.getUsersWithConnections,
    );

    if (!usersWithConnections || usersWithConnections.length === 0) {
      console.log("[SCHEDULED DAILY SYNC] No users with connections found");
      return {
        usersProcessed: 0,
        usersSuccessful: 0,
        usersFailed: 0,
        snapshotsCreated: 0,
        timestamp,
      };
    }

    console.log(
      `[SCHEDULED DAILY SYNC] Found ${usersWithConnections.length} users to sync`,
    );

    let usersSuccessful = 0;
    let usersFailed = 0;
    let snapshotsCreated = 0;

    // Process each user sequentially to avoid overwhelming external APIs
    for (const userId of usersWithConnections) {
      try {
        const result = await ctx.runAction(
          internal.actions.syncAll.syncAllForUserInternal,
          { userId },
        );

        if (result.success) {
          usersSuccessful++;
        } else {
          usersFailed++;
        }

        if (result.snapshotSuccess) {
          snapshotsCreated++;
        }
      } catch (error) {
        console.error(
          `[SCHEDULED DAILY SYNC] Failed to sync user ${userId}:`,
          error,
        );
        usersFailed++;
      }

      // Small delay between users to be nice to external APIs
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `[SCHEDULED DAILY SYNC] Completed. Users: ${usersWithConnections.length}, ` +
        `Successful: ${usersSuccessful}, Failed: ${usersFailed}, ` +
        `Snapshots: ${snapshotsCreated}`,
    );

    return {
      usersProcessed: usersWithConnections.length,
      usersSuccessful,
      usersFailed,
      snapshotsCreated,
      timestamp,
    };
  },
});
