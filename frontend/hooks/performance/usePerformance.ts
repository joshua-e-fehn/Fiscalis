/**
 * Unified Performance Hook
 *
 * Combines discrete and continuous performance for a complete portfolio view.
 * This is the main hook for calculating total portfolio performance.
 */

import { useMemo } from "react";

import type {
  TimeRange,
  PerformanceMetrics,
  PerformanceDataPoint,
} from "@/lib/performance";
import {
  getHybridStrategy,
  type HybridPerformanceInput,
  type PerformanceCalculationOptions,
  type HybridPerformanceResult,
  type PerformanceBreakdown,
} from "@/lib/performance";

import {
  useDiscretePerformance,
  type UseDiscretePerformanceResult,
} from "./useDiscretePerformance";
import {
  useContinuousPerformance,
  type UseContinuousPerformanceResult,
} from "./useContinuousPerformance";
import type { MetalsCurrency } from "@/lib/types/metals-extended";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface UsePerformanceOptions {
  /** Time range for performance calculation */
  timeRange: TimeRange;
  /** Currency for price data (default: "eur") */
  currency?: MetalsCurrency;
  /** Whether to include data points in result (default: false) */
  includeDataPoints?: boolean;
  /** Whether to include discrete assets (default: true) */
  includeDiscrete?: boolean;
  /** Whether to include continuous assets (default: true) */
  includeContinuous?: boolean;
  /** Category filter for discrete assets */
  discreteCategoryFilter?: string;
  /** Whether to enable the queries (default: true) */
  enabled?: boolean;
}

export interface UsePerformanceResult {
  /** Combined performance metrics */
  metrics: PerformanceMetrics | null;
  /** Combined data points for charting */
  dataPoints: PerformanceDataPoint[];
  /** Breakdown by value type */
  breakdown: PerformanceBreakdown;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Individual results for advanced usage */
  discrete: UseDiscretePerformanceResult | null;
  continuous: UseContinuousPerformanceResult | null;
}

// ═══════════════════════════════════════════════════════════════
// Main Performance Hook
// ═══════════════════════════════════════════════════════════════

/**
 * Unified performance hook combining discrete and continuous assets
 *
 * @example
 * ```tsx
 * const { metrics, breakdown, isLoading } = usePerformance({
 *   timeRange: "YTD",
 * });
 *
 * if (isLoading) return <Spinner />;
 *
 * return (
 *   <div>
 *     <p>Total YTD: {metrics?.percentChange.toFixed(2)}%</p>
 *     <p>Discrete: {breakdown.discrete?.metrics.percentChange.toFixed(2)}%</p>
 *     <p>Continuous: {breakdown.continuous?.metrics.percentChange.toFixed(2)}%</p>
 *   </div>
 * );
 * ```
 */
export function usePerformance(
  options: UsePerformanceOptions,
): UsePerformanceResult {
  const {
    timeRange,
    currency = "eur",
    includeDataPoints = false,
    includeDiscrete = true,
    includeContinuous = true,
    discreteCategoryFilter,
    enabled = true,
  } = options;

  // Fetch discrete performance (snapshots)
  const discreteResult = useDiscretePerformance({
    timeRange,
    categoryFilter: discreteCategoryFilter,
    includeDataPoints: true, // Always get data points for merging
    enabled: enabled && includeDiscrete,
  });

  // Fetch continuous performance (metals)
  const continuousResult = useContinuousPerformance({
    timeRange,
    currency,
    includeDataPoints: true, // Always get data points for merging
    enabled: enabled && includeContinuous,
  });

  const isLoading =
    (includeDiscrete && discreteResult.isLoading) ||
    (includeContinuous && continuousResult.isLoading);

  // Combine results using hybrid strategy
  const result = useMemo(() => {
    // If both are loading or have no data, return empty
    const hasDiscrete =
      includeDiscrete &&
      !discreteResult.isLoading &&
      discreteResult.snapshots.length > 0;
    const hasContinuous =
      includeContinuous &&
      !continuousResult.isLoading &&
      continuousResult.metrics !== null;

    if (!hasDiscrete && !hasContinuous) {
      return {
        metrics: null,
        dataPoints: [],
        breakdown: {},
      };
    }

    // If only one type has data, return that
    if (hasDiscrete && !hasContinuous) {
      return {
        metrics: discreteResult.metrics,
        dataPoints: includeDataPoints ? discreteResult.dataPoints : [],
        breakdown: {
          discrete: discreteResult.metrics
            ? {
                metrics: discreteResult.metrics,
                dataPoints: discreteResult.dataPoints,
                valueType: "discrete" as const,
              }
            : undefined,
        },
      };
    }

    if (!hasDiscrete && hasContinuous) {
      return {
        metrics: continuousResult.metrics,
        dataPoints: includeDataPoints ? continuousResult.dataPoints : [],
        breakdown: {
          continuous: continuousResult.metrics
            ? {
                metrics: continuousResult.metrics,
                dataPoints: continuousResult.dataPoints,
                valueType: "continuous" as const,
              }
            : undefined,
        },
      };
    }

    // Both have data - use hybrid strategy to merge
    const strategy = getHybridStrategy();
    const input: HybridPerformanceInput = {
      discrete: {
        snapshots: discreteResult.snapshots,
        categoryFilter: discreteCategoryFilter,
      },
      continuous: {
        holdings: [], // Not available directly, but metrics are calculated
        prices: {},
      },
    };
    const calcOptions: PerformanceCalculationOptions = {
      timeRange,
      includeDataPoints,
    };

    // Since we already have individual metrics, combine them manually
    // (The hybrid strategy would recalculate, which is redundant)
    const discreteMetrics = discreteResult.metrics;
    const continuousMetrics = continuousResult.metrics;

    if (!discreteMetrics || !continuousMetrics) {
      return {
        metrics: discreteMetrics || continuousMetrics,
        dataPoints: [],
        breakdown: {
          discrete: discreteMetrics
            ? {
                metrics: discreteMetrics,
                dataPoints: discreteResult.dataPoints,
                valueType: "discrete" as const,
              }
            : undefined,
          continuous: continuousMetrics
            ? {
                metrics: continuousMetrics,
                dataPoints: continuousResult.dataPoints,
                valueType: "continuous" as const,
              }
            : undefined,
        },
      };
    }

    // Merge metrics
    const startValue =
      discreteMetrics.startValue + continuousMetrics.startValue;
    const endValue = discreteMetrics.endValue + continuousMetrics.endValue;
    const absoluteChange = endValue - startValue;
    const percentChange =
      startValue !== 0 ? (absoluteChange / startValue) * 100 : 0;

    const combinedMetrics: PerformanceMetrics = {
      startValue,
      endValue,
      absoluteChange,
      percentChange,
      highValue: discreteMetrics.highValue + continuousMetrics.highValue,
      lowValue: discreteMetrics.lowValue + continuousMetrics.lowValue,
      dataQuality:
        discreteMetrics.dataQuality === "low" ||
        continuousMetrics.dataQuality === "low"
          ? "low"
          : discreteMetrics.dataQuality === "medium" ||
              continuousMetrics.dataQuality === "medium"
            ? "medium"
            : "high",
      dataPointCount: Math.max(
        discreteMetrics.dataPointCount,
        continuousMetrics.dataPointCount,
      ),
      interpolatedPointCount:
        discreteMetrics.interpolatedPointCount +
        continuousMetrics.interpolatedPointCount,
      timeRange,
      startTimestamp: Math.min(
        discreteMetrics.startTimestamp,
        continuousMetrics.startTimestamp,
      ),
      endTimestamp: Math.max(
        discreteMetrics.endTimestamp,
        continuousMetrics.endTimestamp,
      ),
      calculatedAt: Date.now(),
    };

    // Merge data points by timestamp
    const mergedDataPoints: PerformanceDataPoint[] = [];
    if (includeDataPoints) {
      const pointMap = new Map<number, PerformanceDataPoint>();

      // Add discrete points
      for (const point of discreteResult.dataPoints) {
        pointMap.set(point.timestamp, { ...point });
      }

      // Merge continuous points
      for (const point of continuousResult.dataPoints) {
        const existing = pointMap.get(point.timestamp);
        if (existing) {
          existing.value += point.value;
          if (point.costBasis !== null) {
            existing.costBasis = (existing.costBasis ?? 0) + point.costBasis;
          }
          existing.confidence = Math.min(existing.confidence, point.confidence);
          if (point.source === "interpolated") {
            existing.source = "interpolated";
          }
        } else {
          pointMap.set(point.timestamp, { ...point });
        }
      }

      mergedDataPoints.push(...pointMap.values());
      mergedDataPoints.sort((a, b) => a.timestamp - b.timestamp);
    }

    return {
      metrics: combinedMetrics,
      dataPoints: mergedDataPoints,
      breakdown: {
        discrete: {
          metrics: discreteMetrics,
          dataPoints: discreteResult.dataPoints,
          valueType: "discrete" as const,
        },
        continuous: {
          metrics: continuousMetrics,
          dataPoints: continuousResult.dataPoints,
          valueType: "continuous" as const,
        },
      },
    };
  }, [
    includeDiscrete,
    includeContinuous,
    includeDataPoints,
    discreteResult,
    continuousResult,
    discreteCategoryFilter,
    timeRange,
  ]);

  return {
    metrics: result.metrics,
    dataPoints: result.dataPoints,
    breakdown: result.breakdown,
    isLoading,
    error: null,
    discrete: includeDiscrete ? discreteResult : null,
    continuous: includeContinuous ? continuousResult : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Convenience Hook for Just Metrics
// ═══════════════════════════════════════════════════════════════

/**
 * Simplified hook that returns just the metrics
 *
 * @example
 * ```tsx
 * const { ytdChange, isLoading } = usePerformanceMetrics("YTD");
 * ```
 */
export function usePerformanceMetrics(
  timeRange: TimeRange,
  options: Omit<UsePerformanceOptions, "timeRange" | "includeDataPoints"> = {},
): {
  percentChange: number | null;
  absoluteChange: number | null;
  startValue: number | null;
  endValue: number | null;
  isLoading: boolean;
} {
  const { metrics, isLoading } = usePerformance({
    ...options,
    timeRange,
    includeDataPoints: false,
  });

  return {
    percentChange: metrics?.percentChange ?? null,
    absoluteChange: metrics?.absoluteChange ?? null,
    startValue: metrics?.startValue ?? null,
    endValue: metrics?.endValue ?? null,
    isLoading,
  };
}
