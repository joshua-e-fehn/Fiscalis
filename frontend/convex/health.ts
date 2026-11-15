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
    newestArchivedRows: v.union(v.number(), v.null()),
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
      newestArchivedRows: archived?.rows ?? null,
      fxRefreshedAt,
      providerSyncedAt,
    };
  },
});

/** Days the archive ledger returns by default, and at most. */
export const LEDGER_DEFAULT_DAYS = 30;
export const LEDGER_MAX_DAYS = 1000;

/**
 * The newest `days` entries of the metalPriceArchive log, newest first,
 * for GET /health/metal-archive-ledger: the off-site monitor compares each
 * with the S3 object's size and checksum. Public price metadata only.
 */
export const metalArchiveLedger = internalQuery({
  args: { days: v.optional(v.number()) },
  returns: v.array(
    v.object({
      day: v.string(),
      key: v.string(),
      rows: v.number(),
      bytes: v.number(),
      sha256: v.string(),
    }),
  ),
  handler: async (ctx, { days = LEDGER_DEFAULT_DAYS }) => {
    const requested = Number.isFinite(days) ? Math.floor(days) : LEDGER_DEFAULT_DAYS;
    const limit = Math.min(LEDGER_MAX_DAYS, Math.max(1, requested));
    const rows = await ctx.db
      .query("metalPriceArchive")
      .withIndex("by_day")
      .order("desc")
      .take(limit);
    return rows.map(({ day, key, rows, bytes, sha256 }) => ({
      day,
      key,
      rows,
      bytes,
      sha256,
    }));
  },
});
