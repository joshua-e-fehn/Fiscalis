import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  classifySnaptradePosition,
  getClassificationFields,
  convertCurrency,
  getCurrencyConversionFields,
  BASE_CURRENCY,
} from "./lib/classification";

// ═══════════════════════════════════════════════════════════════
// SNAPTRADE USER QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get SnapTrade user registration status for the current user
 */
export const getSnaptradeUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    return await ctx.db
      .query("snaptradeUsers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

// ═══════════════════════════════════════════════════════════════
// BROKER CONNECTION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all broker connections for the current user
 */
export const getConnections = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

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
    if (!identity) return null;

    const connection = await ctx.db.get(args.connectionId);

    if (!connection || connection.userId !== identity.subject) {
      return null;
    }

    return connection;
  },
});

/**
 * Get connections that need attention (errors or reauth required)
 */
export const getConnectionsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const errorConnections = await ctx.db
      .query("brokerConnections")
      .withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", "error"),
      )
      .collect();

    const reauthConnections = await ctx.db
      .query("brokerConnections")
      .withIndex("by_status", (q) =>
        q.eq("userId", userId).eq("status", "reauth_required"),
      )
      .collect();

    return [...errorConnections, ...reauthConnections];
  },
});

// ═══════════════════════════════════════════════════════════════
// BROKER ACCOUNT QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all broker accounts for the current user
 */
export const getAccounts = query({
  args: { connectionId: v.optional(v.id("brokerConnections")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    if (args.connectionId) {
      // Verify ownership
      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== userId) {
        throw new Error("Connection not found or unauthorized");
      }

      return await ctx.db
        .query("brokerAccounts")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", args.connectionId!),
        )
        .collect();
    }

    return await ctx.db
      .query("brokerAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// ═══════════════════════════════════════════════════════════════
// BROKER POSITION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all positions for the current user
 */
export const getPositions = query({
  args: { accountId: v.optional(v.id("brokerAccounts")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    if (args.accountId) {
      // Verify ownership
      const account = await ctx.db.get(args.accountId);
      if (!account || account.userId !== userId) {
        throw new Error("Account not found or unauthorized");
      }

      return await ctx.db
        .query("brokerPositions")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
        .collect();
    }

    return await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get positions for a specific symbol across all accounts
 */
export const getPositionsBySymbol = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

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
 * Get portfolio summary with total values by asset type
 */
export const getPortfolioSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

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
    let totalCostBasis = 0;

    for (const position of positions) {
      const assetType = position.assetType || "unknown";
      const marketValue = position.marketValue || 0;
      const pnl = position.unrealizedPL || 0;
      const costBasis = position.totalCostBasis || 0;

      if (!byAssetType[assetType]) {
        byAssetType[assetType] = { totalValue: 0, totalPnl: 0, positions: 0 };
      }

      byAssetType[assetType].totalValue += marketValue;
      byAssetType[assetType].totalPnl += pnl;
      byAssetType[assetType].positions += 1;

      totalMarketValue += marketValue;
      totalUnrealizedPnl += pnl;
      totalCostBasis += costBasis;
    }

    return {
      totalMarketValue,
      totalUnrealizedPnl,
      totalCostBasis,
      totalReturnPercent:
        totalCostBasis > 0
          ? ((totalMarketValue - totalCostBasis) / totalCostBasis) * 100
          : 0,
      byAssetType,
      positionCount: positions.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// BROKER TRANSACTION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get transactions for an account
 */
export const getTransactions = query({
  args: {
    accountId: v.optional(v.id("brokerAccounts")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    const limit = args.limit || 100;

    if (args.accountId) {
      // Verify ownership
      const account = await ctx.db.get(args.accountId);
      if (!account || account.userId !== userId) {
        throw new Error("Account not found or unauthorized");
      }

      return await ctx.db
        .query("brokerTransactions")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("brokerTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC MUTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Delete a broker connection and all its data (accounts, positions, transactions)
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

    // Get all accounts for this connection
    const accounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    // Delete positions and transactions for each account
    for (const account of accounts) {
      const positions = await ctx.db
        .query("brokerPositions")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();

      for (const position of positions) {
        await ctx.db.delete(position._id);
      }

      const transactions = await ctx.db
        .query("brokerTransactions")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();

      for (const transaction of transactions) {
        await ctx.db.delete(transaction._id);
      }

      await ctx.db.delete(account._id);
    }

    // Delete the connection
    await ctx.db.delete(args.connectionId);

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (for use by SnapTrade actions)
// ═══════════════════════════════════════════════════════════════

/**
 * Create or update SnapTrade user registration
 */
export const upsertSnaptradeUser = internalMutation({
  args: {
    userId: v.string(),
    snaptradeUserId: v.string(),
    snaptradeUserSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("snaptradeUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        snaptradeUserId: args.snaptradeUserId,
        snaptradeUserSecret: args.snaptradeUserSecret,
      });
      return existing._id;
    }

    return await ctx.db.insert("snaptradeUsers", {
      userId: args.userId,
      snaptradeUserId: args.snaptradeUserId,
      snaptradeUserSecret: args.snaptradeUserSecret,
      createdAt: Date.now(),
    });
  },
});

/**
 * Delete SnapTrade user registration
 */
export const deleteSnaptradeUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("snaptradeUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

/**
 * Create a new broker connection
 */
export const createConnection = internalMutation({
  args: {
    userId: v.string(),
    snaptradeUserId: v.string(),
    authorizationId: v.string(),
    brokerName: v.string(),
    brokerSlug: v.string(),
    brokerLogo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("brokerConnections", {
      userId: args.userId,
      snaptradeUserId: args.snaptradeUserId,
      authorizationId: args.authorizationId,
      brokerName: args.brokerName,
      brokerSlug: args.brokerSlug,
      brokerLogo: args.brokerLogo,
      status: "connected",
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
    connectionId: v.id("brokerConnections"),
    status: v.union(
      v.literal("connected"),
      v.literal("error"),
      v.literal("reauth_required"),
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
 * Update connection broker logo
 */
export const updateConnectionLogo = internalMutation({
  args: {
    connectionId: v.id("brokerConnections"),
    brokerLogo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only update if logo is provided and not empty
    if (args.brokerLogo) {
      await ctx.db.patch(args.connectionId, {
        brokerLogo: args.brokerLogo,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Delete connection data (called by action after SnapTrade API call)
 */
export const deleteConnectionData = internalMutation({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return;

    // Get all accounts for this connection
    const accounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();

    // Delete positions and transactions for each account
    for (const account of accounts) {
      const positions = await ctx.db
        .query("brokerPositions")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();

      for (const position of positions) {
        await ctx.db.delete(position._id);
      }

      const transactions = await ctx.db
        .query("brokerTransactions")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();

      for (const transaction of transactions) {
        await ctx.db.delete(transaction._id);
      }

      await ctx.db.delete(account._id);
    }

    // Delete the connection
    await ctx.db.delete(args.connectionId);
  },
});

/**
 * Upsert broker account
 */
export const upsertAccount = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    snaptradeAccountId: v.string(),
    name: v.string(),
    accountNumber: v.optional(v.string()),
    accountType: v.string(),
    balance: v.optional(v.number()),
    cash: v.optional(v.number()),
    currency: v.string(),
    institutionName: v.optional(v.string()),
    // Flag to indicate this is a metadata-only update (don't touch balance)
    skipBalanceUpdate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_snaptrade_account", (q) =>
        q.eq("snaptradeAccountId", args.snaptradeAccountId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Build update object - only include balance/cash if not skipping
      const updateData: Record<string, unknown> = {
        name: args.name,
        accountNumber: args.accountNumber,
        accountType: args.accountType,
        currency: args.currency,
        institutionName: args.institutionName,
        lastSyncAt: now,
      };

      // Only update balance/cash if skipBalanceUpdate is not true
      if (!args.skipBalanceUpdate) {
        // Only update if we have actual values (not undefined)
        if (args.balance !== undefined) {
          updateData.balance = args.balance;
        }
        if (args.cash !== undefined) {
          updateData.cash = args.cash;
        }
      }

      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    }

    return await ctx.db.insert("brokerAccounts", {
      userId: args.userId,
      connectionId: args.connectionId,
      snaptradeAccountId: args.snaptradeAccountId,
      name: args.name,
      accountNumber: args.accountNumber,
      accountType: args.accountType,
      balance: args.balance,
      cash: args.cash,
      currency: args.currency,
      institutionName: args.institutionName,
      lastSyncAt: now,
      createdAt: now,
    });
  },
});

/**
 * Upsert broker position
 * Automatically classifies positions and converts currency to base (EUR)
 */
export const upsertPosition = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.id("brokerAccounts"),
    snaptradePositionId: v.optional(v.string()),
    symbol: v.string(),
    symbolId: v.optional(v.string()),
    name: v.optional(v.string()),
    assetType: v.string(),
    quantity: v.number(),
    averageCostBasis: v.optional(v.number()),
    totalCostBasis: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    currency: v.string(),
    isin: v.optional(v.string()),
    cusip: v.optional(v.string()),
    figi: v.optional(v.string()),
    unrealizedPL: v.optional(v.number()),
    unrealizedPLPercent: v.optional(v.number()),
    dayPL: v.optional(v.number()),
    dayPLPercent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Find existing position by account + symbol
    const existing = await ctx.db
      .query("brokerPositions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .filter((q) => q.eq(q.field("symbol"), args.symbol))
      .first();

    const now = Date.now();

    // Classify the position
    const classification = classifySnaptradePosition({
      assetType: args.assetType,
      symbol: args.symbol,
      name: args.name ?? null,
      quantity: args.quantity,
      marketValue: args.marketValue ?? null,
    });

    const classificationFields = getClassificationFields(classification);

    // Convert market value to base currency (EUR)
    let currencyConversionFields = {};
    if (args.marketValue !== undefined) {
      const conversion = convertCurrency(
        args.marketValue,
        args.currency,
        BASE_CURRENCY,
      );
      currencyConversionFields = getCurrencyConversionFields(conversion);
    }

    if (existing) {
      // Preserve user overrides if they exist
      const preserveUserOverrides =
        existing.userCategoryOverride || existing.userSubcategoryOverride;

      await ctx.db.patch(existing._id, {
        snaptradePositionId: args.snaptradePositionId,
        symbolId: args.symbolId,
        name: args.name,
        assetType: args.assetType,
        quantity: args.quantity,
        averageCostBasis: args.averageCostBasis,
        totalCostBasis: args.totalCostBasis,
        currentPrice: args.currentPrice,
        marketValue: args.marketValue,
        currency: args.currency,
        isin: args.isin,
        cusip: args.cusip,
        figi: args.figi,
        unrealizedPL: args.unrealizedPL,
        unrealizedPLPercent: args.unrealizedPLPercent,
        dayPL: args.dayPL,
        dayPLPercent: args.dayPLPercent,
        lastSyncAt: now,
        // Only update classification if no user override exists
        ...(preserveUserOverrides ? {} : classificationFields),
        // Always update currency conversion
        ...currencyConversionFields,
      });
      return existing._id;
    }

    return await ctx.db.insert("brokerPositions", {
      userId: args.userId,
      accountId: args.accountId,
      snaptradePositionId: args.snaptradePositionId,
      symbol: args.symbol,
      symbolId: args.symbolId,
      name: args.name,
      assetType: args.assetType,
      quantity: args.quantity,
      averageCostBasis: args.averageCostBasis,
      totalCostBasis: args.totalCostBasis,
      currentPrice: args.currentPrice,
      marketValue: args.marketValue,
      currency: args.currency,
      isin: args.isin,
      cusip: args.cusip,
      figi: args.figi,
      unrealizedPL: args.unrealizedPL,
      unrealizedPLPercent: args.unrealizedPLPercent,
      dayPL: args.dayPL,
      dayPLPercent: args.dayPLPercent,
      ...classificationFields,
      ...currencyConversionFields,
      lastSyncAt: now,
      createdAt: now,
    });
  },
});

/**
 * Delete all positions for an account (before re-syncing)
 */
export const deletePositionsForAccount = internalMutation({
  args: { accountId: v.id("brokerAccounts") },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const position of positions) {
      await ctx.db.delete(position._id);
    }

    return { deleted: positions.length };
  },
});

/**
 * Create broker transaction
 */
export const createTransaction = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.id("brokerAccounts"),
    snaptradeActivityId: v.string(),
    type: v.string(),
    symbol: v.optional(v.string()),
    symbolId: v.optional(v.string()),
    description: v.optional(v.string()),
    quantity: v.optional(v.number()),
    price: v.optional(v.number()),
    amount: v.number(),
    currency: v.string(),
    fees: v.optional(v.number()),
    settlementDate: v.optional(v.string()),
    tradeDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if transaction already exists
    const existing = await ctx.db
      .query("brokerTransactions")
      .withIndex("by_snaptrade_id", (q) =>
        q.eq("snaptradeActivityId", args.snaptradeActivityId),
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("brokerTransactions", {
      userId: args.userId,
      accountId: args.accountId,
      snaptradeActivityId: args.snaptradeActivityId,
      type: args.type,
      symbol: args.symbol,
      symbolId: args.symbolId,
      description: args.description,
      quantity: args.quantity,
      price: args.price,
      amount: args.amount,
      currency: args.currency,
      fees: args.fees,
      settlementDate: args.settlementDate,
      tradeDate: args.tradeDate,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL QUERIES (for use by actions)
// ═══════════════════════════════════════════════════════════════

/**
 * Get SnapTrade user by Clerk user ID (internal)
 */
export const getSnaptradeUserInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("snaptradeUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get connection by ID (internal)
 */
export const getConnectionInternal = internalQuery({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});

/**
 * Get connection by authorization ID (internal)
 */
export const getConnectionByAuthorizationId = internalQuery({
  args: { authorizationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brokerConnections")
      .withIndex("by_authorization", (q) =>
        q.eq("authorizationId", args.authorizationId),
      )
      .first();
  },
});

/**
 * Get all connections for a user (internal)
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

/**
 * Get all accounts for a connection (internal)
 */
export const getAccountsByConnectionInternal = internalQuery({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brokerAccounts")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();
  },
});

/**
 * Get account by SnapTrade account ID (internal)
 */
export const getAccountBySnaptradeId = internalQuery({
  args: { snaptradeAccountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brokerAccounts")
      .withIndex("by_snaptrade_account", (q) =>
        q.eq("snaptradeAccountId", args.snaptradeAccountId),
      )
      .first();
  },
});

/**
 * Get account by ID (internal)
 */
export const getAccountById = internalQuery({
  args: { accountId: v.id("brokerAccounts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});
