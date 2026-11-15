/**
 * Daily-sync discovery (ENG-230): the cron pages through syncTargets
 * (lib/syncTargets.ts) instead of scanning every source table.
 */

import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { hasSyncableData } from "./lib/syncTargets";

/**
 * One page of sync targets: users that still have syncable data, and the
 * ones that have none left (to prune).
 */
export const getSyncTargetsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("syncTargets").paginate(paginationOpts);
    const active: string[] = [];
    const stale: string[] = [];
    for (const target of page.page) {
      if (await hasSyncableData(ctx, target.userId)) {
        active.push(target.userId);
      } else {
        stale.push(target.userId);
      }
    }
    return {
      active,
      stale,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Drop the targets of users that no longer have syncable data. */
export const pruneSyncTargets = internalMutation({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, { userIds }) => {
    for (const userId of userIds) {
      // Re-checked here: data may have been added since the page was read
      const target = await ctx.db
        .query("syncTargets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (target && !(await hasSyncableData(ctx, userId))) {
        await ctx.db.delete(target._id);
      }
    }
  },
});
