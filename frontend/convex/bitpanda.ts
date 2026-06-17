import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
// CONNECTION QUERIES
// ═══════════════════════════════════════════════════════════════

/** Strip the encrypted API key before returning a connection to the client. */
function sanitizeConnection<
  T extends { apiKey?: string },
>(connection: T): Omit<T, "apiKey"> {
  const { apiKey: _apiKey, ...rest } = connection;
  void _apiKey;
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
 * Get connections that need attention (in an error state).
 */
export const getConnectionsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const connections = await ctx.db
      .query("bitpandaConnections")
      .withIndex("by_status", (q) =>
        q.eq("userId", identity.subject).eq("status", "error"),
      )
      .collect();

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

/**
 * Get Bitpanda transactions for the current user, optionally for one connection.
 */
export const getTransactions = query({
  args: { connectionId: v.optional(v.id("bitpandaConnections")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    if (args.connectionId) {
      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== userId) return [];

      return await ctx.db
        .query("bitpandaTransactions")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", args.connectionId!),
        )
        .collect();
    }

    return await ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
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
      v.literal("syncing"),
      v.literal("disconnected"),
    ),
    errorMessage: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      status: args.status,
      errorMessage: args.errorMessage,
      lastSyncAt: args.lastSyncAt,
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
 * (matched by assetType + symbol) across the re-sync.
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
    for (const h of existing) {
      if (h.userCategoryOverride || h.userSubcategoryOverride) {
        overrides.set(`${h.assetType}:${h.symbol}`, {
          category: h.userCategoryOverride ?? undefined,
          subcategory: h.userSubcategoryOverride ?? undefined,
        });
      }
      await ctx.db.delete(h._id);
    }

    for (const holding of args.holdings) {
      const override = overrides.get(`${holding.assetType}:${holding.symbol}`);
      await ctx.db.insert("bitpandaHoldings", {
        userId: args.userId,
        connectionId: args.connectionId,
        ...holding,
        // Re-apply preserved user overrides
        userCategoryOverride: override?.category,
        userSubcategoryOverride: override?.subcategory,
        // If overridden, the effective category reflects the override
        investmentCategory: override?.category ?? holding.investmentCategory,
        investmentSubcategory:
          override?.subcategory ?? holding.investmentSubcategory,
        classificationSource: override ? "user_override" : holding.classificationSource,
        lastSyncAt: now,
        createdAt: now,
      });
    }
  },
});

/** Replace a connection's transactions (insert new ones, dedup by id). */
export const syncTransactions = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("bitpandaConnections"),
    transactions: v.array(
      v.object({
        bitpandaTransactionId: v.string(),
        type: v.string(),
        symbol: v.string(),
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

    // Replace the connection's transactions. The incoming list is already
    // deduplicated by the normalizer, so a full replace both reflects the
    // latest data and heals any duplicates stored by earlier syncs.
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
 * Set or clear a user's manual category override for a single holding.
 */
export const setUserOverride = mutation({
  args: {
    holdingId: v.id("bitpandaHoldings"),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const holding = await ctx.db.get(args.holdingId);
    if (!holding || holding.userId !== identity.subject) {
      throw new Error("Holding not found or unauthorized");
    }

    const hasOverride = Boolean(args.category || args.subcategory);

    await ctx.db.patch(args.holdingId, {
      userCategoryOverride: args.category,
      userSubcategoryOverride: args.subcategory,
      investmentCategory: args.category ?? holding.investmentCategory,
      investmentSubcategory: args.subcategory ?? holding.investmentSubcategory,
      classificationSource: hasOverride ? "user_override" : "auto",
    });

    return { success: true };
  },
});
