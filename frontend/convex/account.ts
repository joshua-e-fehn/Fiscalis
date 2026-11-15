import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import { requireUserId, type OwnedTable } from "./lib/auth";
import { resetUserRateLimits } from "./lib/rateLimit";
import { userError } from "./lib/userError";
import {
  EXPORT_PAGE_SIZE,
  PURGE_BATCH_SIZE,
  USER_DATA_TABLE_NAMES,
  buildUserDataExport,
  isAccountDeleteConfirmation,
  redactForExport,
  type UserDataExport,
  type UserDataTableName,
} from "../../services/privacy/userData";

// ═══════════════════════════════════════════════════════════════
// GDPR: data export and account deletion (ENG-232)
// ═══════════════════════════════════════════════════════════════
//
// Both walk services/privacy/userData.ts USER_DATA_TABLES, the list of
// every user-owned table. These types fail `tsc` when a table with a
// userId is missing from it (or it names a table that does not exist);
// services/privacy/userData.test.ts checks the same against schema.ts.

type AssertNever<T extends never> = T;
export type UnlistedUserTables = AssertNever<
  Exclude<OwnedTable, UserDataTableName>
>;
export type UnknownUserTables = AssertNever<
  Exclude<UserDataTableName, TableNames>
>;

const userDataTable = v.union(
  ...USER_DATA_TABLE_NAMES.map((table) => v.literal(table)),
);

// Every listed table has a by_user index on userId (checked by the test).
// Narrowing the union to one member lets withIndex type-check for all.
type AnyUserTable = "loans";

// ─── Export ────────────────────────────────────────────────────

/** One page of a user's documents in one table, secrets removed. */
export const exportPage = internalQuery({
  args: {
    userId: v.string(),
    table: userDataTable,
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query(args.table as AnyUserTable)
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .paginate({ cursor: args.cursor, numItems: EXPORT_PAGE_SIZE });
    return {
      docs: page.page.map((doc) => redactForExport(args.table, doc)),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * "Download my data": every document the signed-in user owns, keyed by
 * table, with encrypted provider credentials and key hashes left out (and
 * named under `excluded`). Pages through each table, one query per page.
 */
export const exportMyData = action({
  args: {},
  handler: async (ctx): Promise<UserDataExport> => {
    const userId = await requireUserId(ctx);
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const table of USER_DATA_TABLE_NAMES) {
      const docs: Record<string, unknown>[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: {
          docs: Record<string, unknown>[];
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runQuery(internal.account.exportPage, {
          userId,
          table,
          cursor,
        });
        docs.push(...page.docs);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      tables[table] = docs;
    }
    return buildUserDataExport(userId, tables, new Date());
  },
});

// ─── Deletion ──────────────────────────────────────────────────
//
// 1. Revoke at the providers: Plaid itemRemove per item, SnapTrade
//    deleteSnapTradeUser (removes every brokerage authorization).
//    Bitpanda keys are created by the user at Bitpanda and cannot be
//    revoked through its API; the purge drops the stored key.
//    Stripe: the customer is deleted, which cancels any subscription at
//    once so the user is not charged again (billing.deleteStripeCustomer).
// 2. Purge every user-owned document, PURGE_BATCH_SIZE at a time, one
//    scheduled mutation per batch (purgeUserData).
// 3. Delete the Clerk user. Clerk then sends user.deleted to
//    POST /clerk-webhook (http.ts), which runs the purge once more and
//    catches anything a client wrote meanwhile.
//
// Every step is idempotent: running deleteUserData or purgeUserData
// (tableIndex 0) again for the same user resumes an interrupted deletion.

/** Revokes the user's provider links; returns how many could not be revoked. */
async function revokeProviderAccess(
  ctx: ActionCtx,
  userId: string,
): Promise<number> {
  let failed = 0;
  try {
    const plaid = await ctx.runAction(
      internal.actions.plaid.revokeItemsForUser,
      { userId },
    );
    failed += plaid.failed;
  } catch {
    console.error("Account deletion: Plaid revocation threw");
    failed++;
  }
  try {
    const snaptrade = await ctx.runAction(
      internal.actions.snaptrade.revokeUserInternal,
      { userId },
    );
    if (snaptrade.failed) failed++;
  } catch {
    console.error("Account deletion: SnapTrade revocation threw");
    failed++;
  }
  try {
    const stripe = await ctx.runAction(internal.billing.deleteStripeCustomer, {
      userId,
    });
    if (stripe.failed) failed++;
  } catch {
    console.error("Account deletion: Stripe customer deletion threw");
    failed++;
  }
  return failed;
}

/**
 * Deletes one batch of the user's documents from USER_DATA_TABLES[tableIndex]
 * and schedules the next batch; after the last table, optionally deletes the
 * Clerk user.
 */
export const purgeUserData = internalMutation({
  args: {
    userId: v.string(),
    tableIndex: v.number(),
    deleteClerkUser: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.tableIndex >= USER_DATA_TABLE_NAMES.length) {
      await resetUserRateLimits(ctx, args.userId);
      console.log("Account deletion: user data purged");
      if (args.deleteClerkUser) {
        await ctx.scheduler.runAfter(0, internal.account.deleteClerkUser, {
          userId: args.userId,
        });
      }
      return;
    }

    const table = USER_DATA_TABLE_NAMES[args.tableIndex];
    const docs = await ctx.db
      .query(table as AnyUserTable)
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(PURGE_BATCH_SIZE);
    for (const doc of docs) await ctx.db.delete(doc._id);

    // A full batch may have more behind it: stay on this table
    const tableIndex =
      docs.length === PURGE_BATCH_SIZE ? args.tableIndex : args.tableIndex + 1;
    await ctx.scheduler.runAfter(0, internal.account.purgeUserData, {
      ...args,
      tableIndex,
    });
  },
});

/** Deletes the user at Clerk (Backend API). A user already gone is fine. */
export const deleteClerkUser = internalAction({
  args: { userId: v.string() },
  handler: async (_ctx, args) => {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) throw new Error("CLERK_SECRET_KEY is not set");
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(args.userId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${secret}` } },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Clerk user deletion failed (HTTP ${response.status})`);
    }
  },
});

/**
 * Revoke, purge, and (unless Clerk already deleted the user) delete the
 * Clerk user. Used by the user.deleted webhook, where the user is gone
 * either way, so a failed revocation is logged and the purge still runs.
 */
export const deleteUserData = internalAction({
  args: { userId: v.string(), deleteClerkUser: v.boolean() },
  handler: async (ctx, args) => {
    const failed = await revokeProviderAccess(ctx, args.userId);
    if (failed > 0) {
      console.error(`Account deletion: ${failed} provider link(s) not revoked`);
    }
    await ctx.scheduler.runAfter(0, internal.account.purgeUserData, {
      userId: args.userId,
      tableIndex: 0,
      deleteClerkUser: args.deleteClerkUser,
    });
  },
});

/**
 * "Delete my account". `confirmation` must be ACCOUNT_DELETE_PHRASE. A
 * provider link that cannot be revoked stops the deletion before anything
 * is removed, so the user can retry instead of leaving live access behind.
 * The purge and the Clerk deletion then run in the background.
 */
export const deleteMyAccount = action({
  args: { confirmation: v.string() },
  handler: async (ctx, args): Promise<{ scheduled: true }> => {
    const userId = await requireUserId(ctx);
    if (!isAccountDeleteConfirmation(args.confirmation)) {
      userError("accountDeleteConfirmationMismatch");
    }
    if ((await revokeProviderAccess(ctx, userId)) > 0) {
      userError("accountDeleteRevokeFailed");
    }
    await ctx.scheduler.runAfter(0, internal.account.purgeUserData, {
      userId,
      tableIndex: 0,
      deleteClerkUser: true,
    });
    return { scheduled: true };
  },
});
