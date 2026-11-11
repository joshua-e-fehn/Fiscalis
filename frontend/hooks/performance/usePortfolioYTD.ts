/**
 * YTD hooks for net worth (snapshot totals) and single categories
 * (snapshot category breakdowns).
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useDiscretePerformance } from "./useDiscretePerformance";
import { getTimeRangeStartTimestamp } from "@/../services/finance/financeService";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PortfolioYTDResult {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtYearStart: number | null;
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Net Worth YTD Hook
// ═══════════════════════════════════════════════════════════════

export interface NetWorthYTDResult {
  ytdChange: number | null;
  ytdChangePercent: number | null;
  valueAtYearStart: number | null;
  currentValue: number | null;
  /**
   * First snapshot timestamp when there is no snapshot at or before Jan 1
   * (YTD cannot be computed yet); null otherwise.
   */
  trackingSince: number | null;
  isLoading: boolean;
}

/**
 * Calculate YTD change in net worth (assets - liabilities) from snapshots.
 *
 * This is a plain change in value, not a return: savings and newly connected
 * accounts raise it. It needs a snapshot at or before Jan 1 (UTC). Without
 * one it returns null figures and `trackingSince` (the first snapshot), so
 * the UI can say "not enough history" instead of showing a substitute such
 * as a metals-only change under a net-worth label.
 *
 * @example
 * ```tsx
 * const { ytdChange, ytdChangePercent, isLoading } = useNetWorthYTD();
 * ```
 */
export function useNetWorthYTD(options?: {
  enabled?: boolean;
}): NetWorthYTDResult {
  const { enabled = true } = options ?? {};

  // Jan 1 UTC of the current year: stable across renders, so the query
  // subscription does not churn. The query adds the baseline snapshot at or
  // before it, then every snapshot after it.
  const ytdStart = getTimeRangeStartTimestamp("YTD");
  const rawSnapshots = useQuery(
    api.portfolioSnapshots.getSnapshots,
    enabled ? { since: ytdStart, limit: 400 } : "skip",
  );

  const isLoading = rawSnapshots === undefined;

  return useMemo<NetWorthYTDResult>(() => {
    const sorted = rawSnapshots
      ? [...rawSnapshots].sort((a, b) => a.timestamp - b.timestamp)
      : [];

    // Last snapshot at or before the start of the year
    let valueAtYearStart: number | null = null;
    for (const snap of sorted) {
      if (snap.timestamp > ytdStart) break;
      valueAtYearStart = snap.netWorth;
    }

    const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    const currentValue = latest?.netWorth ?? null;

    // Only the baseline exists (no snapshot yet this year): nothing to
    // compare, so say "No data for this year" rather than a 0.00% change.
    if (latest !== null && latest.timestamp <= ytdStart) {
      return {
        ytdChange: null,
        ytdChangePercent: null,
        valueAtYearStart: null,
        currentValue,
        trackingSince: null,
        isLoading,
      };
    }

    if (valueAtYearStart === null || currentValue === null) {
      return {
        ytdChange: null,
        ytdChangePercent: null,
        valueAtYearStart: null,
        currentValue,
        trackingSince: sorted.length > 0 ? sorted[0].timestamp : null,
        isLoading,
      };
    }

    const ytdChange = currentValue - valueAtYearStart;
    return {
      ytdChange,
      ytdChangePercent:
        valueAtYearStart !== 0
          ? (ytdChange / Math.abs(valueAtYearStart)) * 100
          : null,
      valueAtYearStart,
      currentValue,
      trackingSince: null,
      isLoading,
    };
  }, [rawSnapshots, ytdStart, isLoading]);
}

/**
 * Calculate YTD performance for a specific category
 *
 * @example
 * ```tsx
 * const equitiesYTD = useCategoryYTD("equities");
 * ```
 */
export function useCategoryYTD(
  category: string,
  options?: { enabled?: boolean },
): PortfolioYTDResult {
  const { enabled = true } = options ?? {};

  const { metrics, isLoading } = useDiscretePerformance({
    timeRange: "YTD",
    categoryFilter: category,
    enabled,
  });

  const result = useMemo<PortfolioYTDResult>(() => {
    if (!metrics) {
      return {
        ytdProfitLoss: null,
        ytdProfitLossPercent: null,
        valueAtYearStart: null,
        isLoading,
      };
    }

    return {
      ytdProfitLoss: metrics.absoluteChange,
      ytdProfitLossPercent: metrics.percentChange,
      valueAtYearStart: metrics.startValue,
      isLoading,
    };
  }, [metrics, isLoading]);

  return result;
}
