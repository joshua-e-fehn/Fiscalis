import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { getBitpandaHoldingIdentityKeys } from "../../services/bitpanda/identity";
import {
  resolveHoldingPrice,
  type PreviousHoldingPrice,
} from "../../services/bitpanda/holdingPrice";
import { bitpandaOverridePatch } from "./lib/classificationOverride";
import { getOwnedDoc, requireUserId } from "./lib/auth";
import { ensureSyncTarget } from "./lib/syncTargets";
import {
  isInSyncWindow,
  syncWindowIndexLowerBound,
} from "../../services/banking/transactionSync";

// ═══════════════════════════════════════════════════════════════
// CONNECTION QUERIES
// ═══════════════════════════════════════════════════════════════

/** Strip the encrypted API key before returning a connection to the client. */
function sanitizeConnection<
  T extends { apiKey?: string },
>(connection: T): Omit<T, "apiKey"> {
  const { apiKey: _apiKey, ...rest } = connection;
  return rest;
}

/**
 * Get all Bitpanda connections for the current user (without the API key).
 */
export const getConnections = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const connections = await ctx.db
      .query("bitpandaConnections")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    return connections.map(sanitizeConnection);
  },
});

/**
 * Get a single Bitpanda connection (without the API key).
 */
export const getConnection = query({
  args: { connectionId: v.id("bitpandaConnections") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== identity.subject) return null;

    return sanitizeConnection(connection);
  },
});

/**
 * Get connections that need the user's attention: a rejected key or an
 * unexpected error. A transient_error retries on its own and is left out.
 */
export const getConnectionsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const connections = [];
    for (const status of ["error", "needs_reauth"] as const) {
      connections.push(
        ...(await ctx.db
          .query("bitpandaConnections")
          .withIndex("by_status", (q) =>
            q.eq("userId", identity.subject).eq("status", status),
          )
          .collect()),
      );
    }

    return connections.map(sanitizeConnection);
  },
});

/** Internal: get a connection (with API key) for use inside actions. */
export const getConnectionInternal = internalQuery({
  args: { connectionId: v.id("bitpandaConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});

/** Internal: all connections for a user (with API key) for use inside actions. */
export const getConnectionsByUserInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bitpandaConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// ═══════════════════════════════════════════════════════════════
// HOLDING QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all Bitpanda holdings for the current user, optionally for one connection.
 */
export const getHoldings = query({
  args: { connectionId: v.optional(v.id("bitpandaConnections")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    if (args.connectionId) {
      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== userId) return [];

      return await ctx.db
        .query("bitpandaHoldings")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", args.connectionId!),
        )
        .collect();
    }

    return await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get Bitpanda holdings filtered by investment category.
 */
export const getHoldingsByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_category", (q) =>
        q.eq("userId", identity.subject).eq("investmentCategory", args.category),
      )
      .collect();
  },
});

/** Upper bound on the transactions getTransactions returns. */
const MAX_TRANSACTIONS = 500;

/**
 * The current user's newest Bitpanda transactions (at most `limit`, capped
 * at MAX_TRANSACTIONS), optionally for one connection.
 */
export const getTransactions = query({
  args: {
    connectionId: v.optional(v.id("bitpandaConnections")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requested = args.limit ?? MAX_TRANSACTIONS;
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(1, Math.floor(requested)), MAX_TRANSACTIONS)
      : MAX_TRANSACTIONS;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    if (args.connectionId) {
      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== userId) return [];

      return await ctx.db
        .query("bitpandaTransactions")
        .withIndex("by_connection_date", (q) =>
          q.eq("connectionId", args.connectionId!),
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

// ═══════════════════════════════════════════════════════════════
// CONNECTION MUTATIONS (internal)
// ═══════════════════════════════════════════════════════════════

/** Internal: create a connection with an already-encrypted API key. */
export const createConnection = internalMutation({
  args: {
    userId: v.string(),
    apiKey: v.string(), // encrypted
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ensureSyncTarget(ctx, args.userId);
    return await ctx.db.insert("bitpandaConnections", {
      userId: args.userId,
      apiKey: args.apiKey,
      label: args.label,
      status: "syncing",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Internal: update a connection's sync status. */
export const updateConnectionStatus = internalMutation({
  args: {
    connectionId: v.id("bitpandaConnections"),
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("needs_reauth"),
      v.literal("transient_error"),
      v.literal("syncing"),
      v.literal("disconnected"),
    ),
    errorMessage: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // errorMessage is cleared when absent; lastSyncAt is only ever moved
    // forward, so a failed or in-progress sync keeps the last good time
    // (as brokers.updateConnectionStatus)
    await ctx.db.patch(args.connectionId, {
      status: args.status,
      errorMessage: args.errorMessage,
      ...(args.lastSyncAt !== undefined ? { lastSyncAt: args.lastSyncAt } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Internal: delete a connection and all its holdings + transactions. */
export const deleteConnectionData = internalMutation({
  args: { connectionId: v.id("bitpandaConnections") },
  handler: async (ctx, args) => {
    const holdings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();
    for (const h of holdings) await ctx.db.delete(h._id);

    const transactions = await ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();
    for (const t of transactions) await ctx.db.delete(t._id);

    await ctx.db.delete(args.connectionId);
  },
});

// ═══════════════════════════════════════════════════════════════
// SYNC MUTATIONS (internal)
// ═══════════════════════════════════════════════════════════════

const holdingValidator = v.object({
  assetType: v.string(),
  symbol: v.string(),
  name: v.optional(v.string()),
  quantity: v.number(),
  currentPrice: v.optional(v.number()),
  marketValue: v.optional(v.number()),
  currency: v.string(),
  investmentCategory: v.string(),
  investmentSubcategory: v.string(),
  classificationSource: v.string(),
  classificationRule: v.string(),
  valueInBaseCurrency: v.optional(v.number()),
  exchangeRateUsed: v.optional(v.number()),
  exchangeRateTimestamp: v.optional(v.number()),
  baseCurrency: v.optional(v.string()),
});

/**
 * Replace a connection's holdings, preserving any per-holding user overrides
 * (matched by assetType + symbol) across the re-sync. A holding the ticker
 * did not price keeps the stored row's last price, flagged stale
 * (services/bitpanda/holdingPrice.ts resolveHoldingPrice).
 */
export const syncHoldings = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("bitpandaConnections"),
    holdings: v.array(holdingValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Capture existing overrides before deleting
    const existing = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    const overrides = new Map<
      string,
      { category?: string; subcategory?: string }
    >();
    const previousPrices = new Map<string, PreviousHoldingPrice>();
    for (const h of existing) {
      for (const key of getBitpandaHoldingIdentityKeys(h.assetType, h.symbol)) {
        previousPrices.set(key, {
          currentPrice: h.currentPrice,
          // Rows stored before priceAsOf were priced by the sync that wrote them
          priceAsOf: h.priceAsOf ?? h.lastSyncAt ?? h.createdAt,
        });
      }
      if (h.userCategoryOverride || h.userSubcategoryOverride) {
        for (const key of getBitpandaHoldingIdentityKeys(
          h.assetType,
          h.symbol,
        )) {
          overrides.set(key, {
            category: h.userCategoryOverride ?? undefined,
            subcategory: h.userSubcategoryOverride ?? undefined,
          });
        }
      }
      await ctx.db.delete(h._id);
    }

    for (const holding of args.holdings) {
      const identityKeys = getBitpandaHoldingIdentityKeys(
        holding.assetType,
        holding.symbol,
      );
      const override = identityKeys
        .map((key) => overrides.get(key))
        .find((value) => value !== undefined);
      const price = resolveHoldingPrice({
        quantity: holding.quantity,
        livePrice: holding.currentPrice,
        previous: identityKeys
          .map((key) => previousPrices.get(key))
          .find((value) => value !== undefined),
        now,
      });
      await ctx.db.insert("bitpandaHoldings", {
        userId: args.userId,
        connectionId: args.connectionId,
        ...holding,
        currentPrice: price.currentPrice,
        marketValue: price.marketValue,
        valueInBaseCurrency: price.marketValue,
        priceStatus: price.priceStatus,
        priceAsOf: price.priceAsOf,
        // A fiat holding's price is its EUR rate
        ...(holding.assetType === "fiat"
          ? {
              exchangeRateUsed: price.currentPrice,
              exchangeRateTimestamp: price.priceAsOf,
            }
          : {}),
        // Re-apply preserved user overrides
        userCategoryOverride: override?.category,
        userSubcategoryOverride: override?.subcategory,
        // If overridden, the effective category reflects the override
        investmentCategory: override?.category ?? holding.investmentCategory,
        investmentSubcategory:
          override?.subcategory ?? holding.investmentSubcategory,
        classificationSource: override
          ? "user_override"
          : holding.classificationSource,
        lastSyncAt: now,
        createdAt: now,
      });
    }
  },
});

/**
 * Where a connection's transaction sync stands: the newest stored
 * transaction date and the last full sync (actions/bitpanda.ts).
 */
export const getTransactionSyncStateInternal = internalQuery({
  args: { connectionId: v.id("bitpandaConnections") },
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.db.get(connectionId);
    const newest = await ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_connection_date", (q) => q.eq("connectionId", connectionId))
      .order("desc")
      .first();
    return {
      newestTransactionDate: newest?.transactionDate,
      transactionsFullSyncAt: connection?.transactionsFullSyncAt,
    };
  },
});

/**
 * Store a connection's transactions. Without `cutoff` (a full sync) the
 * stored rows are replaced: the incoming list is already deduplicated by
 * the normalizer, so a full replace both reflects the latest data and heals
 * any duplicates stored by earlier syncs. With `cutoff` (an incremental
 * sync, ENG-230) only the window from the cutoff on is replaced: incoming
 * rows in it are upserted by id, stored rows in it that Bitpanda no longer
 * lists are deleted, and older rows are left as they are.
 */
export const syncTransactions = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("bitpandaConnections"),
    cutoff: v.optional(v.string()),
    transactions: v.array(
      v.object({
        bitpandaTransactionId: v.string(),
        type: v.string(),
        symbol: v.string(),
        assetType: v.optional(v.string()),
        quantity: v.number(),
        price: v.optional(v.number()),
        amount: v.number(),
        currency: v.string(),
        fees: v.optional(v.number()),
        transactionDate: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== args.userId) return;

    if (args.cutoff === undefined) {
      const existing = await ctx.db
        .query("bitpandaTransactions")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", args.connectionId),
        )
        .collect();
      for (const tx of existing) {
        await ctx.db.delete(tx._id);
      }
      for (const tx of args.transactions) {
        await ctx.db.insert("bitpandaTransactions", {
          userId: args.userId,
          connectionId: args.connectionId,
          ...tx,
          createdAt: now,
        });
      }
      await ctx.db.patch(args.connectionId, { transactionsFullSyncAt: now });
      return;
    }

    const cutoff = args.cutoff;
    // Older incoming rows are skipped: their cross-endpoint copies may lie
    // outside what this sync read, so they could not be deduplicated
    const incoming = args.transactions.filter((tx) =>
      isInSyncWindow(tx.transactionDate, cutoff),
    );
    const incomingIds = new Set(incoming.map((tx) => tx.bitpandaTransactionId));
    // Stored dates carry UTC offsets (+02:00), so the index range is a
    // superset and the window itself is decided by instant, exactly as for
    // the incoming rows above
    const nearWindow = await ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_connection_date", (q) =>
        q
          .eq("connectionId", args.connectionId)
          .gte("transactionDate", syncWindowIndexLowerBound(cutoff)),
      )
      .collect();
    const storedById = new Map(
      nearWindow.map((tx) => [tx.bitpandaTransactionId, tx]),
    );
    for (const tx of nearWindow) {
      if (
        isInSyncWindow(tx.transactionDate, cutoff) &&
        !incomingIds.has(tx.bitpandaTransactionId)
      ) {
        await ctx.db.delete(tx._id);
      }
    }
    for (const tx of incoming) {
      const existing =
        storedById.get(tx.bitpandaTransactionId) ??
        (await ctx.db
          .query("bitpandaTransactions")
          .withIndex("by_bitpanda_id", (q) =>
            q.eq("bitpandaTransactionId", tx.bitpandaTransactionId),
          )
          .filter((q) => q.eq(q.field("connectionId"), args.connectionId))
          .first());
      if (existing) {
        await ctx.db.patch(existing._id, tx);
      } else {
        await ctx.db.insert("bitpandaTransactions", {
          userId: args.userId,
          connectionId: args.connectionId,
          ...tx,
          createdAt: now,
        });
      }
    }
  },
});

/** Scheduled sync helper: return all non-disconnected connections. */
export const scheduledSyncAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("bitpandaConnections")
      .filter((q) => q.neq(q.field("status"), "disconnected"))
      .collect();

    return connections.map((c) => ({
      connectionId: c._id,
      userId: c.userId,
    }));
  },
});

// ═══════════════════════════════════════════════════════════════
// USER OVERRIDE MUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Set or clear a user's manual category override for a single holding of
 * the signed-in user. An override is checked against the taxonomy; a side
 * left out keeps the holding's current value. Clearing re-runs the rule
 * engine, so the holding is filed under its automatic category straight
 * away (lib/classificationOverride.ts bitpandaOverridePatch).
 */
export const setUserOverride = mutation({
  args: {
    holdingId: v.id("bitpandaHoldings"),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const holding = await getOwnedDoc(ctx, userId, args.holdingId);
    if (!holding) throw new Error("Holding not found");

    await ctx.db.patch(
      holding._id,
      bitpandaOverridePatch(holding, args.category, args.subcategory),
    );
    return { success: true };
  },
});
