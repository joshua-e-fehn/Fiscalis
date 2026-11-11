/**
 * Portfolio chart data: adapts the performance engine's total-assets series
 * (the chart's Portfolio view) to the chart's point shape. The engine owns
 * the grid, the values, the vault's continuous valuation and the cost line;
 * nothing is drawn before the first known point.
 */

import { useMemo } from "react";

import type { TimeRange } from "@/lib/performance";

import { useCategoryPerformance } from "./useCategoryPerformance";

export interface PortfolioChartPoint {
  date: string;
  timestamp: number;
  value: number;
  /**
   * Cost line; where the engine has none the point's own value, which keeps
   * the axis bounds honest (0 squashed the chart)
   */
  cost: number;
}

export interface UsePortfolioChartDataOptions {
  timeRange: TimeRange;
  enabled?: boolean;
}

export interface UsePortfolioChartDataResult {
  dataPoints: PortfolioChartPoint[];
  /** Total assets at the range end, 0 without data */
  currentValue: number;
  /** Cost line at the range end, null when unknown */
  totalCost: number | null;
  /** First real snapshot, if any */
  trackingSince: number | null;
  isLoading: boolean;
}

const TOTAL_ASSETS = { kind: "totalAssets" } as const;

export function usePortfolioChartData(
  options: UsePortfolioChartDataOptions,
): UsePortfolioChartDataResult {
  const { timeRange, enabled = true } = options;
  const { dataPoints, metrics, actualSnapshotTimestamps, isLoading } =
    useCategoryPerformance(TOTAL_ASSETS, timeRange, {
      includeDataPoints: true,
      enabled,
    });

  return useMemo(() => {
    const last = dataPoints.at(-1);
    return {
      dataPoints: dataPoints.map((p) => ({
        date: new Date(p.timestamp).toISOString().slice(0, 10),
        timestamp: p.timestamp,
        value: p.value,
        cost: p.costBasis ?? p.value,
      })),
      currentValue: metrics?.endValue ?? 0,
      totalCost: last?.costBasis ?? null,
      trackingSince: actualSnapshotTimestamps[0] ?? null,
      isLoading,
    };
  }, [dataPoints, metrics, actualSnapshotTimestamps, isLoading]);
}
