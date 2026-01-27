import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ═══════════════════════════════════════════════════════════════
  // BANKING (Plaid)
  // ═══════════════════════════════════════════════════════════════

  plaidItems: defineTable({
    userId: v.string(), // Clerk user ID
    accessToken: v.string(), // Encrypted with AES-256-GCM
    itemId: v.string(), // Plaid item ID
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("pending_reauth"),
    ),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"]),

  plaidAccounts: defineTable({
    userId: v.string(),
    itemId: v.string(), // Reference to plaidItems.itemId
    accountId: v.string(), // Plaid account ID
    name: v.string(),
    officialName: v.optional(v.string()),
    type: v.string(), // checking, savings, credit, investment, etc.
    subtype: v.optional(v.string()),
    mask: v.optional(v.string()), // Last 4 digits
    currentBalance: v.optional(v.number()),
    availableBalance: v.optional(v.number()),
    currency: v.string(),
    lastSynced: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"])
    .index("by_account", ["accountId"]),

  plaidTransactions: defineTable({
    userId: v.string(),
    accountId: v.string(),
    plaidTransactionId: v.string(),
    amount: v.number(),
    date: v.string(), // ISO date string (YYYY-MM-DD)
    name: v.string(),
    merchantName: v.optional(v.string()),
    category: v.optional(v.string()),
    pending: v.boolean(),
    syncedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"])
    .index("by_date", ["userId", "date"])
    .index("by_plaid_id", ["plaidTransactionId"]),

  // ═══════════════════════════════════════════════════════════════
  // BROKERS
  // ═══════════════════════════════════════════════════════════════

  brokerConnections: defineTable({
    userId: v.string(),
    brokerType: v.string(), // "interactive_brokers", etc.
    connectionName: v.string(), // User-friendly name
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
  })
    .index("by_user", ["userId"])
    .index("by_status", ["userId", "status"]),

  brokerPositions: defineTable({
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    symbol: v.string(),
    name: v.optional(v.string()),
    quantity: v.number(),
    averageCost: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    unrealizedPnl: v.optional(v.number()),
    currency: v.string(),
    assetType: v.optional(v.string()), // stock, etf, option, crypto, etc.
    lastUpdated: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_connection", ["connectionId"])
    .index("by_symbol", ["userId", "symbol"]),

  // ═══════════════════════════════════════════════════════════════
  // USER SETTINGS
  // ═══════════════════════════════════════════════════════════════

  userSettings: defineTable({
    userId: v.string(),
    defaultCurrency: v.string(),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    dashboardLayout: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
