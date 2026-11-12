"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { encrypt, decrypt } from "../lib/encryption";
import {
  validateApiKey,
  fetchTicker,
  fetchAssetWallets,
  fetchFiatWallets,
  fetchTrades,
  fetchCryptoTransactions,
  fetchFiatTransactions,
  fetchCommodityTransactions,
  normalizeHoldings,
  normalizeTransactions,
  BitpandaAuthError,
} from "../lib/bitpanda";
import {
  classifyBitpandaPosition,
  getClassificationFields,
} from "../../../services/classification/engine";
import { scheduledSyncEnabled } from "../lib/scheduledSync";
import { providerSyncSnapshot } from "../../../services/portfolio/aggregate";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getEncryptionKey(): string {
  const key = process.env.CONVEX_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CONVEX_ENCRYPTION_KEY environment variable not set");
  }
  return key;
}

// ═══════════════════════════════════════════════════════════════
// CONNECT / DISCONNECT
// ═══════════════════════════════════════════════════════════════

/**
 * Connect a Bitpanda account by validating and storing a read-only API key,
 * then running an initial sync.
 */
export const connect = action({
  args: {
    apiKey: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; connectionId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const apiKey = args.apiKey.trim();

    if (!apiKey) throw new Error("API key is required");

    // Validate the key against Bitpanda before persisting anything
    try {
      await validateApiKey(apiKey);
    } catch (error) {
      if (error instanceof BitpandaAuthError) {
        throw new Error(
          "That Bitpanda API key was rejected. Make sure it's a valid read-only key.",
        );
      }
      throw error;
    }

    const encryptedKey = encrypt(apiKey, getEncryptionKey());

    const connectionId = await ctx.runMutation(
      internal.bitpanda.createConnection,
      { userId, apiKey: encryptedKey, label: args.label },
    );

    // Initial sync (holdings + transactions), then snapshot
    const holdingsSync: { ok: boolean } = await ctx.runAction(
      internal.actions.bitpanda.syncConnectionInternal,
      { userId, connectionId },
    );
    await ctx.runAction(internal.actions.bitpanda.syncTransactionsInternal, {
      userId,
      connectionId,
    });

    // A failed holdings sync is shown on the connection; no snapshot of it
    if (holdingsSync.ok) {
      await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
        userId,
        source: "bitpanda",
      });
    }

    return { success: true, connectionId };
  },
});

/**
 * Disconnect a Bitpanda account and remove all of its data.
 */
export const deleteConnection = action({
  args: { connectionId: v.id("bitpandaConnections") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const connection = await ctx.runQuery(
      internal.bitpanda.getConnectionInternal,
      { connectionId: args.connectionId },
    );
    if (!connection || connection.userId !== userId) {
      throw new Error("Connection not found or unauthorized");
    }

    await ctx.runMutation(internal.bitpanda.deleteConnectionData, {
      connectionId: args.connectionId,
    });

    await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
      userId,
      source: "bitpanda-disconnect",
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// SYNC (user-triggered)
// ═══════════════════════════════════════════════════════════════

/**
 * Re-sync a single Bitpanda connection.
 */
export const syncConnection = action({
  args: { connectionId: v.id("bitpandaConnections") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const connection = await ctx.runQuery(
      internal.bitpanda.getConnectionInternal,
      { connectionId: args.connectionId },
    );
    if (!connection || connection.userId !== userId) {
      throw new Error("Connection not found or unauthorized");
    }

    const holdingsSync: { ok: boolean } = await ctx.runAction(
      internal.actions.bitpanda.syncConnectionInternal,
      { userId, connectionId: args.connectionId },
    );
    await ctx.runAction(internal.actions.bitpanda.syncTransactionsInternal, {
      userId,
      connectionId: args.connectionId,
    });

    // Snapshot only holdings that synced; a failure stays on the connection
    if (holdingsSync.ok) {
      await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
        userId,
        source: "bitpanda",
      });
    }

    return { success: holdingsSync.ok };
  },
});

/**
 * Re-sync all of the current user's Bitpanda connections.
 */
export const syncAllConnections = action({
  args: { skipSnapshot: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ success: boolean; count: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const connections = await ctx.runQuery(
      internal.bitpanda.getConnectionsByUserInternal,
      { userId },
    );

    let synced = 0;
    for (const connection of connections) {
      try {
        const holdingsSync: { ok: boolean } = await ctx.runAction(
          internal.actions.bitpanda.syncConnectionInternal,
          { userId, connectionId: connection._id },
        );
        if (holdingsSync.ok) synced++;
        await ctx.runAction(
          internal.actions.bitpanda.syncTransactionsInternal,
          { userId, connectionId: connection._id },
        );
      } catch (error) {
        console.error(
          `Error syncing Bitpanda connection ${connection._id}:`,
          error,
        );
      }
    }

    // No snapshot when every connection failed; tagged partial when only
    // some did
    const failed = connections.length - synced;
    const snapshot = providerSyncSnapshot(synced, failed);
    if (!args.skipSnapshot && snapshot.take) {
      try {
        await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
          userId,
          source: "bitpanda",
          partial: snapshot.partial,
        });
      } catch (snapshotError) {
        console.error("Failed to take portfolio snapshot:", snapshotError);
      }
    }

    return { success: failed === 0, count: connections.length };
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL SYNC ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch holdings from Bitpanda, classify them, and persist. A failure is
 * recorded on the connection and returned as `ok: false` (the stored
 * holdings are left as they were).
 */
export const syncConnectionInternal = internalAction({
  args: {
    userId: v.string(),
    connectionId: v.id("bitpandaConnections"),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const connection = await ctx.runQuery(
      internal.bitpanda.getConnectionInternal,
      { connectionId: args.connectionId },
    );
    if (!connection) return { ok: false };

    await ctx.runMutation(internal.bitpanda.updateConnectionStatus, {
      connectionId: args.connectionId,
      status: "syncing",
    });

    try {
      const apiKey = decrypt(connection.apiKey, getEncryptionKey());

      const [assetWallets, fiatWallets, ticker] = await Promise.all([
        fetchAssetWallets(apiKey),
        fetchFiatWallets(apiKey),
        fetchTicker(),
      ]);

      const normalized = normalizeHoldings(assetWallets, fiatWallets, ticker);
      const now = Date.now();

      const holdings = normalized.map((h) => {
        const classification = classifyBitpandaPosition({
          assetType: h.assetType,
          symbol: h.symbol,
          name: h.name ?? null,
        });
        const fields = getClassificationFields(classification);

        return {
          assetType: h.assetType,
          symbol: h.symbol,
          name: h.name,
          quantity: h.quantity,
          currentPrice: h.currentPrice,
          marketValue: h.marketValue,
          currency: h.currency,
          investmentCategory: fields.investmentCategory,
          investmentSubcategory: fields.investmentSubcategory,
          classificationSource: fields.classificationSource,
          classificationRule: fields.classificationRule,
          // Holdings are already valued in EUR by the normalizer. Fiat
          // holdings retain the actual native→EUR rate used for traceability.
          // syncHoldings swaps in the last known price where the ticker had
          // none (holdingPrice.ts).
          valueInBaseCurrency: h.marketValue,
          exchangeRateUsed:
            h.assetType === "fiat" ? h.currentPrice : 1,
          exchangeRateTimestamp: now,
          baseCurrency: "EUR",
        };
      });

      await ctx.runMutation(internal.bitpanda.syncHoldings, {
        userId: args.userId,
        connectionId: args.connectionId,
        holdings,
      });

      await ctx.runMutation(internal.bitpanda.updateConnectionStatus, {
        connectionId: args.connectionId,
        status: "active",
        lastSyncAt: now,
      });
      return { ok: true };
    } catch (error) {
      console.error("Bitpanda sync error:", error);
      const isAuth = error instanceof BitpandaAuthError;
      await ctx.runMutation(internal.bitpanda.updateConnectionStatus, {
        connectionId: args.connectionId,
        status: "error",
        errorMessage: isAuth
          ? "Your Bitpanda API key is no longer valid. Please reconnect with a new read-only key."
          : error instanceof Error
            ? error.message
            : String(error),
      });
      return { ok: false };
    }
  },
});

/**
 * Fetch trades + transactions from Bitpanda and persist.
 * Transaction failures don't flip the connection into an error state
 * (holdings are the critical data).
 */
export const syncTransactionsInternal = internalAction({
  args: {
    userId: v.string(),
    connectionId: v.id("bitpandaConnections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(
      internal.bitpanda.getConnectionInternal,
      { connectionId: args.connectionId },
    );
    if (!connection) return;

    try {
      const apiKey = decrypt(connection.apiKey, getEncryptionKey());

      const [trades, cryptoTransactions, fiatTransactions, commodityTransactions] =
        await Promise.all([
          fetchTrades(apiKey),
          fetchCryptoTransactions(apiKey),
          fetchFiatTransactions(apiKey),
          fetchCommodityTransactions(apiKey),
        ]);

      const transactions = normalizeTransactions({
        trades,
        cryptoTransactions,
        fiatTransactions,
        commodityTransactions,
      });

      if (transactions.length > 0) {
        await ctx.runMutation(internal.bitpanda.syncTransactions, {
          userId: args.userId,
          connectionId: args.connectionId,
          transactions,
        });
      }
    } catch (error) {
      console.error("Bitpanda transaction sync error:", error);
    }
  },
});

/**
 * Scheduled (cron) sync of all Bitpanda connections.
 */
export const scheduledSyncAllAction = internalAction({
  args: {},
  handler: async (ctx): Promise<{ count: number }> => {
    if (!scheduledSyncEnabled()) {
      console.log(
        "[BITPANDA SCHEDULED SYNC] Skipped: SCHEDULED_SYNC_ENABLED is not true on this deployment",
      );
      return { count: 0 };
    }
    const connections: Array<{ connectionId: string; userId: string }> =
      await ctx.runMutation(internal.bitpanda.scheduledSyncAll);

    if (!connections || connections.length === 0) {
      return { count: 0 };
    }

    for (const connection of connections) {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.bitpanda.syncConnectionInternal,
        {
          userId: connection.userId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          connectionId: connection.connectionId as any,
        },
      );
      await ctx.scheduler.runAfter(
        5000,
        internal.actions.bitpanda.syncTransactionsInternal,
        {
          userId: connection.userId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          connectionId: connection.connectionId as any,
        },
      );
    }

    return { count: connections.length };
  },
});

/**
 * Internal: sync all Bitpanda data for one user (used by the daily sync).
 */
export const syncAllForUserInternal = internalAction({
  args: { userId: v.string() },
  returns: v.object({
    success: v.boolean(),
    connectionsSynced: v.number(),
  }),
  handler: async (
    ctx,
    { userId },
  ): Promise<{ success: boolean; connectionsSynced: number }> => {
    const connections = await ctx.runQuery(
      internal.bitpanda.getConnectionsByUserInternal,
      { userId },
    );

    if (!connections || connections.length === 0) {
      return { success: true, connectionsSynced: 0 };
    }

    let connectionsSynced = 0;
    for (const connection of connections) {
      try {
        const holdingsSync: { ok: boolean } = await ctx.runAction(
          internal.actions.bitpanda.syncConnectionInternal,
          { userId, connectionId: connection._id },
        );
        await ctx.runAction(
          internal.actions.bitpanda.syncTransactionsInternal,
          { userId, connectionId: connection._id },
        );
        if (holdingsSync.ok) connectionsSynced++;
      } catch (error) {
        console.error(
          `[BITPANDA SCHEDULED] Failed to sync connection ${connection._id}:`,
          error,
        );
      }
    }

    // Every connection must sync for the daily snapshot to be complete
    return {
      success: connectionsSynced === connections.length,
      connectionsSynced,
    };
  },
});
