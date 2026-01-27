import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
// MIGRATION INTERNAL MUTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a broker connection with full control over timestamps (for migration)
 */
export const createBrokerConnectionInternal = internalMutation({
  args: {
    userId: v.string(),
    brokerType: v.string(),
    connectionName: v.string(),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
      v.literal("pending"),
    ),
    accountId: v.optional(v.string()),
    username: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const connectionId = await ctx.db.insert("brokerConnections", {
      userId: args.userId,
      brokerType: args.brokerType,
      connectionName: args.connectionName,
      status: args.status,
      accountId: args.accountId,
      username: args.username,
      lastSyncAt: args.lastSyncAt,
      errorMessage: args.errorMessage,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    return connectionId;
  },
});
