import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  dayWindows,
  fxRatesFromDaily,
  mergeFxDailyRates,
  MIRRORED_CURRENCIES,
  parseEcbCsv,
  type FxDailyRate,
  type FxRates,
} from "../../services/finance/currency";
import {
  toDisplayCurrency,
  type DisplayCurrency,
  type DisplayRatePoint,
} from "../../services/finance/displayCurrency";

/**
 * The daily EUR-base FX rates in Convex, the single rate source for
 * base-currency conversion (services/finance/currency.ts).
 *
 * Two sources, merged per (day, currency) with the first one winning:
 * 1. the minutely gold.de feed (USD, CHF): the last rate of each UTC day,
 *    read from the metal price day closes (convex/metalPrices.ts);
 * 2. the ECB euro reference rates (about 30 currencies, GBP included) from
 *    the public ECB data API.
 * A cron folds the last days in here.
 *
 * The refresh fails softly: a source or window that fails is logged and
 * skipped, and the stored rates are kept, so conversions keep using the
 * last known rate (flagged "stale" after FX_MAX_AGE_DAYS) or the flagged
 * fallback table while the mirror is empty.
 */

const ECB_RATES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A";

/** Days the cron re-reads, so a late or corrected row is picked up. */
const REFRESH_DAYS = 10;
/** Days per ECB request; a backfill is fetched window by window. */
const WINDOW_DAYS = 365;
/** Rows per upsert mutation when backfilling a long history. */
const UPSERT_BATCH = 500;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
      const [feed, ecb] = await Promise.allSettled([
        ctx.runQuery(internal.metalPrices.dailyFxRates, window),
        fetchEcbRates(window.from, window.to),
      ]);
      for (const [name, result] of [
        ["metal feed", feed],
        ["ECB", ecb],
      ] as const) {
        if (result.status === "rejected") {
          console.warn(
            `[fxRates] ${name} rates ${window.from}..${window.to} failed: ${errorMessage(result.reason)}`,
          );
        }
      }
      const rows = mergeFxDailyRates(
        feed.status === "fulfilled" ? feed.value : [],
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
    // Freshness for GET /health/deep: rows were fetched, changed or not
    await ctx.runMutation(internal.health.recordJobSuccess, { job: "fx-refresh" });
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

/** Most daily rows getDisplayRates returns (about 15 years of ECB days). */
const MAX_HISTORY_ROWS = 4_000;

const displayRateSource = v.union(
  v.literal("identity"),
  v.literal("market"),
  v.literal("stale"),
  v.literal("fallback"),
);

/** The latest rate of a display currency, as units per 1 EUR. */
export interface DisplayRate {
  unitsPerEur: number;
  /** Day of the rate (YYYY-MM-DD); null for EUR and fallback rates */
  date: string | null;
  source: "identity" | "market" | "stale" | "fallback";
}

/**
 * The rate point-in-time figures are converted at: the latest mirrored rate
 * of `currency` from loadFxRates (flagged "stale" or "fallback" when
 * degraded). EUR is the identity and reads nothing.
 */
export async function loadDisplayRate(
  ctx: { db: QueryCtx["db"] },
  currency: DisplayCurrency,
): Promise<DisplayRate> {
  if (currency === "EUR") return { unitsPerEur: 1, date: null, source: "identity" };
  const rate = (await loadFxRates(ctx, { currencies: [currency] }))[currency];
  if (!rate) {
    // Unreachable for the allowlist: the fallback table covers it
    throw new ConvexError(`No rate for display currency: ${currency}`);
  }
  return {
    unitsPerEur: 1 / rate.eurPerUnit,
    date: rate.date ?? null,
    source: rate.source,
  };
}

/**
 * Rates for showing EUR figures in a display currency
 * (services/finance/displayCurrency.ts). Public market data, no user data:
 * a live subscription, so a new day's rate updates every converted figure.
 *
 * `latest` is the rate for point-in-time figures, from loadFxRates (flagged
 * "stale" or "fallback" when degraded). With `since` (ms), `history` holds
 * the daily rows from that day on, led by the row on or before it, so a
 * series can be converted per date (displayCurrency.ts rateOn). Past
 * MAX_HISTORY_ROWS the newest rows are kept and the oldest dropped (days
 * before the first row then take its rate). EUR is the
 * identity and reads nothing. Codes outside DISPLAY_CURRENCIES are rejected.
 */
export const getDisplayRates = query({
  args: { currency: v.string(), since: v.optional(v.number()) },
  returns: v.object({
    currency: v.string(),
    latest: v.object({
      unitsPerEur: v.number(),
      date: v.union(v.string(), v.null()),
      source: displayRateSource,
    }),
    history: v.optional(
      v.array(v.object({ date: v.string(), unitsPerEur: v.number() })),
    ),
  }),
  handler: async (ctx, args) => {
    const currency = toDisplayCurrency(args.currency);
    if (!currency) {
      throw new ConvexError(`Unsupported display currency: ${args.currency}`);
    }
    // Validated for every currency, EUR included; the bound is the range a
    // JS Date (isoDay) accepts
    if (
      args.since !== undefined &&
      !(Number.isFinite(args.since) && Math.abs(args.since) <= 8.64e15)
    ) {
      throw new ConvexError("`since` must be a timestamp in ms");
    }
    const latest = await loadDisplayRate(ctx, currency);
    if (currency === "EUR") {
      return {
        currency,
        latest,
        ...(args.since === undefined ? {} : { history: [] }),
      };
    }
    if (args.since === undefined) return { currency, latest };

    const sinceDay = isoDay(args.since);
    // Newest first, so a cap drops the oldest days rather than the recent
    // ones (portfolioSnapshots.getSnapshots does the same)
    const newestFirst = await ctx.db
      .query("fxRates")
      .withIndex("by_currency_date", (q) =>
        q.eq("currency", currency).gt("date", sinceDay),
      )
      .order("desc")
      .take(MAX_HISTORY_ROWS);
    const rows = newestFirst.reverse();
    // The baseline (the row on or before `since`) leads the history only
    // when the rows still reach back to `since`; after a cut it would
    // bridge the dropped gap with a years-old rate
    const baseline =
      newestFirst.length < MAX_HISTORY_ROWS
        ? await ctx.db
            .query("fxRates")
            .withIndex("by_currency_date", (q) =>
              q.eq("currency", currency).lte("date", sinceDay),
            )
            .order("desc")
            .first()
        : null;
    const history: DisplayRatePoint[] = (baseline ? [baseline, ...rows] : rows)
      .filter((row) => row.unitsPerEur > 0)
      .map((row) => ({ date: row.date, unitsPerEur: row.unitsPerEur }));
    return { currency, latest, history };
  },
});
