/**
 * Portfolio YTD Performance Hook (Backward Compatible)
 *
 * This hook provides a backward-compatible interface to the new unified
 * performance service. It returns YTD metrics in the same format as the
 * old portfolio.ts hook, making migration straightforward.
 *
 * @deprecated This is a bridge hook for migration. New code should use
 * usePerformance({ timeRange: "YTD" }) directly.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { useDiscretePerformance } from "./useDiscretePerformance";
import { useContinuousPerformance } from "./useContinuousPerformance";
import { getTimeRangeStartTimestamp } from "@/../services/finance/financeService";
import type { MetalsCurrency } from "@/lib/types/metals-extended";

// ═══════════════════════════════════════════════════════════════
// Types (matching old PortfolioSummary interface)
// ═══════════════════════════════════════════════════════════════

export interface PortfolioYTDResult {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtYearStart: number | null;
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate YTD performance from portfolio snapshots
 *
 * This is a bridge hook that provides the same interface as the old
 * YTD calculation in portfolio.ts, but uses the new unified performance
 * service under the hood.
 *
 * @example
 * ```tsx
 * // Old way (deprecated)
 * const { summary } = usePortfolioOverview();
 * const { ytdProfitLoss, ytdProfitLossPercent } = summary;
 *
 * // New way (using this bridge)
 * const ytd = usePortfolioYTD();
 * const { ytdProfitLoss, ytdProfitLossPercent } = ytd;
 *
 * // Best way (using unified service directly)
 * const { metrics } = usePerformance({ timeRange: "YTD" });
 * const ytdProfitLossPercent = metrics?.percentChange;
 * ```
 */
export function usePortfolioYTD(options?: {
  enabled?: boolean;
}): PortfolioYTDResult {
  const { enabled = true } = options ?? {};

  // Use the new discrete performance hook with YTD range
  const { metrics, isLoading, snapshots } = useDiscretePerformance({
    timeRange: "YTD",
    enabled,
  });

  // Transform to old interface format
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

// ═══════════════════════════════════════════════════════════════
// Net Worth YTD Hook
// ═══════════════════════════════════════════════════════════════

export interface NetWorthYTDResult {
  ytdChange: number | null;
  ytdChangePercent: number | null;
  valueAtYearStart: number | null;
  currentValue: number | null;
  isLoading: boolean;
}

/**
 * Calculate YTD change in net worth (assets - liabilities)
 *
 * Unlike usePortfolioYTD which tracks total assets performance,
 * this hook tracks the change in net worth including liabilities.
 *
 * For continuous data assets (like precious metals), if no snapshot exists
 * from before the year start, the hook calculates the value using historical
 * prices and the holdings that existed at that time.
 *
 * @example
 * ```tsx
 * const { ytdChange, ytdChangePercent, isLoading } = useNetWorthYTD();
 *
 * // Display: "Net worth increased by €5,000 (+8.5%) this year"
 * ```
 */
export function useNetWorthYTD(options?: {
  enabled?: boolean;
  currency?: MetalsCurrency;
}): NetWorthYTDResult {
  const { enabled = true, currency = "eur" } = options ?? {};

  // Fetch portfolio snapshots from Convex
  const rawSnapshots = useQuery(
    api.portfolioSnapshots.getSnapshots,
    enabled ? { limit: 400 } : "skip", // ~1+ year of daily snapshots
  );

  // Fetch continuous performance data for metals (YTD)
  // This gives us the value at year start for continuous assets
  const continuousYTD = useContinuousPerformance({
    timeRange: "YTD",
    currency,
    enabled,
  });

  const snapshotsLoading = rawSnapshots === undefined;
  const isLoading = snapshotsLoading || continuousYTD.isLoading;

  const result = useMemo<NetWorthYTDResult>(() => {
    // Get YTD start timestamp
    const ytdStart = getTimeRangeStartTimestamp("YTD");

    // Sort snapshots by timestamp
    const sorted = rawSnapshots
      ? [...rawSnapshots].sort((a, b) => a.timestamp - b.timestamp)
      : [];

    // Find the snapshot closest to (but not after) the start of year
    let snapshotValueAtYearStart: number | null = null;
    for (const snap of sorted) {
      if (snap.timestamp <= ytdStart) {
        snapshotValueAtYearStart = snap.netWorth;
      } else {
        break;
      }
    }

    // Get the most recent snapshot for current value (for discrete assets)
    const latestSnapshot = sorted.length > 0 ? sorted[sorted.length - 1] : null;

    // CASE 1: We have a snapshot from before year start
    // This is the ideal case - use snapshot data which includes everything
    if (snapshotValueAtYearStart !== null) {
      const currentValue = latestSnapshot?.netWorth ?? null;

      if (currentValue !== null) {
        const ytdChange = currentValue - snapshotValueAtYearStart;
        const ytdChangePercent =
          snapshotValueAtYearStart !== 0
            ? (ytdChange / Math.abs(snapshotValueAtYearStart)) * 100
            : null;

        return {
          ytdChange,
          ytdChangePercent,
          valueAtYearStart: snapshotValueAtYearStart,
          currentValue,
          isLoading,
        };
      }
    }

    // CASE 2: No snapshot from before year start, but we have continuous data (metals)
    // Calculate YTD for metals only - comparing start and end values from continuous data
    // This ensures we're comparing apples to apples (metals to metals)
    if (continuousYTD.metrics && continuousYTD.metrics.startValue !== null) {
      const valueAtYearStart = continuousYTD.metrics.startValue;
      const currentValue = continuousYTD.metrics.endValue;

      if (currentValue !== null && currentValue > 0) {
        const ytdChange = currentValue - valueAtYearStart;
        const ytdChangePercent =
          valueAtYearStart !== 0
            ? (ytdChange / Math.abs(valueAtYearStart)) * 100
            : null;

        return {
          ytdChange,
          ytdChangePercent,
          valueAtYearStart,
          currentValue,
          isLoading,
        };
      }
    }

    // CASE 3: No data available for YTD calculation
    return {
      ytdChange: null,
      ytdChangePercent: null,
      valueAtYearStart: null,
      currentValue: latestSnapshot?.netWorth ?? null,
      isLoading,
    };
  }, [rawSnapshots, continuousYTD.metrics, isLoading]);

  return result;
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
