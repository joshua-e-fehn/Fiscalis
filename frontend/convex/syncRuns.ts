import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  safeSyncCode,
  summarizeSyncRuns,
  SYNC_DIGEST_WINDOW_MS,
  SYNC_RUN_RETENTION_MS,
  type SyncDigest,
} from "../../services/health/syncRuns";
import {
  syncOutcomeStatusValidator,
  syncProviderValidator,
  syncTriggerValidator,
} from "./lib/syncRunValidators";

/**
 * The syncRuns ledger: every provider sync writes a row through
 * withSyncRun (convex/lib/syncRuns.ts). Internal only; the digest leaves
 * Convex through GET /health/sync-digest (convex/http.ts), behind the
 * monitor's shared secret, as counts and codes without user ids.
 */

/** Open a run (status running); returns its id for finishRun. */
export const startRun = internalMutation({
  args: {
    provider: syncProviderValidator,
    userId: v.string(),
    trigger: syncTriggerValidator,
  },
  returns: v.id("syncRuns"),
  handler: async (ctx, args) =>
    ctx.db.insert("syncRuns", {
      ...args,
      startedAt: Date.now(),
      status: "running",
    }),
});

/** Close a run with its outcome. */
export const finishRun = internalMutation({
  args: {
    runId: v.id("syncRuns"),
    status: syncOutcomeStatusValidator,
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, status, errorCode }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null; // pruned meanwhile
    // Only a code that fits the ledger's shape is stored
    const code = status === "success" ? undefined : safeSyncCode(errorCode) ?? "unknown";
    await ctx.db.patch(runId, {
      status,
      endedAt: Date.now(),
      ...(code ? { errorCode: code } : {}),
    });
    return null;
  },
});

/** Rows deleted per prune mutation; it reschedules itself while more remain. */
const PRUNE_BATCH = 500;

/** Delete runs older than SYNC_RUN_RETENTION_MS (daily cron, crons.ts). */
export const pruneRuns = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SYNC_RUN_RETENTION_MS;
    const old = await ctx.db
      .query("syncRuns")
      .withIndex("by_startedAt", (q) => q.lt("startedAt", cutoff))
      .take(PRUNE_BATCH);
    for (const run of old) await ctx.db.delete(run._id);
    if (old.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.syncRuns.pruneRuns, {});
    }
    return old.length;
  },
});

/** Rows the digest reads at most; beyond that it says it is truncated. */
const DIGEST_MAX_ROWS = 5000;

const providerDigestValidator = v.object({
  provider: syncProviderValidator,
  runs: v.number(),
  succeeded: v.number(),
  partial: v.number(),
  failed: v.number(),
  stuck: v.number(),
  usersAffected: v.number(),
  scheduledFailed: v.number(),
  topErrorCodes: v.array(v.object({ code: v.string(), count: v.number() })),
  lastSuccessAt: v.union(v.number(), v.null()),
});

/** The last 24 hours of runs as counts and codes per provider. */
export const failureDigest = internalQuery({
  args: { now: v.number() },
  returns: v.object({
    windowStart: v.number(),
    windowEnd: v.number(),
    runs: v.number(),
    problems: v.number(),
    truncated: v.boolean(),
    providers: v.array(providerDigestValidator),
  }),
  handler: async (ctx, { now }): Promise<SyncDigest> => {
    const rows = await ctx.db
      .query("syncRuns")
      .withIndex("by_startedAt", (q) =>
        q.gte("startedAt", now - SYNC_DIGEST_WINDOW_MS).lte("startedAt", now),
      )
      .order("desc")
      .take(DIGEST_MAX_ROWS + 1);
    return summarizeSyncRuns(rows.slice(0, DIGEST_MAX_ROWS), now, {
      truncated: rows.length > DIGEST_MAX_ROWS,
    });
  },
});
