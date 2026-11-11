/**
 * Portfolio Chart Data Hook
 *
 * Provides data points for the portfolio performance chart on the dashboard.
 *
 * The line plots one measure only: portfolio snapshot totals (total assets,
 * which already include vault metals at spot). Before the first real
 * snapshot there is no data, so nothing is drawn. A metals-only series is
 * never spliced in, because joining two series of different scope into one
 * line shows a fake jump on the day tracking started.
 */

import { useMemo } from "react";

import type { TimeRange } from "@/lib/performance";
import {
  getDefaultIntervalForRange,
  getTimeIntervalInMilliseconds,
} from "@/../services/finance/financeService";

import { useDiscretePerformance } from "./useDiscretePerformance";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PortfolioDataPoint {
  date: string;
  timestamp: number;
  value: number;
  cost: number;
  /** "snapshot": a real snapshot lies within half an interval; otherwise interpolated */
  source: "snapshot" | "interpolated";
}

export interface UsePortfolioChartDataOptions {
  /** Time range for the chart */
  timeRange: TimeRange;
  /** Whether to enable the queries (default: true) */
  enabled?: boolean;
}

export interface UsePortfolioChartDataResult {
  /** Data points for the chart (empty before the first snapshot) */
  dataPoints: PortfolioDataPoint[];
  /** Current portfolio value (latest snapshot total), 0 without snapshots */
  currentValue: number;
  /** Cost basis from the latest snapshot, null when unknown */
  totalCost: number | null;
  /** When snapshot tracking started (first real snapshot), if any */
  trackingSince: number | null;
  /** Loading state */
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

export function usePortfolioChartData(
  options: UsePortfolioChartDataOptions,
): UsePortfolioChartDataResult {
  const { timeRange, enabled = true } = options;

  const discreteResult = useDiscretePerformance({
    timeRange,
    includeDataPoints: true,
    enabled,
  });

  const { isLoading, dataPoints, actualSnapshotTimestamps, metrics } =
    discreteResult;

  return useMemo<UsePortfolioChartDataResult>(() => {
    const trackingSince =
      actualSnapshotTimestamps.length > 0 ? actualSnapshotTimestamps[0] : null;

    if (isLoading || trackingSince === null) {
      return {
        dataPoints: [],
        currentValue: 0,
        totalCost: null,
        trackingSince,
        isLoading,
      };
    }

    // Grid points before tracking started carry the first snapshot backward;
    // that is not a value the user held, so drop them. A grid point within
    // half an interval of the first snapshot is backed by it and stays.
    const halfInterval =
      getTimeIntervalInMilliseconds(getDefaultIntervalForRange(timeRange)) / 2;
    const visible = dataPoints.filter(
      (p) => p.timestamp >= trackingSince - halfInterval,
    );

    const chartPoints: PortfolioDataPoint[] = visible.map((p) => ({
      date: new Date(p.timestamp).toISOString().split("T")[0],
      timestamp: p.timestamp,
      value: p.value,
      cost: p.costBasis ?? 0,
      source: p.source === "snapshot" ? "snapshot" : "interpolated",
    }));

    const last = visible.length > 0 ? visible[visible.length - 1] : null;

    return {
      dataPoints: chartPoints,
      currentValue: metrics?.endValue ?? 0,
      totalCost: last?.costBasis ?? null,
      trackingSince,
      isLoading: false,
    };
  }, [isLoading, dataPoints, actualSnapshotTimestamps, metrics, timeRange]);
}
