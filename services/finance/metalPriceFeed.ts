/**
 * The precious-metal price feed: parsing the gold.de snapshot that the
 * Convex ingest cron (frontend/convex/metalPrices.ts) records every minute,
 * and turning stored hour/day closes into chart series.
 *
 * Storage model (frontend/convex/schema.ts):
 * - `metalPriceTicks`: one snapshot per minute, kept for TICK_RETENTION_MS.
 * - `metalPriceCloses`: the last snapshot of every UTC hour and UTC day,
 *   kept forever. Every chart and performance range reads these.
 *
 * All timestamps are ms since epoch, buckets are UTC.
 */
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, PLATFORM_LAUNCH_TIMESTAMP, type TimeRange } from "./financeService";
import type { FxDailyRate } from "./currency";
import { SPOT_METALS, type SpotMetal, type SpotPrice } from "./metals";

export type PriceCurrency = "eur" | "usd" | "chf";
export type CloseResolution = "hour" | "day";

/** Price per troy ounce of one metal. CHF is optional, as in the SQL store. */
export interface MetalQuote {
  eur: number;
  usd: number;
  chf?: number;
}

/** One observation of all four metals and the EUR rates. */
export interface MetalPriceSnapshot {
  /** Observation minute (ms, floored to the minute) */
  timestamp: number;
  prices: Record<SpotMetal, MetalQuote>;
  /** USD per 1 EUR */
  eurToUsd: number;
  /** CHF per 1 EUR */
  eurToChf?: number;
}

/** Raw minutely snapshots older than this are pruned; closes stay. */
export const TICK_RETENTION_MS = 7 * MS_PER_DAY;

export const GOLD_DE_URL = "https://www.gold.de/cache/api.json";

/** gold.de field prefix per metal (German names). */
const GOLD_DE_METAL_KEYS: Record<SpotMetal, string> = {
  gold: "gold",
  silver: "silber",
  platinum: "platin",
  palladium: "palladium",
};

const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

export function floorTo(ms: number, step: number): number {
  return ms - (((ms % step) + step) % step);
}

/** Start (ms) of the UTC bucket that holds `ms`. */
export function bucketStart(ms: number, resolution: CloseResolution): number {
  return floorTo(ms, resolution === "hour" ? MS_PER_HOUR : MS_PER_DAY);
}

/**
 * Parse the gold.de cache API (`/cache/api.json`) into a snapshot taken at
 * `observedAt` (floored to the minute, like the old Supabase writer: the
 * row's time is when it was fetched).
 *
 * Untrusted input: the snapshot is rejected (null) unless every metal has a
 * positive EUR and USD ounce price and the EUR/USD rate is positive, which
 * are the NOT NULL columns of the old SQL table. CHF prices and the EUR/CHF
 * rate are kept only when valid.
 */
export function parseGoldDeSnapshot(
  json: unknown,
  observedAt: number,
): MetalPriceSnapshot | null {
  if (typeof json !== "object" || json === null) return null;
  const body = json as Record<string, unknown>;

  const prices = {} as Record<SpotMetal, MetalQuote>;
  for (const metal of SPOT_METALS) {
    const key = GOLD_DE_METAL_KEYS[metal];
    const eur = positive(body[`au_${key}_eur_o`]);
    const usd = positive(body[`au_${key}_usd_o`]);
    if (eur === undefined || usd === undefined) return null;
    const chf = positive(body[`au_${key}_chf_o`]);
    prices[metal] = chf === undefined ? { eur, usd } : { eur, usd, chf };
  }

  const eurToUsd = positive(body.au_wechselkurs_eur_usd);
  if (eurToUsd === undefined) return null;
  const eurToChf = positive(body.au_wechselkurs_eur_chf);

  return {
    timestamp: floorTo(observedAt, MS_PER_MINUTE),
    prices,
    eurToUsd,
    ...(eurToChf === undefined ? {} : { eurToChf }),
  };
}

/** The EUR spot prices of a snapshot, for the `metalSpotPrices` mirror. */
export function spotPricesFromSnapshot(
  snapshot: MetalPriceSnapshot,
): SpotPrice[] {
  return SPOT_METALS.map((metalType) => ({
    metalType,
    eurPerOunce: snapshot.prices[metalType].eur,
    sourceTimestamp: snapshot.timestamp,
  }));
}

/** A metal's price in a currency, or null where none was recorded. */
export function snapshotPrice(
  snapshot: Pick<MetalPriceSnapshot, "prices">,
  metal: SpotMetal,
  currency: PriceCurrency,
): number | null {
  return snapshot.prices[metal]?.[currency] ?? null;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Daily FX rows (USD, CHF per EUR) from day closes: the last observation of
 * each UTC day, which is what the old `GET /api/fx/rates/daily` served.
 */
export function fxRatesFromDayCloses(
  closes: readonly Pick<
    MetalPriceSnapshot,
    "timestamp" | "eurToUsd" | "eurToChf"
  >[],
): FxDailyRate[] {
  const rows: FxDailyRate[] = [];
  for (const close of closes) {
    const date = isoDay(close.timestamp);
    if (close.eurToUsd > 0) {
      rows.push({ date, currency: "USD", unitsPerEur: close.eurToUsd });
    }
    if (close.eurToChf !== undefined && close.eurToChf > 0) {
      rows.push({ date, currency: "CHF", unitsPerEur: close.eurToChf });
    }
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════
// Chart series from stored closes
// ═══════════════════════════════════════════════════════════════

/** One chart point; `price` is null where no close was recorded (a gap). */
export interface ClosePoint {
  timestamp: number;
  price: number | null;
}

/** A stored close: the last snapshot of its bucket. */
export type StoredClose = Pick<MetalPriceSnapshot, "timestamp" | "prices"> & {
  bucketStart: number;
};

/** 23:59 UTC of the day that holds `ms`: the label of a daily slot. */
export const dayCloseLabel = (ms: number) =>
  bucketStart(ms, "day") + MS_PER_DAY - MS_PER_MINUTE;

function addUtcMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

/**
 * The daily slots (each a day's 23:59 UTC) a price chart shows for a range,
 * up to yesterday; the caller appends the latest price as today's point.
 * Mirrors the old SQL `/historical` route: Week, Month and 3/6 Month step a
 * day, Year, YTD and 3/5 Year step a week, ALL steps a quarter from the
 * platform launch. `Hour` and `Day` are served from hourly closes instead
 * and return no daily slots.
 */
export function dailyChartSlots(range: TimeRange, now: number): number[] {
  const today = bucketStart(now, "day");
  const yesterdayLabel = today - MS_PER_MINUTE;
  const year = new Date(now).getUTCFullYear();

  let start: number;
  let step: "day" | "week" | "quarter";
  switch (range) {
    case "Hour":
    case "Day":
      return [];
    case "Week":
      start = today - 7 * MS_PER_DAY;
      step = "day";
      break;
    case "Month":
      start = addUtcMonths(today, -1);
      step = "day";
      break;
    case "3Month":
      start = addUtcMonths(today, -3);
      step = "day";
      break;
    case "6Month":
      start = addUtcMonths(today, -6);
      step = "day";
      break;
    case "Year":
      start = addUtcMonths(today, -12);
      step = "week";
      break;
    case "3Year":
      start = addUtcMonths(today, -36);
      step = "week";
      break;
    case "5Year":
      start = addUtcMonths(today, -60);
      step = "week";
      break;
    case "YTD":
      start = Date.UTC(year, 0, 1);
      step = "week";
      break;
    case "ALL":
      start = PLATFORM_LAUNCH_TIMESTAMP;
      step = "quarter";
      break;
  }

  const slots: number[] = [];
  let day = bucketStart(start, "day");
  if (step === "quarter") {
    const d = new Date(day);
    day = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
  }
  while (dayCloseLabel(day) <= yesterdayLabel) {
    slots.push(dayCloseLabel(day));
    day =
      step === "day"
        ? day + MS_PER_DAY
        : step === "week"
          ? day + 7 * MS_PER_DAY
          : addUtcMonths(day, 3);
  }
  return slots;
}

/**
 * The value at each daily slot: that day's close (its last price), or null
 * where the day has none. Same-day only, like the old SQL route: a day
 * without a price is a gap, not the previous day's close.
 */
export function sampleDayCloses(
  closes: readonly StoredClose[],
  slots: readonly number[],
  metal: SpotMetal,
  currency: PriceCurrency,
): ClosePoint[] {
  const byDay = new Map<number, StoredClose>();
  for (const close of closes) byDay.set(close.bucketStart, close);
  return slots.map((slot) => {
    const close = byDay.get(bucketStart(slot, "day"));
    return {
      timestamp: slot,
      price: close ? snapshotPrice(close, metal, currency) : null,
    };
  });
}

/** Every close as a point at its observation time, in bucket order. */
export function closePoints(
  closes: readonly StoredClose[],
  metal: SpotMetal,
  currency: PriceCurrency,
): ClosePoint[] {
  return [...closes]
    .sort((a, b) => a.bucketStart - b.bucketStart)
    .map((close) => ({
      timestamp: close.timestamp,
      price: snapshotPrice(close, metal, currency),
    }));
}

/** Mondays (UTC midnight) from the week holding `from` to the week holding `to`. */
export function weekStarts(from: number, to: number): number[] {
  // 1970-01-01 was a Thursday: shift so weeks start on Monday
  const monday = (ms: number) =>
    floorTo(ms - 4 * MS_PER_DAY, 7 * MS_PER_DAY) + 4 * MS_PER_DAY;
  const starts: number[] = [];
  for (let day = monday(from); day <= monday(to); day += 7 * MS_PER_DAY) {
    starts.push(day);
  }
  return starts;
}

// ═══════════════════════════════════════════════════════════════
// Windows and series the frontend hooks read (hooks/metals.ts)
// ═══════════════════════════════════════════════════════════════

/** The latest snapshot's price, as a point at its observation time. */
function latestPoint(
  latest: Pick<MetalPriceSnapshot, "timestamp" | "prices"> | null | undefined,
  metal: SpotMetal,
  currency: PriceCurrency,
): ClosePoint | null {
  if (!latest) return null;
  const price = snapshotPrice(latest, metal, currency);
  return price === null ? null : { timestamp: latest.timestamp, price };
}

/**
 * The closes a price chart of `range` reads: bucket starts in [from, to).
 * `to` is the current bucket, so today's minutely writes don't re-run the
 * subscription; the series ends at the latest snapshot instead.
 */
export interface CloseWindow {
  resolution: CloseResolution;
  from: number;
  to: number;
}

export interface ChartWindow extends CloseWindow {
  /** Daily slots to sample, or null to plot every (hourly) close */
  slots: number[] | null;
}

export function chartWindow(range: TimeRange, now: number): ChartWindow {
  if (range === "Hour" || range === "Day") {
    const to = bucketStart(now, "hour");
    return { resolution: "hour", from: to - MS_PER_DAY, to, slots: null };
  }
  const slots = dailyChartSlots(range, now);
  const to = bucketStart(now, "day");
  return {
    resolution: "day",
    from: slots.length > 0 ? bucketStart(slots[0], "day") : to,
    to,
    slots,
  };
}

/**
 * A price chart's series: the sampled closes (gaps kept, leading gaps
 * before the first recorded price dropped) ending at the latest price.
 */
export function chartSeries(
  window: ChartWindow,
  closes: readonly StoredClose[],
  latest: Pick<MetalPriceSnapshot, "timestamp" | "prices"> | null | undefined,
  metal: SpotMetal,
  currency: PriceCurrency,
): ClosePoint[] {
  const points =
    window.slots === null
      ? closePoints(closes, metal, currency)
      : sampleDayCloses(closes, window.slots, metal, currency);
  const first = points.findIndex((p) => p.price !== null);
  const series = first < 0 ? [] : points.slice(first);
  const end = latestPoint(latest, metal, currency);
  if (end && (series.length === 0 || end.timestamp > series.at(-1)!.timestamp)) {
    series.push(end);
  }
  return series;
}

type HistoryInterval = "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";

/** The closes a price history fetch from `from` reads (see historyPoints). */
export function historyWindow(
  interval: HistoryInterval,
  from: number,
  now: number,
): CloseWindow {
  const resolution: CloseResolution =
    interval === "minute" || interval === "hour" ? "hour" : "day";
  return { resolution, from: bucketStart(from, resolution), to: bucketStart(now, resolution) };
}

/**
 * Recorded closes from `from` to now, as the old `/range` route labelled
 * them: hours at hh:59, days at 23:59, weeks at Monday 23:59 (that
 * Monday's close). The current bucket takes the latest price. Gaps are
 * dropped: the performance strategies bridge them themselves. Minute is
 * served hourly; month, quarter and year are served daily.
 */
export function historyPoints(
  interval: HistoryInterval,
  closes: readonly StoredClose[],
  latest: Pick<MetalPriceSnapshot, "timestamp" | "prices"> | null | undefined,
  metal: SpotMetal,
  currency: PriceCurrency,
  from: number,
  now: number,
): { timestamp: number; price: number }[] {
  const live = latestPoint(latest, metal, currency);
  let points: ClosePoint[];
  if (interval === "minute" || interval === "hour") {
    points = [...closes]
      .sort((a, b) => a.bucketStart - b.bucketStart)
      .map((c) => ({
        timestamp: c.bucketStart + MS_PER_HOUR - MS_PER_MINUTE,
        price: snapshotPrice(c, metal, currency),
      }));
    if (live) {
      points.push({
        timestamp: bucketStart(now, "hour") + MS_PER_HOUR - MS_PER_MINUTE,
        price: live.price,
      });
    }
  } else if (interval === "week") {
    const byDay = new Map(closes.map((c) => [c.bucketStart, c] as const));
    const today = bucketStart(now, "day");
    points = weekStarts(from, now).map((monday) => {
      const close = byDay.get(monday);
      return {
        timestamp: dayCloseLabel(monday),
        price:
          monday === today
            ? (live?.price ?? null)
            : close
              ? snapshotPrice(close, metal, currency)
              : null,
      };
    });
  } else {
    points = [...closes]
      .sort((a, b) => a.bucketStart - b.bucketStart)
      .map((c) => ({
        timestamp: dayCloseLabel(c.bucketStart),
        price: snapshotPrice(c, metal, currency),
      }));
    if (live) points.push({ timestamp: dayCloseLabel(now), price: live.price });
  }
  return points.filter(
    (p): p is { timestamp: number; price: number } =>
      p.price !== null && p.price > 0,
  );
}
