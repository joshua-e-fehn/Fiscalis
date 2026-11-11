import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  fxRatesFromDaily,
  parseFxDailyRates,
  type FxRates,
} from "../../services/finance/currency";

/**
 * Mirror of the daily EUR-base FX rates into Convex, the single rate source
 * for base-currency conversion (services/finance/currency.ts).
 *
 * Rates live in the SQL `currency_exchange_rates` store, which Convex
 * functions can't read. The app serves them at `GET /api/fx/rates/daily`
 * (public market data, no user data), and a cron pulls the last days here,
 * the same way convex/metalPrices.ts mirrors spot prices.
 *
 * The refresh fails softly: on any error it logs and keeps the stored rates,
 * so conversions keep using the last known rate (or the flagged fallback
 * table while the mirror is empty).
 *
 * Override the source with the `FX_RATES_URL` Convex env var (e.g. for a
 * local or preview app).
 */

const DEFAULT_FX_RATES_URL = "https://fiscalis.joshua-fehn.de/api/fx/rates/daily";

/** Days the cron re-reads, so a late or corrected row is picked up. */
const REFRESH_DAYS = 10;
/** Rows per upsert mutation when backfilling a long history. */
const UPSERT_BATCH = 500;
/** Recent rows read to find the latest rate per currency. */
const LATEST_ROWS = 64;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Pull daily rates from the app. Without `from`, the last REFRESH_DAYS
 * days (the cron); with it, history from that day (one-off backfill, e.g.
 * `{ from: "2015-01-01" }`).
 */
export const refreshFxRates = internalAction({
  args: { from: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), updated: v.number() }),
  handler: async (ctx, args): Promise<{ ok: boolean; updated: number }> => {
    const from = args.from ?? isoDay(Date.now() - REFRESH_DAYS * 86_400_000);
    const url = new URL(process.env.FX_RATES_URL ?? DEFAULT_FX_RATES_URL);
    url.searchParams.set("from", from);
    url.searchParams.set("to", isoDay(Date.now()));

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rows = parseFxDailyRates(await response.json());
      if (rows.length === 0) {
        throw new Error("no usable rates in the response");
      }

      let updated = 0;
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        updated += await ctx.runMutation(internal.fxRates.upsertFxRates, {
          rates: rows.slice(i, i + UPSERT_BATCH),
        });
      }
      return { ok: true, updated };
    } catch (error) {
      // Keep the last stored rates; conversions read whatever is there.
      console.warn(
        `[fxRates] refresh failed, keeping stored rates: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: false, updated: 0 };
    }
  },
});

export const upsertFxRates = internalMutation({
  args: {
    rates: v.array(
      v.object({
        date: v.string(),
        currency: v.string(),
        unitsPerEur: v.number(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, { rates }) => {
    const fetchedAt = Date.now();
    let updated = 0;
    for (const rate of rates) {
      const existing = await ctx.db
        .query("fxRates")
        .withIndex("by_currency_date", (q) =>
          q.eq("currency", rate.currency).eq("date", rate.date),
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("fxRates", { ...rate, fetchedAt });
        updated++;
      } else if (existing.unitsPerEur !== rate.unitsPerEur) {
        await ctx.db.patch(existing._id, {
          unitsPerEur: rate.unitsPerEur,
          fetchedAt,
        });
        updated++;
      }
    }
    return updated;
  },
});

/**
 * The current rate table: the latest mirrored rate per currency, over the
 * flagged fallback table for currencies the mirror does not cover.
 */
export async function loadFxRates(ctx: {
  db: QueryCtx["db"];
}): Promise<FxRates> {
  const recent = await ctx.db
    .query("fxRates")
    .withIndex("by_date")
    .order("desc")
    .take(LATEST_ROWS);
  return fxRatesFromDaily(recent);
}
