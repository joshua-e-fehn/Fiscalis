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
} from "./lib/classification";
import { loadFxRates } from "./fxRates";
import {
  brokerAccountBaseFields,
  positionBaseFields,
} from "../../services/finance/currency";
import {
  positionOverrideKeys,
  positionProfitLoss,
  snaptradeAccountFields,
} from "../../services/brokers/snaptradePosition";

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
    // errorMessage is cleared when absent; lastSyncAt is only ever moved
    // forward, so a failed or in-progress sync keeps the last good time
    await ctx.db.patch(args.connectionId, {
      status: args.status,
      errorMessage: args.errorMessage,
      ...(args.lastSyncAt !== undefined ? { lastSyncAt: args.lastSyncAt } : {}),
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
 * Upsert a broker account's metadata from the accounts list. Balance and
 * cash are written only by replaceAccountHoldings. Fields the API did not
 * send are left as stored; connectionId is re-pointed, so an account
 * follows the brokerage authorization it belongs to. Returns the account
 * and the currency now stored for it.
 */
export const upsertAccount = internalMutation({
  args: {
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    snaptradeAccountId: v.string(),
    name: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    accountType: v.optional(v.string()),
    currency: v.optional(v.string()),
    institutionName: v.optional(v.string()),
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
      if (existing.userId !== args.userId) {
        throw new Error("Broker account belongs to another user");
      }
      const defined = Object.fromEntries(
        Object.entries({
          connectionId: args.connectionId,
          name: args.name,
          accountNumber: args.accountNumber,
          accountType: args.accountType,
          currency: args.currency,
          institutionName: args.institutionName,
        }).filter(([, value]) => value !== undefined),
      );
      await ctx.db.patch(existing._id, { ...defined, lastSyncAt: now });
      return {
        accountId: existing._id,
        currency: args.currency ?? existing.currency,
      };
    }

    // The sync passes the listing's currency, else one from the holdings
    // response (snaptradeHoldingsCurrency); USD only when neither has one
    const currency = args.currency ?? "USD";
    const accountId = await ctx.db.insert("brokerAccounts", {
      userId: args.userId,
      connectionId: args.connectionId,
      snaptradeAccountId: args.snaptradeAccountId,
      name: args.name ?? "Unknown Account",
      accountNumber: args.accountNumber,
      accountType: args.accountType ?? "OTHER",
      currency,
      institutionName: args.institutionName,
      lastSyncAt: now,
      createdAt: now,
    });
    return { accountId, currency };
  },
});

const holdingPositionValidator = v.object({
  symbol: v.string(),
  symbolId: v.optional(v.string()),
  name: v.optional(v.string()),
  assetType: v.string(),
  currency: v.string(),
  isin: v.optional(v.string()),
  cusip: v.optional(v.string()),
  figi: v.optional(v.string()),
  quantity: v.number(),
  currentPrice: v.number(),
  marketValue: v.number(),
  averageCostBasis: v.optional(v.number()),
  totalCostBasis: v.optional(v.number()),
});

const moneyValidator = v.object({ amount: v.number(), currency: v.string() });

/**
 * Replace one account's positions and update its balance and cash from a
 * holdings response, in one transaction: a sync that fails before this
 * runs leaves the stored holdings untouched, never half-deleted.
 *
 * Each position is classified, stamped in the base currency and given its
 * unrealised P&L here, so no caller can leave it out. A user's
 * classification override is carried over by ISIN or ticker
 * (positionOverrideKeys), as bitpanda.syncHoldings does for Bitpanda.
 *
 * Cash (snaptradeAccountFields): a reported cash figure is written, zero
 * and negative included; without one, cash is the broker total minus the
 * positions (cashSource "residual"); with neither, or when a position has
 * no rate, the stored cash is kept. Only a negative reported balance is a
 * margin debit, stored as a liability (cashInvestmentCategory
 * "liabilities", margin-loans). When cash cannot be converted it throws
 * before anything is committed, so the account keeps its stored holdings.
 */
export const replaceAccountHoldings = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.id("brokerAccounts"),
    positions: v.array(holdingPositionValidator),
    cashBalances: v.optional(v.array(moneyValidator)),
    cashEquivalents: v.array(moneyValidator),
    total: v.optional(
      v.object({ amount: v.number(), currency: v.optional(v.string()) }),
    ),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== args.userId) {
      throw new Error("Broker account not found");
    }

    const rates = await loadFxRates(ctx);
    const now = Date.now();

    // Capture user overrides, then remove the old rows
    const overrides = new Map<
      string,
      { category?: string; subcategory?: string }
    >();
    const existing = await ctx.db
      .query("brokerPositions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const position of existing) {
      if (position.userCategoryOverride || position.userSubcategoryOverride) {
        for (const key of positionOverrideKeys(position)) {
          overrides.set(key, {
            category: position.userCategoryOverride,
            subcategory: position.userSubcategoryOverride,
          });
        }
      }
      await ctx.db.delete(position._id);
    }

    for (const position of args.positions) {
      const classification = getClassificationFields(
        classifySnaptradePosition({
          assetType: position.assetType,
          symbol: position.symbol,
          name: position.name ?? null,
          quantity: position.quantity,
          marketValue: position.marketValue,
        }),
      );
      const override = positionOverrideKeys(position)
        .map((key) => overrides.get(key))
        .find((value) => value !== undefined);

      await ctx.db.insert("brokerPositions", {
        userId: args.userId,
        accountId: args.accountId,
        ...position,
        ...positionProfitLoss(position),
        ...classification,
        ...(override
          ? {
              userCategoryOverride: override.category,
              userSubcategoryOverride: override.subcategory,
              investmentCategory:
                override.category ?? classification.investmentCategory,
              investmentSubcategory:
                override.subcategory ?? classification.investmentSubcategory,
              classificationSource: "user_override",
            }
          : {}),
        ...positionBaseFields(position, rates),
        lastSyncAt: now,
        createdAt: now,
      });
    }

    const fields = snaptradeAccountFields(
      {
        positions: args.positions,
        cashBalances: args.cashBalances,
        cashEquivalents: args.cashEquivalents,
        total: args.total,
      },
      account.currency,
      rates,
      {
        cash: account.cash,
        currency: account.balanceCurrency ?? account.currency,
      },
    );
    const cash = fields.cash;
    await ctx.db.patch(account._id, {
      balance: fields.balance,
      balanceCurrency: fields.balanceCurrency,
      cash,
      cashSource: fields.cashSource ?? account.cashSource,
      cashInvestmentCategory:
        fields.cashInvestmentCategory ?? account.cashInvestmentCategory,
      cashInvestmentSubcategory:
        fields.cashInvestmentSubcategory ?? account.cashInvestmentSubcategory,
      ...brokerAccountBaseFields(
        {
          balance: fields.balance,
          cash,
          currency: account.currency,
          balanceCurrency: fields.balanceCurrency,
        },
        rates,
        { balanceIsMixed: fields.balanceIsMixed },
      ),
      lastSyncAt: now,
    });

    return { positions: args.positions.length };
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
