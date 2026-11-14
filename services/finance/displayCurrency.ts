/**
 * Display currency: the currency the UI shows a user's figures in.
 *
 * Every stored value, snapshot and server aggregate stays in EUR (the base
 * currency, see currency.ts). The frontend data hooks convert their EUR
 * outputs once, at the presentation boundary, with these helpers:
 * point-in-time figures at the latest rate (fromEur), time series at each
 * day's rate (rateOn, snapshotInCurrency, seriesInCurrency), so returns
 * computed on converted inputs are display-currency returns.
 *
 * Rates are units of the display currency per 1 EUR, the fxRates table's
 * `unitsPerEur`, served by convex/fxRates.ts getDisplayRates.
 *
 * Framework-free so the Convex bundle, Next.js and vitest can all import it.
 */

/**
 * Currencies a user can pick to see their figures in. Each has an ECB or
 * SQL mirror row and a fallback rate (currency.ts), and a suffix in
 * frontend/lib/utils/currency.ts. The onboarding Currency type, the
 * settings select and server-side validation derive from this list.
 */
export const DISPLAY_CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export function isDisplayCurrency(code: unknown): code is DisplayCurrency {
  return (
    typeof code === "string" &&
    (DISPLAY_CURRENCIES as readonly string[]).includes(code)
  );
}

/** A stored code ("eur", "GBP") as a display currency; null for any other. */
export function toDisplayCurrency(
  code: string | null | undefined,
): DisplayCurrency | null {
  const upper = code?.trim().toUpperCase();
  return isDisplayCurrency(upper) ? upper : null;
}

/** An EUR amount in the display currency: amount × units per EUR. */
export function fromEur(amountEur: number, unitsPerEur: number): number {
  return amountEur * unitsPerEur;
}

// ═══════════════════════════════════════════════════════════════
// Rates by day
// ═══════════════════════════════════════════════════════════════

/** One daily rate of the display currency (an fxRates row). */
export interface DisplayRatePoint {
  /** UTC day, YYYY-MM-DD */
  date: string;
  /** Units of the display currency per 1 EUR */
  unitsPerEur: number;
}

/** A day as YYYY-MM-DD: an ISO day as given, a timestamp (ms) as its UTC day. */
function dayOf(day: string | number): string {
  return typeof day === "number"
    ? new Date(day).toISOString().slice(0, 10)
    : day.slice(0, 10);
}

/**
 * The rate of `day` from a history sorted by date ascending: the latest
 * row on or before it, so weekends and holidays carry the previous rate
 * forward; for a day before the history, the earliest row (the same rule
 * as convex/fxRates.ts loadFxRates with `asOf`). Null for an empty history.
 */
export function rateOn(
  history: readonly DisplayRatePoint[],
  day: string | number,
): number | null {
  if (history.length === 0) return null;
  const target = dayOf(day);
  // Binary search for the last row with date <= target
  let lo = 0;
  let hi = history.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].date <= target) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return history[found === -1 ? 0 : found].unitsPerEur;
}

// ═══════════════════════════════════════════════════════════════
// Snapshots and series
// ═══════════════════════════════════════════════════════════════

/** Money fields of a snapshot holding entry (aggregate.ts SnapshotHoldingEntry). */
interface HoldingLike {
  value: number;
  /** Base-currency cost; `costNative` is in its own currency and is kept */
  cost?: number;
}

/** Money fields of a snapshot source entry (aggregate.ts SnapshotSourceEntry). */
interface SourceLike {
  value: number;
  costBasis?: number;
  coveredValue?: number;
  netFlow?: number;
  holdings?: HoldingLike[];
}

/** Money fields of a category entry (aggregate.ts SnapshotCategoryEntry). */
interface CategoryLike {
  value: number;
  costBasis?: number;
  coveredValue?: number;
  netFlow?: number;
  sources?: SourceLike[];
}

/** Money fields of a portfolio snapshot (performance/types.ts SnapshotData). */
export interface SnapshotLike {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalCostBasis?: number;
  totalCoveredValue?: number;
  categoryBreakdown?: CategoryLike[];
}

/**
 * Keep an optional field absent rather than present-but-undefined, so a
 * converted object has the same keys as the original.
 */
function withScaled<T extends object, K extends keyof T>(
  target: T,
  keys: readonly K[],
  rate: number,
): T {
  const out = { ...target };
  for (const key of keys) {
    const amount = target[key];
    if (typeof amount === "number") {
      (out as Record<K, unknown>)[key] = amount * rate;
    }
  }
  return out;
}

/**
 * A snapshot with every money field in the display currency: the totals,
 * cost and covered value, and each category's value, cost, covered value
 * and net flow, down to its sources and their holdings. Non-money fields
 * (timestamps, flags, holding keys, native costs) are kept as they are.
 */
export function snapshotInCurrency<T extends SnapshotLike>(
  snapshot: T,
  unitsPerEur: number,
): T {
  if (unitsPerEur === 1) return snapshot;
  const converted = withScaled(
    snapshot,
    [
      "totalAssets",
      "totalLiabilities",
      "netWorth",
      "totalCostBasis",
      "totalCoveredValue",
    ] as const,
    unitsPerEur,
  );
  if (!snapshot.categoryBreakdown) return converted;
  return {
    ...converted,
    categoryBreakdown: snapshot.categoryBreakdown.map((category) => {
      const entry = withScaled(
        category,
        ["value", "costBasis", "coveredValue", "netFlow"] as const,
        unitsPerEur,
      );
      if (!category.sources) return entry;
      return {
        ...entry,
        sources: category.sources.map((source) => {
          const s = withScaled(
            source,
            ["value", "costBasis", "coveredValue", "netFlow"] as const,
            unitsPerEur,
          );
          if (!source.holdings) return s;
          return {
            ...s,
            holdings: source.holdings.map((h) =>
              withScaled(h, ["value", "cost"] as const, unitsPerEur),
            ),
          };
        }),
      };
    }),
  };
}

/**
 * An EUR series (prices, values) in the display currency, each point at
 * its own day's rate (rateOn). Points the history cannot place (an empty
 * history) use `fallbackUnitsPerEur`, normally the latest rate.
 */
export function seriesInCurrency<T extends { timestamp: number; value: number }>(
  points: readonly T[],
  history: readonly DisplayRatePoint[],
  fallbackUnitsPerEur: number,
): T[] {
  return points.map((point) => ({
    ...point,
    value: fromEur(
      point.value,
      rateOn(history, point.timestamp) ?? fallbackUnitsPerEur,
    ),
  }));
}
