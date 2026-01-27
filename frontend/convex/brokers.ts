import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
// PUBLIC QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all broker connections for the current user
 */
export const getConnections = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    return await ctx.db
      .query("brokerConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get a single broker connection by ID
 */
export const getConnection = query({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await ctx.db.get(args.connectionId);

    if (!connection || connection.userId !== identity.subject) {
      return null;
    }

    return connection;
  },
});

/**
 * Get all positions for the current user
 */
export const getPositions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    return await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get positions for a specific broker connection
 */
export const getPositionsByConnection = query({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Verify ownership of connection
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== identity.subject) {
      throw new Error("Connection not found or unauthorized");
    }

    return await ctx.db
      .query("brokerPositions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();
  },
});

/**
 * Get portfolio summary with total values by asset type
 */
export const getPortfolioSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const positions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Group by asset type
    const byAssetType: Record<
      string,
      { totalValue: number; totalPnl: number; positions: number }
    > = {};

    let totalMarketValue = 0;
    let totalUnrealizedPnl = 0;

    for (const position of positions) {
      const assetType = position.assetType || "unknown";
      const marketValue = position.marketValue || 0;
      const pnl = position.unrealizedPnl || 0;

      if (!byAssetType[assetType]) {
        byAssetType[assetType] = { totalValue: 0, totalPnl: 0, positions: 0 };
      }

      byAssetType[assetType].totalValue += marketValue;
      byAssetType[assetType].totalPnl += pnl;
      byAssetType[assetType].positions += 1;

      totalMarketValue += marketValue;
      totalUnrealizedPnl += pnl;
    }

    return {
      totalMarketValue,
      totalUnrealizedPnl,
      byAssetType,
      positionCount: positions.length,
    };
  },
});

/**
 * Get positions for a specific symbol across all connections
 */
export const getPositionsBySymbol = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    return await ctx.db
      .query("brokerPositions")
      .withIndex("by_symbol", (q) =>
        q.eq("userId", userId).eq("symbol", args.symbol),
      )
      .collect();
  },
});

/**
 * Get connections that need attention (errors or disconnected)
 */
export const getConnectionsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const errorConnections = await ctx.db
      .query("brokerConnections")
      .withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", "error"),
      )
      .collect();

    const disconnectedConnections = await ctx.db
      .query("brokerConnections")
      .withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", "disconnected"),
      )
      .collect();

    return [...errorConnections, ...disconnectedConnections];
  },
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC MUTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new broker connection
 */
export const createConnection = mutation({
  args: {
    brokerType: v.string(),
    connectionName: v.string(),
    accountId: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();

    const connectionId = await ctx.db.insert("brokerConnections", {
      userId,
      brokerType: args.brokerType,
      connectionName: args.connectionName,
      status: "pending",
      accountId: args.accountId,
      username: args.username,
      createdAt: now,
      updatedAt: now,
    });

    return { connectionId };
  },
});

/**
 * Update connection status
 */
export const updateConnectionStatus = mutation({
  args: {
    connectionId: v.id("brokerConnections"),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
      v.literal("pending"),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== identity.subject) {
      throw new Error("Connection not found or unauthorized");
    }

    await ctx.db.patch(args.connectionId, {
      status: args.status,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a broker connection and all its positions
 */
export const deleteConnection = mutation({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== identity.subject) {
      throw new Error("Connection not found or unauthorized");
    }

    // Delete all positions for this connection
    const positions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    for (const position of positions) {
      await ctx.db.delete(position._id);
    }

    // Delete the connection
    await ctx.db.delete(args.connectionId);
  },
});

/**
 * Rename a broker connection
 */
export const renameConnection = mutation({
  args: {
    connectionId: v.id("brokerConnections"),
    connectionName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== identity.subject) {
      throw new Error("Connection not found or unauthorized");
    }

    await ctx.db.patch(args.connectionId, {
      connectionName: args.connectionName,
      updatedAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (for use by actions/schedulers)
// ═══════════════════════════════════════════════════════════════

/**
 * Save or update positions for a broker connection
 */
export const savePositions = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    positions: v.array(
      v.object({
        symbol: v.string(),
        name: v.optional(v.string()),
        quantity: v.number(),
        averageCost: v.optional(v.number()),
        currentPrice: v.optional(v.number()),
        marketValue: v.optional(v.number()),
        unrealizedPnl: v.optional(v.number()),
        currency: v.string(),
        assetType: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Delete existing positions for this connection
    const existingPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    for (const position of existingPositions) {
      await ctx.db.delete(position._id);
    }

    // Insert new positions
    for (const position of args.positions) {
      await ctx.db.insert("brokerPositions", {
        userId: args.userId,
        connectionId: args.connectionId,
        symbol: position.symbol,
        name: position.name,
        quantity: position.quantity,
        averageCost: position.averageCost,
        currentPrice: position.currentPrice,
        marketValue: position.marketValue,
        unrealizedPnl: position.unrealizedPnl,
        currency: position.currency,
        assetType: position.assetType,
        lastUpdated: now,
      });
    }

    // Update the connection's lastSyncAt
    await ctx.db.patch(args.connectionId, {
      lastSyncAt: now,
      status: "connected",
      updatedAt: now,
    });

    return { positionsSaved: args.positions.length };
  },
});

/**
 * Update a connection's status (internal)
 */
export const updateConnectionStatusInternal = internalMutation({
  args: {
    connectionId: v.id("brokerConnections"),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
      v.literal("pending"),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      status: args.status,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL QUERIES (for use by actions)
// ═══════════════════════════════════════════════════════════════

/**
 * Get connection by ID (internal, no auth check)
 */
export const getConnectionInternal = internalQuery({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});

/**
 * Get all connections for a user (internal, no auth check)
 */
export const getConnectionsByUserInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brokerConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
