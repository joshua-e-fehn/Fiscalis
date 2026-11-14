/**
 * The one performance entry point for the app.
 *
 * Every widget names what it measures (net worth, total assets or one
 * category) and a time range. Which strategy values which holdings comes
 * from the valuation resolver (services/performance/config.ts): sources
 * with a price feed (vault metals) are valued continuously, everything else
 * from the shared snapshot series, combined by the hybrid strategy on one
 * grid. KPI presets only choose how the result is shown.
 *
 * Every amount is in the display currency (useDisplayCurrency): each
 * snapshot at its own day's rate, the vault in the display currency, so
 * returns are returns in that currency and include the exchange-rate move.
 * A live end comes from the overview's figures, which are converted at the
 * latest rate already, and is used as given.
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import {
  continuousSourcesFor,
  getHybridStrategy,
  netWorthCostLine,
  type LiveEnd,
  type PerformanceCalculationOptions,
  type PerformanceDataPoint,
  type PerformanceMeasure,
  type PerformanceMetrics,
  type SnapshotData,
  type SnapshotMetric,
  type TimeRange,
} from "@/lib/performance";
import { MS, getTimeRangeStartTimestamp } from "@/../services/finance/financeService";
import type { HoldingCategory } from "@/../services/portfolio/aggregate";
import { snapshotInCurrency } from "@/../services/finance/displayCurrency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import {
  useDisplayCurrency,
  useDisplayRateHistory,
} from "@/hooks/convex/displayCurrency";

import { useVaultPerformanceInput, withPartial } from "./useContinuousPerformance";

// ═══════════════════════════════════════════════════════════════
// The one snapshot reader
// ═══════════════════════════════════════════════════════════════
// Every performance consumer derives from it, so widgets on a page see the
// same history. One range query returns the baseline snapshot at or before
// the range start plus every snapshot after it (newest-inclusive). The start
// is floored to the UTC day, so widgets asking for the same range share one
// subscription, and the baseline still lies at or before the exact start.
// Each snapshot is converted into the display currency at its own day's
// rate (snapshotInCurrency), from daily rates since the range start, or
// for "ALL" since the first snapshot.

/** Guard only: about five years of daily rows plus intraday ones */
const SNAPSHOT_LIMIT = 2000;

export interface UseSnapshotsResult {
  /** Ascending snapshots, every amount in `currency` */
  snapshots: SnapshotData[];
  /** The display currency */
  currency: InvestmentCurrency;
  /** Converted at the latest rate for want of daily rates */
  partial: boolean;
  isLoading: boolean;
}

/** UTC-day-floored start of a range, or undefined for "ALL" */
function rangeSince(timeRange: TimeRange, now: number): number | undefined {
  if (timeRange === "ALL") return undefined;
  const start = getTimeRangeStartTimestamp(timeRange, now);
  return Math.floor(start / MS.DAY) * MS.DAY;
}

export function useSnapshots(
  timeRange: TimeRange,
  options?: { enabled?: boolean },
): UseSnapshotsResult {
  const enabled = options?.enabled ?? true;

  // Read the clock only when the range is (re)selected, not on every render.
  // A range change re-anchors during render; React discards that render and
  // re-runs with the new anchor before committing.
  const anchorFor = () => ({
    timeRange,
    since: rangeSince(timeRange, Date.now()),
  });
  const [anchor, setAnchor] = useState(anchorFor);
  if (anchor.timeRange !== timeRange) setAnchor(anchorFor);
  const since = anchor.since;

  const raw = useQuery(
    api.portfolioSnapshots.getSnapshots,
    enabled
      ? since === undefined
        ? { limit: SNAPSHOT_LIMIT }
        : { since, limit: SNAPSHOT_LIMIT }
      : "skip",
  );

  const display = useDisplayCurrency();
  // From the earliest snapshot returned: the query includes the baseline
  // snapshot before `since`, which needs its own day's rate too
  const firstSnapshotAt = raw?.[0]?.timestamp;
  const rates = useDisplayRateHistory(
    enabled
      ? since === undefined
        ? firstSnapshotAt
        : Math.min(since, firstSnapshotAt ?? since)
      : undefined,
  );
  const ratesLoading = display.isLoading || rates.isLoading;
  const rateOn = rates.rateOn;

  const snapshots = useMemo<SnapshotData[]>(() => {
    if (ratesLoading) return [];
    return (raw ?? []).map((s) => {
      const snapshot: SnapshotData = {
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
      };
      return snapshotInCurrency(snapshot, rateOn(s.timestamp));
    });
  }, [raw, ratesLoading, rateOn]);

  return {
    snapshots,
    currency: display.currency,
    partial: rates.partial && snapshots.length > 0,
    isLoading: enabled && (raw === undefined || ratesLoading),
  };
}

// ═══════════════════════════════════════════════════════════════
// The one performance entry point
// ═══════════════════════════════════════════════════════════════

export interface UseCategoryPerformanceOptions {
  includeDataPoints?: boolean;
  enabled?: boolean;
  /** "firstPoint": measure since tracking started when that is later */
  baseline?: PerformanceCalculationOptions["baseline"];
  /**
   * End the series at this live value (portfolioLiveEnd), in the display
   * currency (the overview's converted figures)
   */
  liveEnd?: LiveEnd;
}

export interface CategoryPerformanceResult {
  metrics: PerformanceMetrics | null;
  dataPoints: PerformanceDataPoint[];
  /** Timestamps of the real snapshots behind the series, ascending */
  actualSnapshotTimestamps: number[];
  /** The display currency every amount is in */
  currency: InvestmentCurrency;
  isLoading: boolean;
}

export function useCategoryPerformance(
  measure: PerformanceMeasure,
  timeRange: TimeRange,
  options: UseCategoryPerformanceOptions = {},
): CategoryPerformanceResult {
  const {
    includeDataPoints = false,
    enabled = true,
    baseline,
    liveEnd,
  } = options;

  // A source measure (the vault alone) has no snapshot part
  const measureKey = JSON.stringify(measure);
  const needsSnapshots = measure.kind !== "source";
  const continuousSources = useMemo(() => {
    const m = JSON.parse(measureKey) as PerformanceMeasure;
    return continuousSourcesFor(
      m.kind === "category"
        ? (m.category as HoldingCategory)
        : m.kind === "source"
          ? { source: m.source }
          : "all",
    );
  }, [measureKey]);
  const needsVault = continuousSources.some((s) => s.source === "vault");

  const {
    snapshots,
    currency,
    partial: snapshotsPartial,
    isLoading: snapshotsLoading,
  } = useSnapshots(timeRange, {
    enabled: enabled && needsSnapshots,
  });
  const vault = useVaultPerformanceInput({
    timeRange,
    enabled: enabled && needsVault,
  });
  const isLoading = snapshotsLoading || (needsVault && vault.isLoading);
  const ratesPartial =
    (needsSnapshots && snapshotsPartial) || (needsVault && vault.partial);

  const liveValue = liveEnd?.value;
  const liveCost = liveEnd?.costBasis;
  const result = useMemo(() => {
    if (!enabled || isLoading) return null;
    const measured = JSON.parse(measureKey) as PerformanceMeasure;
    const metric: SnapshotMetric | null =
      measured.kind === "source" ? null : measured;
    return getHybridStrategy().calculate(
      {
        // Always given for a snapshot metric, even empty: the hybrid
        // strategy then decides whether the vault alone covers the measure
        // (it does not for net worth)
        discrete: metric ? { snapshots, metric } : undefined,
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

  const metrics = useMemo(
    () =>
      result && result.metrics.dataPointCount > 0
        ? withPartial(result.metrics, ratesPartial)
        : null,
    [result, ratesPartial],
  );

  return {
    metrics,
    dataPoints: result?.dataPoints ?? [],
    actualSnapshotTimestamps: result?.actualSnapshotTimestamps ?? [],
    currency,
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
