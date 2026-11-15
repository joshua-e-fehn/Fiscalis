import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  classifyPlaidAccount,
  getClassificationFields,
} from "../../services/classification";
import { getUserId } from "./lib/auth";
import { requireConnectionSlot } from "./lib/plan";
import { ensureSyncTarget } from "./lib/syncTargets";
import { loadFxRates } from "./fxRates";
import {
  bankAccountBaseFields,
  bankAccountWithBaseFields,
} from "../../services/finance/currency";

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
      transactionsSyncedAt: item.transactionsSyncedAt,
      consentExpiresAt: item.consentExpiresAt,
      disconnectExpectedAt: item.disconnectExpectedAt,
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
    const accounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Stamp a row synced before base fields existed at today's rate, as
    // the net-worth readers do (lib/netWorth.ts loadHoldings)
    const rates = await loadFxRates(ctx);
    return accounts.map((account) => bankAccountWithBaseFields(account, rates));
  },
});

/**
 * Get accounts for a specific Plaid item
 */
export const getAccountsByItem = query({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    // Only the caller's own accounts: a foreign itemId returns nothing.
    const accounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    const rates = await loadFxRates(ctx);
    return accounts
      .filter((account) => account.userId === userId)
      .map((account) => bankAccountWithBaseFields(account, rates));
  },
});

/** An empty page, for a signed-out caller or a foreign account. */
const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };

/**
 * The signed-in user's bank transactions, newest first, one page at a time
 * (usePaginatedQuery). Optionally one account and an inclusive date range
 * (YYYY-MM-DD); both read an index, so a page costs its own size. With
 * `search`, the description search index is read instead, best match
 * first, and the date range filters its results.
 */
export const listTransactions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    accountId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { paginationOpts, accountId, startDate, endDate, search },
  ) => {
    const userId = await getUserId(ctx);
    if (!userId) return EMPTY_PAGE;

    if (accountId) {
      // Only the caller's own account: a foreign accountId returns nothing
      const account = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_account", (q) => q.eq("accountId", accountId))
        .first();
      if (!account || account.userId !== userId) return EMPTY_PAGE;
    }

    const term = search?.trim();
    if (term) {
      return await ctx.db
        .query("plaidTransactions")
        .withSearchIndex("search_name", (q) => {
          const byUser = q.search("name", term).eq("userId", userId);
          return accountId ? byUser.eq("accountId", accountId) : byUser;
        })
        .filter((q) => {
          const from = startDate
            ? q.gte(q.field("date"), startDate)
            : q.eq(true, true);
          const to = endDate ? q.lte(q.field("date"), endDate) : q.eq(true, true);
          return q.and(from, to);
        })
        .paginate(paginationOpts);
    }

    if (accountId) {
      return await ctx.db
        .query("plaidTransactions")
        .withIndex("by_account_date", (q) => {
          const byAccount = q.eq("accountId", accountId);
          const from = startDate ? byAccount.gte("date", startDate) : byAccount;
          return endDate ? from.lte("date", endDate) : from;
        })
        .order("desc")
        .paginate(paginationOpts);
    }

    return await ctx.db
      .query("plaidTransactions")
      .withIndex("by_date", (q) => {
        const byUser = q.eq("userId", userId);
        const from = startDate ? byUser.gte("date", startDate) : byUser;
        return endDate ? from.lte("date", endDate) : from;
      })
      .order("desc")
      .paginate(paginationOpts);
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

/**
 * Delete a Plaid item and all associated data. Internal: the public entry
 * point is `actions/plaid.disconnectItem`, which first revokes the item at
 * Plaid (`itemRemove`) so consent ends and Plaid stops billing for it.
 */
export const deleteItemData = internalMutation({
  args: { itemId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();
    if (!item || item.userId !== args.userId) return;

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
      userId: args.userId,
      source: "plaid-disconnect",
    });
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
        disconnectExpectedAt: undefined,
        updatedAt: now,
        // Update logo fields if provided (they might have changed)
        ...(args.institutionLogo && { institutionLogo: args.institutionLogo }),
        ...(args.institutionPrimaryColor && {
          institutionPrimaryColor: args.institutionPrimaryColor,
        }),
      });
      return existing._id;
    }

    // Atomic with the insert, so parallel connects cannot pass the limit
    // together (ENG-199)
    await requireConnectionSlot(ctx, args.userId);
    await ensureSyncTarget(ctx, args.userId);
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
 * Store an item's consent dates (ENG-240). `consentExpiresAt` is Plaid's
 * end of consent, written by every balance sync (cleared when Plaid reports
 * none) and by the PENDING_EXPIRATION webhook. `disconnectExpectedAt` is
 * set by PENDING_DISCONNECT and cleared after the user renews. A field
 * left out of the args is not touched; null clears it. Unknown items are
 * ignored (a webhook may arrive for an item already disconnected).
 */
export const updateItemConsent = internalMutation({
  args: {
    itemId: v.string(),
    consentExpiresAt: v.optional(v.union(v.number(), v.null())),
    disconnectExpectedAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();
    if (!item) return;

    await ctx.db.patch(item._id, {
      ...(args.consentExpiresAt !== undefined
        ? { consentExpiresAt: args.consentExpiresAt ?? undefined }
        : {}),
      ...(args.disconnectExpectedAt !== undefined
        ? { disconnectExpectedAt: args.disconnectExpectedAt ?? undefined }
        : {}),
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
    const rates = await loadFxRates(ctx);

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
      // Balance in the base currency (EUR); flagged "unknown" when the
      // account has no currency or no rate
      const currencyFields = bankAccountBaseFields(account, rates);

      if (existing) {
        // Preserve user overrides if they exist
        const preserveUserOverrides =
          existing.userCategoryOverride || existing.userSubcategoryOverride;

        await ctx.db.patch(existing._id, {
          ...account,
          ...currencyFields,
          lastSynced: now,
          // Only update classification if no user override exists
          ...(preserveUserOverrides ? {} : classificationFields),
        });
      } else {
        await ctx.db.insert("plaidAccounts", {
          userId: args.userId,
          itemId: args.itemId,
          ...account,
          ...currencyFields,
          ...classificationFields,
          lastSynced: now,
        });
      }
    }
  },
});

const plaidTransactionValidator = v.object({
  itemId: v.string(),
  accountId: v.string(),
  plaidTransactionId: v.string(),
  amount: v.number(),
  currency: v.optional(v.string()),
  date: v.string(),
  name: v.string(),
  merchantName: v.optional(v.string()),
  category: v.optional(v.string()),
  pending: v.boolean(),
});

/**
 * Apply one batch of /transactions/sync changes (actions/plaid.ts
 * syncItemTransactions): upsert added/modified by Plaid id, delete removed.
 * Idempotent, so a sync that fails before saving its cursor can replay it.
 */
export const applyTransactionChanges = internalMutation({
  args: {
    userId: v.string(),
    upserts: v.array(plaidTransactionValidator),
    removed: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const txn of args.upserts) {
      const existing = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_plaid_id", (q) =>
          q.eq("plaidTransactionId", txn.plaidTransactionId),
        )
        .first();

      if (existing) {
        if (existing.userId !== args.userId) continue;
        await ctx.db.patch(existing._id, { ...txn, syncedAt: now });
      } else {
        await ctx.db.insert("plaidTransactions", {
          userId: args.userId,
          ...txn,
          syncedAt: now,
        });
      }
    }

    for (const plaidTransactionId of args.removed) {
      const existing = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_plaid_id", (q) =>
          q.eq("plaidTransactionId", plaidTransactionId),
        )
        .first();
      if (existing && existing.userId === args.userId) {
        await ctx.db.delete(existing._id);
      }
    }
  },
});

/** Rows deleted per reconcile call, to stay inside mutation limits. */
const RECONCILE_BATCH = 500;

/**
 * After an item's first full /transactions/sync: delete the account's rows
 * the sync did not write (syncedAt before it started). Those were stored
 * by /transactions/get and Plaid no longer lists them, e.g. a pending
 * transaction that has since posted under another id. Returns whether
 * more remain, so the caller repeats until done.
 */
export const reconcileAccountTransactions = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.string(),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_account_synced", (q) =>
        q.eq("accountId", args.accountId).lt("syncedAt", args.syncStartedAt),
      )
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .take(RECONCILE_BATCH);
    for (const txn of stale) await ctx.db.delete(txn._id);
    return { deleted: stale.length, more: stale.length === RECONCILE_BATCH };
  },
});

/** Store an item's /transactions/sync cursor once its changes are applied. */
export const saveTransactionsCursor = internalMutation({
  args: { itemId: v.string(), cursor: v.string() },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .first();
    if (!item) return;
    const now = Date.now();
    await ctx.db.patch(item._id, {
      transactionsCursor: args.cursor,
      transactionsSyncedAt: now,
      updatedAt: now,
    });
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

/**
 * Every Plaid item's id and encrypted token, for the one-off webhook URL
 * update (actions/plaid.ts updateItemWebhooks). Internal only.
 */
export const listAllItemsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("plaidItems").collect();
    return items.map((item) => ({
      itemId: item.itemId,
      accessToken: item.accessToken,
    }));
  },
});
