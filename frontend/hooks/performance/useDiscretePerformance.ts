/**
 * Discrete Performance Hook
 *
 * Calculates performance from portfolio snapshots for discrete value assets
 * (bank accounts, broker positions, etc.)
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import type {
  TimeRange,
  PerformanceMetrics,
  PerformanceDataPoint,
  SnapshotData,
} from "@/lib/performance";
import {
  getDiscreteStrategy,
  type DiscretePerformanceInput,
  type PerformanceCalculationOptions,
} from "@/lib/performance";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface UseDiscretePerformanceOptions {
  /** Time range for performance calculation */
  timeRange: TimeRange;
  /** Optional category to filter by (e.g., "equities", "cash") */
  categoryFilter?: string;
  /** Whether to include data points in result (default: false for performance) */
  includeDataPoints?: boolean;
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
}

export interface UseDiscretePerformanceResult {
  /** Performance metrics */
  metrics: PerformanceMetrics | null;
  /** Data points for charting (if includeDataPoints=true) */
  dataPoints: PerformanceDataPoint[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Raw snapshots from Convex */
  snapshots: SnapshotData[];
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for discrete (snapshot-based) performance calculation
 *
 * Uses portfolio snapshots from Convex to calculate performance.
 * Best for: bank accounts, broker positions, real estate, etc.
 *
 * @example
 * ```tsx
 * const { metrics, isLoading } = useDiscretePerformance({
 *   timeRange: "YTD",
 *   categoryFilter: "equities",
 * });
 *
 * if (isLoading) return <Spinner />;
 *
 * return (
 *   <div>
 *     <p>Change: {metrics?.percentChange.toFixed(2)}%</p>
 *   </div>
 * );
 * ```
 */
export function useDiscretePerformance(
  options: UseDiscretePerformanceOptions,
): UseDiscretePerformanceResult {
  const {
    timeRange,
    categoryFilter,
    includeDataPoints = false,
    enabled = true,
  } = options;

  // Fetch portfolio snapshots from Convex
  const rawSnapshots = useQuery(
    api.portfolioSnapshots.getSnapshots,
    enabled ? { limit: 730 } : "skip", // ~2 years of daily snapshots
  );

  const isLoading = rawSnapshots === undefined;

  // Transform Convex snapshots to our SnapshotData format
  const snapshots = useMemo<SnapshotData[]>(() => {
    if (!rawSnapshots) return [];

    return rawSnapshots.map((s) => ({
      timestamp: s.timestamp,
      date: s.date,
      totalAssets: s.totalAssets,
      totalLiabilities: s.totalLiabilities,
      netWorth: s.netWorth,
      totalCostBasis: s.totalCostBasis,
      categoryBreakdown: s.categoryBreakdown?.map((c) => ({
        category: c.category,
        value: c.value,
        costBasis: c.costBasis,
      })),
    }));
  }, [rawSnapshots]);

  // Calculate performance
  const result = useMemo(() => {
    if (snapshots.length === 0) {
      return {
        metrics: null,
        dataPoints: [],
      };
    }

    const strategy = getDiscreteStrategy();
    const input: DiscretePerformanceInput = {
      snapshots,
      categoryFilter,
    };
    const calcOptions: PerformanceCalculationOptions = {
      timeRange,
      includeDataPoints,
    };

    try {
      const performanceResult = strategy.calculate(input, calcOptions);
      return {
        metrics: performanceResult.metrics,
        dataPoints: performanceResult.dataPoints,
      };
    } catch (err) {
      console.error("Discrete performance calculation error:", err);
      return {
        metrics: null,
        dataPoints: [],
      };
    }
  }, [snapshots, timeRange, categoryFilter, includeDataPoints]);

  return {
    metrics: result.metrics,
    dataPoints: result.dataPoints,
    isLoading,
    error: null,
    snapshots,
  };
}
