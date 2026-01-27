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
  // BROKERS (SnapTrade)
  // ═══════════════════════════════════════════════════════════════

  // SnapTrade user registration (one per Fiscalis user)
  // SnapTrade requires registering users on their platform first
  snaptradeUsers: defineTable({
    userId: v.string(), // Clerk user ID
    snaptradeUserId: v.string(), // SnapTrade's user identifier
    snaptradeUserSecret: v.string(), // Encrypted user secret
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_snaptrade_user", ["snaptradeUserId"]),

  // Broker connections (one per connected brokerage)
  brokerConnections: defineTable({
    userId: v.string(), // Clerk user ID
    snaptradeUserId: v.string(), // Reference to snaptradeUsers
    authorizationId: v.string(), // SnapTrade's connection/authorization ID
    brokerName: v.string(), // e.g., "Interactive Brokers", "Fidelity"
    brokerSlug: v.string(), // e.g., "INTERACTIVE_BROKERS", "FIDELITY"
    brokerLogo: v.optional(v.string()), // URL to broker logo
    status: v.union(
      v.literal("connected"),
      v.literal("error"),
      v.literal("reauth_required"),
      v.literal("syncing"),
      v.literal("disconnected"),
    ),
    errorMessage: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_authorization", ["authorizationId"])
    .index("by_status", ["userId", "status"]),

  // Brokerage accounts (multiple per connection)
  brokerAccounts: defineTable({
    userId: v.string(), // Clerk user ID
    connectionId: v.id("brokerConnections"), // Reference to connection
    snaptradeAccountId: v.string(), // SnapTrade's account identifier
    name: v.string(), // Account name
    accountNumber: v.optional(v.string()), // Masked account number
    accountType: v.string(), // "MARGIN", "CASH", "TFSA", "RRSP", "401K", etc.
    balance: v.optional(v.number()), // Total account value
    cash: v.optional(v.number()), // Available cash
    currency: v.string(), // Account currency
    institutionName: v.optional(v.string()), // Broker name (denormalized)
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_connection", ["connectionId"])
    .index("by_snaptrade_account", ["snaptradeAccountId"]),

  // Positions/Holdings
  brokerPositions: defineTable({
    userId: v.string(), // Clerk user ID
    accountId: v.id("brokerAccounts"), // Reference to account
    snaptradePositionId: v.optional(v.string()), // SnapTrade's position ID if available
    symbol: v.string(), // Ticker symbol
    symbolId: v.optional(v.string()), // SnapTrade's universal symbol ID
    name: v.optional(v.string()), // Security name
    assetType: v.string(), // "equity", "etf", "option", "bond", "mutual_fund", "cryptocurrency", "forex", "other"
    quantity: v.number(), // Number of shares/units
    averageCostBasis: v.optional(v.number()), // Average cost per share
    totalCostBasis: v.optional(v.number()), // Total cost basis
    currentPrice: v.optional(v.number()), // Current market price
    marketValue: v.optional(v.number()), // Current market value
    currency: v.string(), // Position currency
    // Identifiers
    isin: v.optional(v.string()), // International Securities Identification Number
    cusip: v.optional(v.string()), // Committee on Uniform Securities Identification Procedures
    figi: v.optional(v.string()), // Financial Instrument Global Identifier
    // P&L
    unrealizedPL: v.optional(v.number()), // Unrealized profit/loss
    unrealizedPLPercent: v.optional(v.number()), // Unrealized P&L percentage
    dayPL: v.optional(v.number()), // Today's P&L
    dayPLPercent: v.optional(v.number()), // Today's P&L percentage
    // Metadata
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"])
    .index("by_symbol", ["userId", "symbol"]),

  // Broker transactions/activities
  brokerTransactions: defineTable({
    userId: v.string(), // Clerk user ID
    accountId: v.id("brokerAccounts"), // Reference to account
    snaptradeActivityId: v.string(), // SnapTrade's activity/transaction ID
    type: v.string(), // "BUY", "SELL", "DIVIDEND", "INTEREST", "TRANSFER", "FEE", "CONTRIBUTION", "WITHDRAWAL", etc.
    symbol: v.optional(v.string()), // Ticker symbol (for trades)
    symbolId: v.optional(v.string()), // SnapTrade's universal symbol ID
    description: v.optional(v.string()), // Transaction description
    quantity: v.optional(v.number()), // Number of shares (for trades)
    price: v.optional(v.number()), // Price per share (for trades)
    amount: v.number(), // Total transaction amount
    currency: v.string(), // Transaction currency
    fees: v.optional(v.number()), // Transaction fees
    settlementDate: v.optional(v.string()), // Settlement date (ISO string)
    tradeDate: v.string(), // Trade/activity date (ISO string)
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"])
    .index("by_date", ["userId", "tradeDate"])
    .index("by_snaptrade_id", ["snaptradeActivityId"]),

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
