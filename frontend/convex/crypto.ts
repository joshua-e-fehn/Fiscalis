import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════
// VEZGO USER QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get Vezgo user registration status for the current user
 */
export const getVezgoUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const user = await ctx.db
      .query("vezgoUsers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Don't expose the encrypted token to the client
    if (user) {
      return {
        _id: user._id,
        userId: user.userId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }
    return null;
  },
});

/**
 * Internal query to get Vezgo user with token (for actions)
 */
export const getVezgoUserInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vezgoUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// ═══════════════════════════════════════════════════════════════
// CONNECTION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all crypto connections for the current user
 */
export const getConnections = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    return await ctx.db
      .query("vezgoConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get connections filtered by category
 * A connection can have multiple categories, so we filter for any that include the specified category
 */
export const getConnectionsByCategory = query({
  args: {
    category: v.union(
      v.literal("exchange"),
      v.literal("wallet"),
      v.literal("blockchain"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    // Get all user connections and filter by category
    const connections = await ctx.db
      .query("vezgoConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return connections.filter((c) => c.categories.includes(args.category));
  },
});

/**
 * Get a single connection
 */
export const getConnection = query({
  args: { connectionId: v.id("vezgoConnections") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const connection = await ctx.db.get(args.connectionId);

    if (!connection || connection.userId !== identity.subject) {
      return null;
    }

    return connection;
  },
});

/**
 * Internal query to get connection (for actions)
 */
export const getConnectionInternal = internalQuery({
  args: { connectionId: v.id("vezgoConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});

/**
 * Internal query to get connection by Vezgo account ID
 */
export const getConnectionByAccountId = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vezgoConnections")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();
  },
});

/**
 * Internal query to get all connections for a user
 */
export const getConnectionsByUserInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vezgoConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get connections that need attention (errors)
 */
export const getConnectionsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    return await ctx.db
      .query("vezgoConnections")
      .withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", "error"),
      )
      .collect();
  },
});

// ═══════════════════════════════════════════════════════════════
// POSITION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all crypto positions for the current user
 */
export const getPositions = query({
  args: {
    connectionId: v.optional(v.id("vezgoConnections")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    if (args.connectionId) {
      // Verify ownership
      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== userId) {
        return [];
      }

      return await ctx.db
        .query("vezgoPositions")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", args.connectionId!),
        )
        .collect();
    }

    return await ctx.db
      .query("vezgoPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get positions filtered by category
 */
export const getPositionsByCategory = query({
  args: {
    category: v.union(
      v.literal("cryptocurrency"),
      v.literal("token"),
      v.literal("stablecoin"),
      v.literal("defi"),
      v.literal("nft"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;

    return await ctx.db
      .query("vezgoPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("category", args.category),
      )
      .collect();
  },
});

/**
 * Get total crypto portfolio value
 */
export const getTotalValue = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const positions = await ctx.db
      .query("vezgoPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const totalValue = positions.reduce(
      (sum, p) => sum + (p.fiatValue || 0),
      0,
    );

    const byCategory = positions.reduce(
      (acc, p) => {
        const category = p.category;
        acc[category] = (acc[category] || 0) + (p.fiatValue || 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalValue,
      byCategory,
      positionCount: positions.length,
      currency: positions[0]?.fiatCurrency || "USD",
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// TRANSACTION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get transactions for the current user
 */
export const getTransactions = query({
  args: {
    connectionId: v.optional(v.id("vezgoConnections")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;
    const limit = args.limit || 50;

    if (args.connectionId) {
      // Verify ownership
      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== userId) {
        return [];
      }

      return await ctx.db
        .query("vezgoTransactions")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", args.connectionId!),
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("vezgoTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Upsert Vezgo user
 */
export const upsertVezgoUser = internalMutation({
  args: {
    userId: v.string(),
    vezgoToken: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("vezgoUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        vezgoToken: args.vezgoToken,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("vezgoUsers", {
      userId: args.userId,
      vezgoToken: args.vezgoToken,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Delete Vezgo user
 */
export const deleteVezgoUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("vezgoUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

/**
 * Create a new connection
 */
export const createConnection = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.string(),
    provider: v.string(),
    categories: v.array(
      v.union(
        v.literal("exchange"),
        v.literal("wallet"),
        v.literal("blockchain"),
      ),
    ),
    name: v.string(),
    logo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("vezgoConnections", {
      userId: args.userId,
      accountId: args.accountId,
      provider: args.provider,
      categories: args.categories,
      name: args.name,
      logo: args.logo,
      status: "syncing",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update connection status
 */
export const updateConnectionStatus = internalMutation({
  args: {
    connectionId: v.id("vezgoConnections"),
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

/**
 * Update connection categories
 * Allows users to manually adjust the categories for a connection
 */
export const updateConnectionCategories = mutation({
  args: {
    connectionId: v.id("vezgoConnections"),
    categories: v.array(
      v.union(
        v.literal("exchange"),
        v.literal("wallet"),
        v.literal("blockchain"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }

    const userId = identity.subject;
    if (connection.userId !== userId) {
      throw new Error("Not authorized to update this connection");
    }

    if (args.categories.length === 0) {
      throw new Error("At least one category is required");
    }

    await ctx.db.patch(args.connectionId, {
      categories: args.categories,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete connection and all its data
 */
export const deleteConnectionData = internalMutation({
  args: { connectionId: v.id("vezgoConnections") },
  handler: async (ctx, args) => {
    // Delete positions
    const positions = await ctx.db
      .query("vezgoPositions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    for (const position of positions) {
      await ctx.db.delete(position._id);
    }

    // Delete transactions
    const transactions = await ctx.db
      .query("vezgoTransactions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    for (const transaction of transactions) {
      await ctx.db.delete(transaction._id);
    }

    // Delete connection
    await ctx.db.delete(args.connectionId);
  },
});

/**
 * Sync positions for a connection
 */
export const syncPositions = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("vezgoConnections"),
    positions: v.array(
      v.object({
        symbol: v.string(),
        name: v.optional(v.string()),
        ticker: v.optional(v.string()),
        quantity: v.number(),
        fiatValue: v.optional(v.number()),
        fiatCurrency: v.string(),
        category: v.union(
          v.literal("cryptocurrency"),
          v.literal("token"),
          v.literal("stablecoin"),
          v.literal("defi"),
          v.literal("nft"),
        ),
        protocol: v.optional(v.string()),
        poolName: v.optional(v.string()),
        apy: v.optional(v.number()),
        contractAddress: v.optional(v.string()),
        tokenId: v.optional(v.string()),
        collectionName: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        chain: v.optional(v.string()),
        address: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Delete existing positions for this connection
    const existing = await ctx.db
      .query("vezgoPositions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    for (const pos of existing) {
      await ctx.db.delete(pos._id);
    }

    // Insert new positions
    for (const position of args.positions) {
      await ctx.db.insert("vezgoPositions", {
        userId: args.userId,
        connectionId: args.connectionId,
        ...position,
        lastSyncAt: now,
      });
    }
  },
});

/**
 * Sync transactions for a connection
 */
export const syncTransactions = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("vezgoConnections"),
    transactions: v.array(
      v.object({
        vezgoTransactionId: v.string(),
        type: v.union(
          v.literal("buy"),
          v.literal("sell"),
          v.literal("transfer_in"),
          v.literal("transfer_out"),
          v.literal("swap"),
          v.literal("stake"),
          v.literal("unstake"),
          v.literal("reward"),
          v.literal("airdrop"),
          v.literal("mint"),
          v.literal("burn"),
          v.literal("fee"),
          v.literal("other"),
        ),
        symbol: v.string(),
        quantity: v.number(),
        fiatValue: v.optional(v.number()),
        fiatCurrency: v.string(),
        fee: v.optional(v.number()),
        feeCurrency: v.optional(v.string()),
        fromAddress: v.optional(v.string()),
        toAddress: v.optional(v.string()),
        txHash: v.optional(v.string()),
        chain: v.optional(v.string()),
        transactionDate: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get existing transaction IDs for this connection to avoid duplicates
    const existingTxs = await ctx.db
      .query("vezgoTransactions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    const existingIds = new Set(existingTxs.map((tx) => tx.vezgoTransactionId));

    // Only insert new transactions
    for (const tx of args.transactions) {
      if (!existingIds.has(tx.vezgoTransactionId)) {
        await ctx.db.insert("vezgoTransactions", {
          userId: args.userId,
          connectionId: args.connectionId,
          ...tx,
          createdAt: now,
        });
      }
    }
  },
});

/**
 * Scheduled sync for all crypto connections
 * Called by cron job - returns connections that need to be synced
 */
export const scheduledSyncAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all active connections
    const connections = await ctx.db
      .query("vezgoConnections")
      .filter((q) => q.neq(q.field("status"), "disconnected"))
      .collect();

    // Return connections that need to be synced
    // The actual sync will be triggered by the calling action
    return connections.map((c) => ({
      connectionId: c._id,
      accountId: c.accountId,
      userId: c.userId,
    }));
  },
});
