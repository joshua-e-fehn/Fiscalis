/**
 * Chart data: adapts the performance engine's total-assets, net-worth or
 * category series to the chart's point shape. The engine owns the grid,
 * the values, the vault's continuous valuation and the cost line, and ends
 * the series at the overview's live figure when given one; nothing is
 * drawn before the first known point.
 */

import { useMemo } from "react";

import { toChartPoints, type TimeRange } from "@/lib/performance";
import type { PortfolioDataPoint } from "@/lib/types/investments";

import {
  portfolioLiveEnd,
  useCategoryPerformance,
  type LivePortfolioTotals,
} from "./useCategoryPerformance";

/** One chart point; `cost` is the engine's cost line, null (a gap) where unknown */
export type PortfolioChartPoint = PortfolioDataPoint;

/** What the chart plots: gross assets, or assets less debt */
export type PortfolioChartMetric = "totalAssets" | "netWorth";

export interface UsePortfolioChartDataOptions {
  timeRange: TimeRange;
  /** Default "totalAssets" */
  metric?: PortfolioChartMetric;
  /** The overview's live totals: the series ends at them (PF-05) */
  live?: LivePortfolioTotals;
  enabled?: boolean;
}

export interface UsePortfolioChartDataResult {
  dataPoints: PortfolioChartPoint[];
  /** Some values are incomplete (a missing price, a partly failed sync) */
  partial: boolean;
  isLoading: boolean;
}

const MEASURES = {
  totalAssets: { kind: "totalAssets" },
  netWorth: { kind: "netWorth" },
} as const;

export function usePortfolioChartData(
  options: UsePortfolioChartDataOptions,
): UsePortfolioChartDataResult {
  const { timeRange, metric = "totalAssets", live, enabled = true } = options;
  const liveEnd = live && portfolioLiveEnd(metric, live);
  const { dataPoints, metrics, isLoading } = useCategoryPerformance(
    MEASURES[metric],
    timeRange,
    { includeDataPoints: true, enabled, liveEnd },
  );

  return useMemo(
    () => ({
      dataPoints: toChartPoints(dataPoints),
      partial: metrics?.partial ?? false,
      isLoading,
    }),
    [dataPoints, metrics, isLoading],
  );
}

export interface CategoryChartDataResult {
  dataPoints: PortfolioChartPoint[];
  /** Some values are incomplete (a missing price, a partly failed sync) */
  partial: boolean;
  isLoading: boolean;
}

/**
 * A category page's chart: the engine's series for the category over the
 * range, from the snapshots' categoryBreakdown (and the vault at spot for
 * commodities), with its per-point cost line.
 */
export function useCategoryChartData(
  category: string,
  timeRange: TimeRange,
  options?: { enabled?: boolean },
): CategoryChartDataResult {
  const measure = useMemo(
    () => ({ kind: "category" as const, category }),
    [category],
  );
  const { dataPoints, metrics, isLoading } = useCategoryPerformance(
    measure,
    timeRange,
    { includeDataPoints: true, enabled: options?.enabled ?? true },
  );
  return useMemo(
    () => ({
      dataPoints: toChartPoints(dataPoints),
      partial: metrics?.partial ?? false,
      isLoading,
    }),
    [dataPoints, metrics, isLoading],
  );
}
