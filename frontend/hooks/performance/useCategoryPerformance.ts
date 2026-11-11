/**
 * The one performance entry point for the app.
 *
 * Every widget names what it measures (net worth, total assets or one
 * category) and a time range. Which strategy values which holdings comes
 * from the valuation resolver (services/performance/config.ts): sources
 * with a price feed (vault metals) are valued continuously, everything else
 * from the shared snapshot series, combined by the hybrid strategy on one
 * grid. KPI presets only choose how the result is shown.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import {
  continuousSourcesFor,
  getHybridStrategy,
  type PerformanceDataPoint,
  type PerformanceMetrics,
  type SnapshotData,
  type SnapshotMetric,
  type TimeRange,
} from "@/lib/performance";
import { MS, getTimeRangeStartTimestamp } from "@/../services/finance/financeService";
import type { HoldingCategory } from "@/../services/portfolio/aggregate";
import type { MetalsCurrency } from "@/lib/types/metals-extended";

import { useVaultPerformanceInput } from "./useContinuousPerformance";

// ═══════════════════════════════════════════════════════════════
// The one snapshot reader
// ═══════════════════════════════════════════════════════════════
// Every performance consumer derives from it, so widgets on a page see the
// same history. One range query returns the baseline snapshot at or before
// the range start plus every snapshot after it (newest-inclusive). The start
// is floored to the UTC day, so widgets asking for the same range share one
// subscription, and the baseline still lies at or before the exact start.

/** Guard only: about five years of daily rows plus intraday ones */
const SNAPSHOT_LIMIT = 2000;

export interface UseSnapshotsResult {
  /** Ascending, base-currency snapshots */
  snapshots: SnapshotData[];
  isLoading: boolean;
}

export function useSnapshots(
  timeRange: TimeRange,
  options?: { enabled?: boolean },
): UseSnapshotsResult {
  const enabled = options?.enabled ?? true;

  const since = useMemo(() => {
    if (timeRange === "ALL") return undefined;
    const start = getTimeRangeStartTimestamp(timeRange, Date.now());
    return Math.floor(start / MS.DAY) * MS.DAY;
  }, [timeRange]);

  const raw = useQuery(
    api.portfolioSnapshots.getSnapshots,
    enabled
      ? since === undefined
        ? { limit: SNAPSHOT_LIMIT }
        : { since, limit: SNAPSHOT_LIMIT }
      : "skip",
  );

  const snapshots = useMemo<SnapshotData[]>(
    () =>
      (raw ?? []).map((s) => ({
        timestamp: s.timestamp,
        date: s.date,
        totalAssets: s.totalAssets,
        totalLiabilities: s.totalLiabilities,
        netWorth: s.netWorth,
        totalCostBasis: s.totalCostBasis,
        totalCoveredValue: s.totalCoveredValue,
        categoryBreakdown: s.categoryBreakdown?.map((c) => ({
          category: c.category,
          value: c.value,
          costBasis: c.costBasis,
          coveredValue: c.coveredValue,
          sources: c.sources,
        })),
        source: s.source,
      })),
    [raw],
  );

  return { snapshots, isLoading: enabled && raw === undefined };
}

// ═══════════════════════════════════════════════════════════════
// The one performance entry point
// ═══════════════════════════════════════════════════════════════

export interface UseCategoryPerformanceOptions {
  includeDataPoints?: boolean;
  currency?: MetalsCurrency;
  enabled?: boolean;
}

export interface CategoryPerformanceResult {
  metrics: PerformanceMetrics | null;
  dataPoints: PerformanceDataPoint[];
  /** Timestamps of the real snapshots behind the series, ascending */
  actualSnapshotTimestamps: number[];
  isLoading: boolean;
}

export function useCategoryPerformance(
  measure: SnapshotMetric,
  timeRange: TimeRange,
  options: UseCategoryPerformanceOptions = {},
): CategoryPerformanceResult {
  const { includeDataPoints = false, currency = "eur", enabled = true } = options;

  const scope =
    measure.kind === "category" ? (measure.category as HoldingCategory) : "all";
  const continuousSources = useMemo(() => continuousSourcesFor(scope), [scope]);
  const needsVault = continuousSources.some((s) => s.source === "vault");

  const { snapshots, isLoading: snapshotsLoading } = useSnapshots(timeRange, {
    enabled,
  });
  const vault = useVaultPerformanceInput({
    timeRange,
    currency,
    enabled: enabled && needsVault,
  });
  const isLoading = snapshotsLoading || (needsVault && vault.isLoading);

  const measureKey = JSON.stringify(measure);
  const result = useMemo(() => {
    if (!enabled || isLoading) return null;
    const metric = JSON.parse(measureKey) as SnapshotMetric;
    return getHybridStrategy().calculate(
      {
        discrete: snapshots.length > 0 ? { snapshots, metric } : undefined,
        continuous: needsVault ? vault.input : undefined,
        continuousSources,
      },
      { timeRange, includeDataPoints },
    );
  }, [
    enabled,
    isLoading,
    measureKey,
    snapshots,
    needsVault,
    vault.input,
    continuousSources,
    timeRange,
    includeDataPoints,
  ]);

  return {
    metrics: result && result.metrics.dataPointCount > 0 ? result.metrics : null,
    dataPoints: result?.dataPoints ?? [],
    actualSnapshotTimestamps: result?.actualSnapshotTimestamps ?? [],
    isLoading,
  };
}

/**
 * A period's change for a KPI card: a plain change in value (savings and
 * purchases raise it), null with `trackingSince` when the history starts
 * after the period does.
 */
export interface PeriodChange {
  change: number | null;
  changePercent: number | null;
  valueAtStart: number | null;
  /** First known point when there is no value at the period start */
  trackingSince: number | null;
  partial: boolean;
}

export function toPeriodChange(metrics: PerformanceMetrics | null): PeriodChange {
  return {
    change: metrics?.absoluteChange ?? null,
    changePercent: metrics?.percentChange ?? null,
    valueAtStart: metrics?.startValue ?? null,
    trackingSince:
      metrics?.insufficientHistory ? metrics.firstPointTimestamp : null,
    partial: metrics?.partial ?? false,
  };
}
