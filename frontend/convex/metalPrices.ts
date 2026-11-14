import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  closeResolutionValidator,
  metalPriceSnapshotValidator,
} from "./lib/metalPriceValidators";
import {
  GOLD_DE_URL,
  TICK_RETENTION_MS,
  bucketStart,
  fxRatesFromDayCloses,
  parseGoldDeSnapshot,
  spotPricesFromSnapshot,
  type CloseResolution,
  type MetalPriceSnapshot,
} from "../../services/finance/metalPriceFeed";
import {
  SPOT_PRICE_MAX_FUTURE_SKEW_MS,
  type SpotPrice,
} from "../../services/finance/metals";

/**
 * Precious-metal prices: a minutely gold.de snapshot, stored as raw ticks
 * (pruned after TICK_RETENTION_MS) and as hour/day closes (kept forever),
 * plus the one-row-per-metal `metalSpotPrices` mirror that server-side net
 * worth (lib/netWorth.ts) values vault items with. The day closes also
 * feed the USD/CHF rates of convex/fxRates.ts.
 *
 * This replaces the Supabase edge function + pg_cron writer and the SQL
 * `precious_metal_prices` / `currency_exchange_rates` tables.
 *
 * Override the source with the `METAL_PRICES_URL` Convex env var.
 */

const CLOSE_RESOLUTIONS: readonly CloseResolution[] = ["hour", "day"];
/** Upper bound on closes one query returns (day closes since 2024: ~1k). */
const MAX_CLOSES = 4000;
/** Ticks deleted per prune mutation; it reschedules itself until done. */
const PRUNE_BATCH = 1000;
/**
 * The spot mirror is rewritten only when a price moves or its timestamp is
 * this stale: every per-user net-worth query reads it, so a minutely patch
 * would re-run them all every minute.
 */
const SPOT_REFRESH_MS = 15 * 60 * 1000;

type SnapshotDoc = Pick<
  Doc<"metalPriceTicks">,
  "timestamp" | "prices" | "eurToUsd" | "eurToChf"
>;

const snapshotOf = (doc: SnapshotDoc): MetalPriceSnapshot => ({
  timestamp: doc.timestamp,
  prices: doc.prices,
  eurToUsd: doc.eurToUsd,
  ...(doc.eurToChf === undefined ? {} : { eurToChf: doc.eurToChf }),
});

// ═══════════════════════════════════════════════════════════════
// Ingest (cron, every minute)
// ═══════════════════════════════════════════════════════════════

export const ingestGoldDe = internalAction({
  args: {},
  returns: v.object({ timestamp: v.number(), inserted: v.boolean() }),
  handler: async (ctx): Promise<{ timestamp: number; inserted: boolean }> => {
    const observedAt = Date.now();
    const url = new URL(process.env.METAL_PRICES_URL ?? GOLD_DE_URL);
    // Cache buster, as the old writer sent: the CDN otherwise serves stale JSON
    url.searchParams.set("_", String(Math.floor(observedAt / 1000)));
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`gold.de fetch failed: HTTP ${response.status}`);
    }
    const snapshot = parseGoldDeSnapshot(await response.json(), observedAt);
    if (!snapshot) {
      throw new Error("gold.de returned no usable prices");
    }
    const inserted: boolean = await ctx.runMutation(
      internal.metalPrices.recordSnapshot,
      { snapshot },
    );
    return { timestamp: snapshot.timestamp, inserted };
  },
});

/**
 * Store one snapshot: a tick (once per minute), the hour and day closes it
 * advances, and the EUR spot mirror. Returns false for a minute already
 * recorded.
 */
export const recordSnapshot = internalMutation({
  args: { snapshot: metalPriceSnapshotValidator },
  returns: v.boolean(),
  handler: async (ctx, { snapshot }) => {
    const inserted = await insertTick(ctx, snapshot);
    if (!inserted) return false;
    for (const resolution of CLOSE_RESOLUTIONS) {
      await upsertClose(ctx, resolution, snapshot);
    }
    await writeSpotPrices(ctx, spotPricesFromSnapshot(snapshot));
    return true;
  },
});

async function insertTick(
  ctx: MutationCtx,
  snapshot: MetalPriceSnapshot,
): Promise<boolean> {
  const existing = await ctx.db
    .query("metalPriceTicks")
    .withIndex("by_timestamp", (q) => q.eq("timestamp", snapshot.timestamp))
    .first();
  if (existing) return false;
  await ctx.db.insert("metalPriceTicks", snapshot);
  return true;
}

/** Newer-wins: a bucket's close is its latest snapshot. */
async function upsertClose(
  ctx: MutationCtx,
  resolution: CloseResolution,
  snapshot: MetalPriceSnapshot,
): Promise<void> {
  const start = bucketStart(snapshot.timestamp, resolution);
  const existing = await ctx.db
    .query("metalPriceCloses")
    .withIndex("by_resolution_bucket", (q) =>
      q.eq("resolution", resolution).eq("bucketStart", start),
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("metalPriceCloses", {
      resolution,
      bucketStart: start,
      ...snapshot,
    });
  } else if (snapshot.timestamp > existing.timestamp) {
    await ctx.db.replace(existing._id, {
      resolution,
      bucketStart: start,
      ...snapshot,
    });
  }
}

/** Newer-wins upsert of the one-row-per-metal EUR spot mirror. */
async function writeSpotPrices(
  ctx: MutationCtx,
  prices: readonly SpotPrice[],
): Promise<void> {
  const fetchedAt = Date.now();
  for (const price of prices) {
    const existing = await ctx.db
      .query("metalSpotPrices")
      .withIndex("by_metal", (q) => q.eq("metalType", price.metalType))
      .unique();
    if (!existing) {
      await ctx.db.insert("metalSpotPrices", { ...price, fetchedAt });
    } else if (
      (price.sourceTimestamp > existing.sourceTimestamp &&
        (price.eurPerOunce !== existing.eurPerOunce ||
          price.sourceTimestamp - existing.sourceTimestamp >= SPOT_REFRESH_MS)) ||
      // Self-heal a stored row whose timestamp lies in the future.
      existing.sourceTimestamp - fetchedAt > SPOT_PRICE_MAX_FUTURE_SKEW_MS
    ) {
      await ctx.db.patch(existing._id, { ...price, fetchedAt });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Retention (cron, daily) and one-off backfill
// ═══════════════════════════════════════════════════════════════

/**
 * Delete ticks older than TICK_RETENTION_MS; closes are kept. The newest
 * tick always stays, so `latest` survives a feed outage longer than the
 * retention window.
 */
export const pruneTicks = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const newest = await ctx.db
      .query("metalPriceTicks")
      .withIndex("by_timestamp")
      .order("desc")
      .first();
    if (!newest) return 0;
    const cutoff = Math.min(Date.now() - TICK_RETENTION_MS, newest.timestamp);
    const old = await ctx.db
      .query("metalPriceTicks")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .take(PRUNE_BATCH);
    for (const tick of old) await ctx.db.delete(tick._id);
    if (old.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.metalPrices.pruneTicks, {});
    }
    return old.length;
  },
});

/**
 * Backfill history exported from the old SQL store, in batches. Idempotent
 * and safe next to the live cron: ticks skip a recorded minute, closes are
 * newer-wins, and the spot mirror is not touched.
 */
export const importHistory = internalMutation({
  args: {
    ticks: v.optional(v.array(metalPriceSnapshotValidator)),
    closes: v.optional(
      v.array(
        v.object({
          resolution: closeResolutionValidator,
          snapshot: metalPriceSnapshotValidator,
        }),
      ),
    ),
  },
  returns: v.object({ ticks: v.number(), closes: v.number() }),
  handler: async (ctx, args) => {
    let ticks = 0;
    for (const snapshot of args.ticks ?? []) {
      if (await insertTick(ctx, snapshot)) ticks++;
    }
    for (const { resolution, snapshot } of args.closes ?? []) {
      await upsertClose(ctx, resolution, snapshot);
    }
    return { ticks, closes: args.closes?.length ?? 0 };
  },
});

// ═══════════════════════════════════════════════════════════════
// Reads (public market data, no user data)
// ═══════════════════════════════════════════════════════════════

const snapshotReturn = v.object({
  timestamp: v.number(),
  prices: metalPriceSnapshotValidator.fields.prices,
  eurToUsd: v.number(),
  eurToChf: v.optional(v.number()),
});

/** The latest snapshot (all metals, EUR/USD/CHF, rates), or null if none. */
export const latest = query({
  args: {},
  returns: v.union(snapshotReturn, v.null()),
  handler: async (ctx) => {
    const tick = await ctx.db
      .query("metalPriceTicks")
      .withIndex("by_timestamp")
      .order("desc")
      .first();
    return tick ? snapshotOf(tick) : null;
  },
});

/**
 * Hour or day closes with bucket starts in [from, to), oldest first. Pass a
 * `to` at or before the current bucket to keep the subscription from
 * re-running on every minute's write, and append `latest` instead.
 */
export const closes = query({
  args: {
    resolution: closeResolutionValidator,
    from: v.number(),
    to: v.number(),
  },
  returns: v.array(
    v.object({
      bucketStart: v.number(),
      timestamp: v.number(),
      prices: metalPriceSnapshotValidator.fields.prices,
    }),
  ),
  handler: async (ctx, { resolution, from, to }) => {
    const rows = await ctx.db
      .query("metalPriceCloses")
      .withIndex("by_resolution_bucket", (q) =>
        q
          .eq("resolution", resolution)
          .gte("bucketStart", from)
          .lt("bucketStart", to),
      )
      .take(MAX_CLOSES);
    return rows.map(({ bucketStart, timestamp, prices }) => ({
      bucketStart,
      timestamp,
      prices,
    }));
  },
});

/** Daily USD/CHF rates (YYYY-MM-DD, inclusive) from the day closes, for convex/fxRates.ts. */
export const dailyFxRates = internalQuery({
  args: { from: v.string(), to: v.string() },
  returns: v.array(
    v.object({
      date: v.string(),
      currency: v.string(),
      unitsPerEur: v.number(),
    }),
  ),
  handler: async (ctx, { from, to }) => {
    const rows = await ctx.db
      .query("metalPriceCloses")
      .withIndex("by_resolution_bucket", (q) =>
        q
          .eq("resolution", "day")
          .gte("bucketStart", Date.parse(`${from}T00:00:00Z`))
          .lte("bucketStart", Date.parse(`${to}T00:00:00Z`)),
      )
      .take(MAX_CLOSES);
    return fxRatesFromDayCloses(rows);
  },
});
