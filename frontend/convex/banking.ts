import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  classifyPlaidAccount,
  getClassificationFields,
} from "./lib/classification";

// ═══════════════════════════════════════════════════════════════
// QUERIES (Public - called from frontend)
// ═══════════════════════════════════════════════════════════════

/**
 * Get all Plaid items (bank connections) for the current user
 */
export const getItems = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Don't return the encrypted access token to the client
    return items.map((item) => ({
      _id: item._id,
      _creationTime: item._creationTime,
      userId: item.userId,
      itemId: item.itemId,
      institutionId: item.institutionId,
      institutionName: item.institutionName,
      institutionLogo: item.institutionLogo,
      institutionPrimaryColor: item.institutionPrimaryColor,
      status: item.status,
      errorCode: item.errorCode,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  },
});

/**
 * Get all bank accounts for the current user
 */
export const getAccounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    return await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get accounts for a specific Plaid item
 */
export const getAccountsByItem = query({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("plaidAccounts")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
  },
});

/**
 * Get transactions with optional filtering
 */
export const getTransactions = query({
  args: {
    limit: v.optional(v.number()),
    accountId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    let transactions = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Filter by account if specified
    if (args.accountId) {
      transactions = transactions.filter((t) => t.accountId === args.accountId);
    }

    // Filter by date range if specified
    if (args.startDate) {
      transactions = transactions.filter((t) => t.date >= args.startDate!);
    }
    if (args.endDate) {
      transactions = transactions.filter((t) => t.date <= args.endDate!);
    }

    // Sort by date descending
    transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Apply limit
    if (args.limit) {
      transactions = transactions.slice(0, args.limit);
    }

    return transactions;
  },
});

/**
 * Get transactions from the database (cached)
 */
export const getTransactionsDb = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    let transactions = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Sort by date descending
    transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Apply limit
    const limit = args.limit ?? 50;
    return transactions.slice(0, limit);
  },
});

/**
 * Get aggregated balance summary
 */
export const getBalancesSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    const accounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const summary = {
      totalBalance: 0,
      totalAvailable: 0,
      accountCount: accounts.length,
      byType: {} as Record<string, { balance: number; count: number }>,
    };

    for (const account of accounts) {
      const balance = account.currentBalance ?? 0;
      const available = account.availableBalance ?? 0;

      summary.totalBalance += balance;
      summary.totalAvailable += available;

      if (!summary.byType[account.type]) {
        summary.byType[account.type] = { balance: 0, count: 0 };
      }
      summary.byType[account.type].balance += balance;
      summary.byType[account.type].count += 1;
    }

    return summary;
  },
});

/**
 * Get items that need re-authentication
 */
export const getItemsNeedingReauth = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return items
      .filter(
        (item) => item.status === "error" || item.status === "pending_reauth",
      )
      .map((item) => ({
        itemId: item.itemId,
        institutionId: item.institutionId,
        institutionName: item.institutionName,
        errorCode: item.errorCode,
        status: item.status,
      }));
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS (Public - called from frontend)
// ═══════════════════════════════════════════════════════════════

/**
 * Delete a Plaid item and all associated data
 */
export const deleteItem = mutation({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Find and verify ownership
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();

    if (!item || item.userId !== userId) {
      throw new Error("Item not found or unauthorized");
    }

    // Delete associated accounts
    const accounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    for (const account of accounts) {
      // Delete transactions for this account
      const transactions = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_account", (q) => q.eq("accountId", account.accountId))
        .collect();

      for (const txn of transactions) {
        await ctx.db.delete(txn._id);
      }

      await ctx.db.delete(account._id);
    }

    // Delete the item
    await ctx.db.delete(item._id);

    // Schedule a snapshot after disconnection to capture the portfolio change
    await ctx.scheduler.runAfter(0, internal.portfolioSnapshots.takeSnapshot, {
      userId,
      source: "plaid-disconnect",
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (Called by actions)
// ═══════════════════════════════════════════════════════════════

/**
 * Save or update a Plaid item
 */
export const saveItem = internalMutation({
  args: {
    userId: v.string(),
    accessToken: v.string(),
    itemId: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    institutionLogo: v.optional(v.string()),
    institutionPrimaryColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if item already exists
    const existing = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        status: "active",
        errorCode: undefined,
        updatedAt: now,
        // Update logo fields if provided (they might have changed)
        ...(args.institutionLogo && { institutionLogo: args.institutionLogo }),
        ...(args.institutionPrimaryColor && {
          institutionPrimaryColor: args.institutionPrimaryColor,
        }),
      });
      return existing._id;
    }

    return await ctx.db.insert("plaidItems", {
      userId: args.userId,
      accessToken: args.accessToken,
      itemId: args.itemId,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
      institutionLogo: args.institutionLogo,
      institutionPrimaryColor: args.institutionPrimaryColor,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update the status of a Plaid item
 */
export const updateItemStatus = internalMutation({
  args: {
    itemId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("pending_reauth"),
    ),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();

    if (!item) throw new Error("Item not found");

    await ctx.db.patch(item._id, {
      status: args.status,
      errorCode: args.errorCode,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update the institution logo for a Plaid item
 */
export const updateItemLogo = internalMutation({
  args: {
    itemId: v.string(),
    institutionLogo: v.optional(v.string()),
    institutionPrimaryColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();

    if (!item) throw new Error("Item not found");

    await ctx.db.patch(item._id, {
      institutionLogo: args.institutionLogo,
      institutionPrimaryColor: args.institutionPrimaryColor,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Save or update accounts for a Plaid item
 * Automatically classifies accounts into investment categories
 */
export const saveAccounts = internalMutation({
  args: {
    userId: v.string(),
    itemId: v.string(),
    accounts: v.array(
      v.object({
        accountId: v.string(),
        name: v.string(),
        officialName: v.optional(v.string()),
        type: v.string(),
        subtype: v.optional(v.string()),
        mask: v.optional(v.string()),
        currentBalance: v.optional(v.number()),
        availableBalance: v.optional(v.number()),
        currency: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const account of args.accounts) {
      const existing = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_account", (q) => q.eq("accountId", account.accountId))
        .first();

      // Classify the account
      const classification = classifyPlaidAccount({
        type: account.type,
        subtype: account.subtype ?? null,
        name: account.name,
      });

      const classificationFields = getClassificationFields(classification);

      if (existing) {
        // Preserve user overrides if they exist
        const preserveUserOverrides =
          existing.userCategoryOverride || existing.userSubcategoryOverride;

        await ctx.db.patch(existing._id, {
          ...account,
          lastSynced: now,
          // Only update classification if no user override exists
          ...(preserveUserOverrides ? {} : classificationFields),
        });
      } else {
        await ctx.db.insert("plaidAccounts", {
          userId: args.userId,
          itemId: args.itemId,
          ...account,
          ...classificationFields,
          lastSynced: now,
        });
      }
    }
  },
});

/**
 * Save or update transactions
 */
export const saveTransactions = internalMutation({
  args: {
    userId: v.string(),
    transactions: v.array(
      v.object({
        accountId: v.string(),
        plaidTransactionId: v.string(),
        amount: v.number(),
        date: v.string(),
        name: v.string(),
        merchantName: v.optional(v.string()),
        category: v.optional(v.string()),
        pending: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const txn of args.transactions) {
      const existing = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_plaid_id", (q) =>
          q.eq("plaidTransactionId", txn.plaidTransactionId),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...txn,
          syncedAt: now,
        });
      } else {
        await ctx.db.insert("plaidTransactions", {
          userId: args.userId,
          ...txn,
          syncedAt: now,
        });
      }
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL QUERIES (Called by actions)
// ═══════════════════════════════════════════════════════════════

/**
 * Get a Plaid item by itemId (includes access token for actions)
 */
export const getItemByIdInternal = internalQuery({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();
  },
});

/**
 * Get all Plaid items for a user (includes access tokens for actions)
 */
export const getItemsByUserInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
