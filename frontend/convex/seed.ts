import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { DEMO_TABLES, DEMO_USER_ID, insertDemoData } from "./lib/demoData";

/**
 * The production deployment. The env flag below is the real gate; this is
 * a second lock in case the flag is ever set there by mistake.
 */
const PROD_DEPLOYMENT = "handsome-gecko-941";

/**
 * Throws unless this deployment opted in to demo data: DEMO_SEED_ENABLED
 * must be "true" (set on the dev deployment only) and the deployment must
 * not be production.
 */
export function assertDemoSeedAllowed(): void {
  if (process.env.DEMO_SEED_ENABLED !== "true") {
    throw new Error(
      "seedDemoUser runs on the dev deployment only (DEMO_SEED_ENABLED is not \"true\")",
    );
  }
  if (process.env.CONVEX_CLOUD_URL?.includes(PROD_DEPLOYMENT)) {
    throw new Error("seedDemoUser never runs on the production deployment");
  }
}

/**
 * Seeds a demo user with a row in every user-owned table
 * (lib/demoData.ts), so a preview against dev has something to show.
 * Idempotent: a user who already has any of that data is left alone, unless
 * `reset` is set, which first deletes the user's rows in those tables.
 * DEV ONLY (assertDemoSeedAllowed):
 *   npx convex env set DEMO_SEED_ENABLED true
 *   npx convex run seed:seedDemoUser
 *   npx convex run seed:seedDemoUser '{"userId": "user_…", "reset": true}'
 * Pass a Clerk dev user's subject as userId to sign in as the demo user.
 */
export const seedDemoUser = internalMutation({
  args: { userId: v.optional(v.string()), reset: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    assertDemoSeedAllowed();
    const userId = args.userId ?? DEMO_USER_ID;

    let deleted = 0;
    for (const table of DEMO_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      if (rows.length === 0) continue;
      if (!args.reset) return { userId, created: false, deleted: 0, inserted: 0 };
      for (const row of rows) await ctx.db.delete(row._id);
      deleted += rows.length;
    }

    const ids = await insertDemoData(ctx, userId);
    const inserted = Object.values(ids).reduce((n, list) => n + list.length, 0);
    return { userId, created: true, deleted, inserted };
  },
});
