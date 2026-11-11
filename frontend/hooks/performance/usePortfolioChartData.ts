/**
 * Portfolio chart data: adapts the performance engine's total-assets series
 * (the chart's Portfolio view) to the chart's point shape. The engine owns
 * the grid, the values, the vault's continuous valuation and the cost line;
 * nothing is drawn before the first known point.
 */

import { useMemo } from "react";

import type { TimeRange } from "@/lib/performance";

import { toPeriodChange, useCategoryPerformance } from "./useCategoryPerformance";

export interface PortfolioChartPoint {
  date: string;
  timestamp: number;
  value: number;
  /**
   * Axis-bounds helper only: the engine's cost line, or the point's own value
   * where it has none. CategoryPerformanceChart draws no per-point cost line
   * (its dashed line is `totalCost`, null when unknown), so this fallback is
   * never shown as a P/L. Making it null needs PortfolioDataPoint.cost to be
   * nullable, which is deferred to the chart follow-up.
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
  /** First known point when there is no value at the range start; null otherwise */
  trackingSince: number | null;
  /** Some held assets had no price series and are missing from the values */
  partial: boolean;
  isLoading: boolean;
}

const TOTAL_ASSETS = { kind: "totalAssets" } as const;

export function usePortfolioChartData(
  options: UsePortfolioChartDataOptions,
): UsePortfolioChartDataResult {
  const { timeRange, enabled = true } = options;
  const { dataPoints, metrics, isLoading } =
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
      trackingSince: toPeriodChange(metrics).trackingSince,
      partial: metrics?.partial ?? false,
      isLoading,
    };
  }, [dataPoints, metrics, isLoading]);
}
