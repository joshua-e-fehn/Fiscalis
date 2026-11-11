import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  dayWindows,
  fxRatesFromDaily,
  mergeFxDailyRates,
  MIRRORED_CURRENCIES,
  parseEcbCsv,
  parseFxDailyRates,
  type FxDailyRate,
  type FxRates,
} from "../../services/finance/currency";

/**
 * Mirror of the daily EUR-base FX rates into Convex, the single rate source
 * for base-currency conversion (services/finance/currency.ts).
 *
 * Two sources, merged per (day, currency) with the first one winning:
 * 1. the SQL `currency_exchange_rates` store (USD, CHF), which Convex
 *    functions can't read: the app serves it at `GET /api/fx/rates/daily`
 *    (public market data, no user data);
 * 2. the ECB euro reference rates (about 30 currencies, GBP included) from
 *    the public ECB data API.
 * A cron pulls the last days here, the same way convex/metalPrices.ts
 * mirrors spot prices.
 *
 * The refresh fails softly: a source or window that fails is logged and
 * skipped, and the stored rates are kept, so conversions keep using the
 * last known rate (flagged "stale" after FX_MAX_AGE_DAYS) or the flagged
 * fallback table while the mirror is empty.
 *
 * Override the app source with the `FX_RATES_URL` Convex env var (e.g. for
 * a local or preview app).
 */

const DEFAULT_FX_RATES_URL = "https://fiscalis.joshua-fehn.de/api/fx/rates/daily";
const ECB_RATES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A";

/** Days the cron re-reads, so a late or corrected row is picked up. */
const REFRESH_DAYS = 10;
/**
 * Days per request; a backfill is fetched window by window (the app route
 * accepts at most 4000 days per request).
 */
const WINDOW_DAYS = 365;
/** Rows per upsert mutation when backfilling a long history. */
const UPSERT_BATCH = 500;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function fetchAppRates(from: string, to: string): Promise<FxDailyRate[]> {
  const url = new URL(process.env.FX_RATES_URL ?? DEFAULT_FX_RATES_URL);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseFxDailyRates(await response.json());
}

async function fetchEcbRates(from: string, to: string): Promise<FxDailyRate[]> {
  const url = new URL(ECB_RATES_URL);
  url.searchParams.set("startPeriod", from);
  url.searchParams.set("endPeriod", to);
  url.searchParams.set("format", "csvdata");
  const response = await fetch(url, {
    headers: { Accept: "text/csv" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseEcbCsv(await response.text());
}

/**
 * Pull daily rates from both sources. Without `from`, the last
 * REFRESH_DAYS days (the cron); with it, history from that day (one-off
 * backfill, e.g. `{ from: "2015-01-01" }`), in WINDOW_DAYS windows.
 * `ok` is false only when no window got rows from either source.
 */
export const refreshFxRates = internalAction({
  args: { from: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), updated: v.number() }),
  handler: async (ctx, args): Promise<{ ok: boolean; updated: number }> => {
    const from = args.from ?? isoDay(Date.now() - REFRESH_DAYS * 86_400_000);
    const to = isoDay(Date.now());

    let updated = 0;
    let windowsWithRows = 0;
    for (const window of dayWindows(from, to, WINDOW_DAYS)) {
      const [app, ecb] = await Promise.allSettled([
        fetchAppRates(window.from, window.to),
        fetchEcbRates(window.from, window.to),
      ]);
      for (const [name, result] of [
        ["app", app],
        ["ECB", ecb],
      ] as const) {
        if (result.status === "rejected") {
          console.warn(
            `[fxRates] ${name} rates ${window.from}..${window.to} failed: ${errorMessage(result.reason)}`,
          );
        }
      }
      const rows = mergeFxDailyRates(
        app.status === "fulfilled" ? app.value : [],
        ecb.status === "fulfilled" ? ecb.value : [],
      );
      if (rows.length === 0) continue;
      windowsWithRows++;

      try {
        for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
          updated += await ctx.runMutation(internal.fxRates.upsertFxRates, {
            rates: rows.slice(i, i + UPSERT_BATCH),
          });
        }
      } catch (error) {
        console.warn(
          `[fxRates] storing ${window.from}..${window.to} failed: ${errorMessage(error)}`,
        );
      }
    }

    if (windowsWithRows === 0) {
      // Keep the last stored rates; conversions read whatever is there.
      console.warn(
        `[fxRates] refresh ${from}..${to} got no rates, keeping stored rates`,
      );
      return { ok: false, updated };
    }
    return { ok: true, updated };
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
 * The rate table: per currency the latest mirrored rate (flagged "stale"
 * when older than FX_MAX_AGE_DAYS), over the flagged fallback table for
 * currencies the mirror does not cover.
 *
 * With `asOf` (YYYY-MM-DD) it is the table of that day: the latest rate on
 * or before it, else the earliest one the mirror has (a date before its
 * history), with staleness measured from that day. `currencies` limits the
 * mirror reads to the codes a caller needs.
 */
export async function loadFxRates(
  ctx: { db: QueryCtx["db"] },
  options: { asOf?: string; currencies?: readonly string[] } = {},
): Promise<FxRates> {
  const { asOf } = options;
  const currencies = options.currencies ?? MIRRORED_CURRENCIES;
  const rows = await Promise.all(
    currencies.map(async (currency) => {
      if (asOf === undefined) {
        return await ctx.db
          .query("fxRates")
          .withIndex("by_currency_date", (q) => q.eq("currency", currency))
          .order("desc")
          .first();
      }
      const onOrBefore = await ctx.db
        .query("fxRates")
        .withIndex("by_currency_date", (q) =>
          q.eq("currency", currency).lte("date", asOf),
        )
        .order("desc")
        .first();
      return (
        onOrBefore ??
        (await ctx.db
          .query("fxRates")
          .withIndex("by_currency_date", (q) => q.eq("currency", currency))
          .order("asc")
          .first())
      );
    }),
  );
  const now = asOf === undefined ? Date.now() : Date.parse(asOf);
  return fxRatesFromDaily(
    rows.filter((row) => row !== null),
    Number.isFinite(now) ? now : Date.now(),
  );
}
