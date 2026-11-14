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
 * A copy of `target` with the money fields `keys` multiplied by `rate`.
 * A field that is not a number (null, absent) is kept as it is, so a
 * converted object has the same keys as the original and "no value"
 * stays "no value".
 */
export function scaleMoney<T extends object, K extends keyof T>(
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
  const converted = scaleMoney(
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
      const entry = scaleMoney(
        category,
        ["value", "costBasis", "coveredValue", "netFlow"] as const,
        unitsPerEur,
      );
      if (!category.sources) return entry;
      return {
        ...entry,
        sources: category.sources.map((source) => {
          const s = scaleMoney(
            source,
            ["value", "costBasis", "coveredValue", "netFlow"] as const,
            unitsPerEur,
          );
          if (!source.holdings) return s;
          return {
            ...s,
            holdings: source.holdings.map((h) =>
              scaleMoney(h, ["value", "cost"] as const, unitsPerEur),
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

/**
 * EUR market quotes (chart closes) in the display currency, each at its
 * own day's rate (`unitsPerEurOn`, e.g. useDisplayRateHistory's rateOn).
 * A missing close (null or 0) stays a gap, and an undated one is taken at
 * `latestUnitsPerEur`.
 */
export function quotesInCurrency<
  T extends { date: Date | null; price: number | null },
>(
  points: readonly T[],
  unitsPerEurOn: (timestamp: number) => number,
  latestUnitsPerEur: number,
): T[] {
  return points.map((point) =>
    point.price === null || point.price === 0
      ? point
      : {
          ...point,
          price: fromEur(
            point.price,
            point.date === null
              ? latestUnitsPerEur
              : unitsPerEurOn(point.date.getTime()),
          ),
        },
  );
}

// ═══════════════════════════════════════════════════════════════
// Aggregates (point in time, latest rate)
// ═══════════════════════════════════════════════════════════════

/** Money fields of a holding row (frontend lib/types/investments.ts Holding). */
interface HoldingRowLike {
  value: number;
  costBasis: number | null;
  profitLoss: number | null;
}

/** Money fields of a subcategory card (lib/types/investments.ts SubcategoryData). */
interface SubcategoryCardLike {
  totalValue: number;
  costBasis: number | null;
  profitLoss: number | null;
  topHoldings: HoldingRowLike[];
}

/** Money fields of a category summary (lib/types/investments.ts CategorySummary). */
export interface CategorySummaryLike {
  totalValue: number;
  totalCost: number | null;
  profitLoss: number | null;
  ytdProfitLoss: number | null;
  valueAtYearStart: number | null;
  subcategories: SubcategoryCardLike[];
}

/**
 * A category summary (an EUR aggregate) in the display currency at one
 * rate: the totals, cost, P/L and YTD amounts, each subcategory card and
 * its top holdings. Percentages and coverage are scale-invariant and kept.
 */
export function categorySummaryInCurrency<T extends CategorySummaryLike>(
  summary: T,
  unitsPerEur: number,
): T {
  if (unitsPerEur === 1) return summary;
  return {
    ...scaleMoney(
      summary,
      [
        "totalValue",
        "totalCost",
        "profitLoss",
        "ytdProfitLoss",
        "valueAtYearStart",
      ] as const,
      unitsPerEur,
    ),
    subcategories: summary.subcategories.map((sub) => ({
      ...scaleMoney(
        sub,
        ["totalValue", "costBasis", "profitLoss"] as const,
        unitsPerEur,
      ),
      topHoldings: sub.topHoldings.map((h) =>
        scaleMoney(h, ["value", "costBasis", "profitLoss"] as const, unitsPerEur),
      ),
    })),
  };
}

/** Money fields of a dashboard category card (hooks/convex/portfolio.ts). */
interface AssetCategoryLike {
  totalValue: number;
  costBasis: number | null;
  profitLoss: number | null;
}

/** Money fields of the portfolio overview (hooks/convex/portfolio.ts PortfolioSummary). */
export interface PortfolioSummaryLike {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalCostBasis: number | null;
  costLine: number | null;
  unrealizedProfitLoss: number | null;
  assetCategories: AssetCategoryLike[];
  liabilities: { totalBalance: number; monthlyPayment: number } | null;
}

/**
 * The portfolio overview (EUR) in the display currency at one rate: net
 * worth, totals, cost line and P/L, each category card and the
 * liabilities card's balance and monthly payment. Percentages, coverage,
 * counts and timestamps are kept.
 */
export function portfolioSummaryInCurrency<T extends PortfolioSummaryLike>(
  summary: T,
  unitsPerEur: number,
): T {
  if (unitsPerEur === 1) return summary;
  return {
    ...scaleMoney(
      summary,
      [
        "totalAssets",
        "totalLiabilities",
        "netWorth",
        "totalCostBasis",
        "costLine",
        "unrealizedProfitLoss",
      ] as const,
      unitsPerEur,
    ),
    assetCategories: summary.assetCategories.map((c) =>
      scaleMoney(c, ["totalValue", "costBasis", "profitLoss"] as const, unitsPerEur),
    ),
    liabilities:
      summary.liabilities &&
      scaleMoney(
        summary.liabilities,
        ["totalBalance", "monthlyPayment"] as const,
        unitsPerEur,
      ),
  };
}
