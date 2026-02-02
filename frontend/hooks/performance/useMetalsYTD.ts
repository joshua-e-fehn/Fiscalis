/**
 * Metals/Commodities YTD Performance Hook (Backward Compatible)
 *
 * This hook provides a backward-compatible interface to the new unified
 * performance service for metals and other commodities. It returns YTD
 * metrics in the same format as the old useYTDPortfolioPerformance hook.
 *
 * @deprecated This is a bridge hook for migration. New code should use
 * useContinuousPerformance({ timeRange: "YTD" }) directly.
 */

import { useMemo } from "react";
import { useContinuousPerformance } from "./useContinuousPerformance";
import type { MetalsCurrency } from "@/lib/types/metals-extended";

// ═══════════════════════════════════════════════════════════════
// Types (matching old YTDPerformanceResult interface)
// ═══════════════════════════════════════════════════════════════

export interface MetalsYTDResult {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtStartOfYear: number | null;
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate YTD performance for precious metals portfolio
 *
 * This is a bridge hook that provides the same interface as the old
 * useYTDPortfolioPerformance in metals.ts, but uses the new unified
 * performance service under the hood.
 *
 * @example
 * ```tsx
 * // Old way (deprecated)
 * const ytd = useYTDPortfolioPerformance(items, currentValue, currency);
 *
 * // New way (using this bridge)
 * const ytd = useMetalsYTD(currency);
 *
 * // Best way (using unified service directly)
 * const { metrics } = useContinuousPerformance({
 *   timeRange: "YTD",
 *   currency,
 * });
 * ```
 */
export function useMetalsYTD(
  currency: MetalsCurrency = "eur",
  options?: { enabled?: boolean },
): MetalsYTDResult {
  const { enabled = true } = options ?? {};

  // Use the new continuous performance hook with YTD range
  const { metrics, isLoading } = useContinuousPerformance({
    timeRange: "YTD",
    currency,
    enabled,
  });

  // Transform to old interface format
  const result = useMemo<MetalsYTDResult>(() => {
    if (!metrics) {
      return {
        ytdProfitLoss: null,
        ytdProfitLossPercent: null,
        valueAtStartOfYear: null,
        isLoading,
      };
    }

    return {
      ytdProfitLoss: metrics.absoluteChange,
      ytdProfitLossPercent: metrics.percentChange,
      valueAtStartOfYear: metrics.startValue,
      isLoading,
    };
  }, [metrics, isLoading]);

  return result;
}

/**
 * Calculate performance for precious metals over any time range
 *
 * @example
 * ```tsx
 * const { metrics } = useMetalsPerformance("3Month", "eur");
 * ```
 */
export function useMetalsPerformance(
  timeRange: import("@/lib/performance").TimeRange,
  currency: MetalsCurrency = "eur",
  options?: { enabled?: boolean; includeDataPoints?: boolean },
): {
  metrics: import("@/lib/performance").PerformanceMetrics | null;
  dataPoints: import("@/lib/performance").PerformanceDataPoint[];
  isLoading: boolean;
} {
  const { enabled = true, includeDataPoints = false } = options ?? {};

  const { metrics, dataPoints, isLoading } = useContinuousPerformance({
    timeRange,
    currency,
    includeDataPoints,
    enabled,
  });

  return { metrics, dataPoints, isLoading };
}
