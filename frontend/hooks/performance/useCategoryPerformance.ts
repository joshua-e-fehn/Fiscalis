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
  netWorthCostLine,
  type LiveEnd,
  type PerformanceCalculationOptions,
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
          netFlow: c.netFlow,
          netFlowEstimated: c.netFlowEstimated,
        })),
        source: s.source,
        partial: s.partial,
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
  /** "firstPoint": measure since tracking started when that is later */
  baseline?: PerformanceCalculationOptions["baseline"];
  /** End the series at this live value (portfolioLiveEnd) */
  liveEnd?: LiveEnd;
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
  const {
    includeDataPoints = false,
    currency = "eur",
    enabled = true,
    baseline,
    liveEnd,
  } = options;

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
  const liveValue = liveEnd?.value;
  const liveCost = liveEnd?.costBasis;
  const result = useMemo(() => {
    if (!enabled || isLoading) return null;
    const metric = JSON.parse(measureKey) as SnapshotMetric;
    return getHybridStrategy().calculate(
      {
        // Always given, even empty: the hybrid strategy then decides whether
        // the vault alone covers the measure (it does not for net worth)
        discrete: { snapshots, metric },
        continuous: needsVault ? vault.input : undefined,
        continuousSources,
      },
      {
        timeRange,
        includeDataPoints,
        baseline,
        liveEnd:
          liveValue === undefined
            ? undefined
            : { value: liveValue, costBasis: liveCost ?? null },
      },
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
    baseline,
    liveValue,
    liveCost,
  ]);

  return {
    metrics: result && result.metrics.dataPointCount > 0 ? result.metrics : null,
    dataPoints: result?.dataPoints ?? [],
    actualSnapshotTimestamps: result?.actualSnapshotTimestamps ?? [],
    isLoading,
  };
}

/** The overview's live totals (usePortfolioOverview's summary) */
export interface LivePortfolioTotals {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** Cost line of the assets; null when unknown */
  costLine: number | null;
}

/**
 * The live end of a total-assets or net-worth series (PF-05): the figure
 * the headline cards show, so a card or chart over the series ends there.
 */
export function portfolioLiveEnd(
  kind: "totalAssets" | "netWorth",
  live: LivePortfolioTotals,
): LiveEnd {
  return kind === "netWorth"
    ? {
        value: live.netWorth,
        costBasis: netWorthCostLine(live.costLine, live.totalLiabilities),
      }
    : { value: live.totalAssets, costBasis: live.costLine };
}

/**
 * A period's change for a KPI card (D2). For an investment category it is
 * the P/L net of money moved in and out (purchases, deposits, sales), with
 * the time-weighted return; for net worth and cash a plain change in value
 * (savings raise it). Null with `trackingSince` when the history starts
 * after the period does.
 */
export interface PeriodChange {
  /** P/L net of flows when flowAdjusted, else the change in value */
  change: number | null;
  /** Time-weighted return (else Modified Dietz) when flowAdjusted, else the % change */
  changePercent: number | null;
  valueAtStart: number | null;
  /** First known point when there is no value at the period start */
  trackingSince: number | null;
  partial: boolean;
  /** The change is net of external flows: label it a return, not a change */
  flowAdjusted: boolean;
  /** Some flows were assumed (holdings without a cost basis) */
  flowsEstimated: boolean;
}

export function toPeriodChange(metrics: PerformanceMetrics | null): PeriodChange {
  const flowAdjusted =
    metrics !== null && metrics.flowCoverage !== "none";
  return {
    change: flowAdjusted
      ? metrics.profitLoss
      : (metrics?.absoluteChange ?? null),
    changePercent: flowAdjusted
      ? (metrics.timeWeightedPercent ?? metrics.modifiedDietzPercent)
      : (metrics?.percentChange ?? null),
    valueAtStart: metrics?.startValue ?? null,
    trackingSince:
      metrics?.insufficientHistory ? metrics.firstPointTimestamp : null,
    partial: metrics?.partial ?? false,
    flowAdjusted,
    flowsEstimated: metrics?.flowCoverage === "estimated",
  };
}
