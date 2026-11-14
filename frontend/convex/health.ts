import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { FreshnessInputs } from "../../services/health/freshness";

/**
 * Feed and cron freshness behind GET /health/deep (convex/http.ts). Each
 * input is one indexed read of the newest row, so the check costs a few
 * document reads however large the tables grow, and only timestamps leave
 * here (services/health/freshness.ts evaluates them).
 */

const jobValidator = v.union(v.literal("fx-refresh"), v.literal("provider-sync"));

/** Upsert a scheduled job's last success time (one row per job). */
export const recordJobSuccess = internalMutation({
  args: { job: jobValidator },
  returns: v.null(),
  handler: async (ctx, { job }) => {
    const lastSuccessAt = Date.now();
    const existing = await ctx.db
      .query("jobHeartbeats")
      .withIndex("by_job", (q) => q.eq("job", job))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { lastSuccessAt });
    else await ctx.db.insert("jobHeartbeats", { job, lastSuccessAt });
    return null;
  },
});

export const freshnessInputs = internalQuery({
  args: {},
  returns: v.object({
    newestTickAt: v.union(v.number(), v.null()),
    newestArchivedDay: v.union(v.string(), v.null()),
    fxRefreshedAt: v.union(v.number(), v.null()),
    providerSyncedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx): Promise<FreshnessInputs> => {
    const heartbeat = async (job: "fx-refresh" | "provider-sync") =>
      (
        await ctx.db
          .query("jobHeartbeats")
          .withIndex("by_job", (q) => q.eq("job", job))
          .unique()
      )?.lastSuccessAt ?? null;

    const [tick, archived, fxRefreshedAt, providerSyncedAt] = await Promise.all([
      ctx.db
        .query("metalPriceTicks")
        .withIndex("by_timestamp")
        .order("desc")
        .first(),
      ctx.db
        .query("metalPriceArchive")
        .withIndex("by_day")
        .order("desc")
        .first(),
      heartbeat("fx-refresh"),
      heartbeat("provider-sync"),
    ]);
    return {
      newestTickAt: tick?.timestamp ?? null,
      newestArchivedDay: archived?.day ?? null,
      fxRefreshedAt,
      providerSyncedAt,
    };
  },
});
