/**
 * Discrete Performance Strategy
 *
 * Calculates performance from portfolio snapshots for assets where
 * values are only known at sync points (bank accounts, broker positions, etc.)
 *
 * Uses interpolation to estimate values at timestamps between snapshots.
 */

import { snapshotCostLine } from "../../portfolio/unrealizedProfitLoss";
import {
  isFlowAdjustedCategory,
  snapshotCategoryFlow,
  type NetFlow,
} from "../../portfolio/aggregate";

import type {
  CashFlow,
  ContinuousSource,
  PerformanceDataPoint,
  PerformanceResult,
  SnapshotCategoryBreakdown,
  SnapshotData,
} from "../types";

import {
  BasePerformanceStrategy,
  assessDataQuality,
  lastIndexAtOrBefore,
  sortByTimestamp,
  valueAt,
} from "./base";
import type {
  DiscretePerformanceInput,
  PerformanceCalculationOptions,
  CalculationContext,
  DataPointGenerationResult,
  SnapshotMetric,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════

interface SnapshotValue {
  timestamp: number;
  value: number;
  costBasis: number | null;
  /**
   * The value still holds the excluded (continuously valued) sources,
   * because the snapshot cannot be split by source: a legacy entry without
   * per-source values, or a row without a category breakdown.
   */
  includesContinuous: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Snapshot value extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Value of the excluded sources in one breakdown entry, or null when the
 * entry holds one of them but cannot be split (an entry written before
 * per-source values existed: old commodities entries were vault plus
 * Bitpanda and broker metals together).
 */
function excludedValue(
  entry: SnapshotCategoryBreakdown,
  exclude: ContinuousSource[],
): number | null {
  let total = 0;
  for (const ex of exclude) {
    if (entry.sources) {
      total += entry.sources
        .filter((s) => s.source === ex.source)
        .reduce((sum, s) => sum + s.value, 0);
    } else if (entry.category === ex.category) {
      return null;
    }
  }
  return total;
}

/**
 * Value of the excluded sources across the entries in scope, or null when
 * the snapshot cannot be split: then its full value is kept, flagged as
 * already including them.
 */
function excludedTotal(
  breakdown: SnapshotCategoryBreakdown[] | undefined,
  metric: SnapshotMetric,
  exclude: ContinuousSource[],
): number | null {
  if (exclude.length === 0) return 0;
  if (!breakdown) return null;
  let total = 0;
  for (const e of breakdown) {
    if (metric.kind === "category" && e.category !== metric.category) continue;
    const v = excludedValue(e, exclude);
    if (v === null) return null;
    total += v;
  }
  return total;
}

/**
 * A snapshot's value and cost line for a metric, or null when the snapshot
 * does not record it (a category on a legacy row without a breakdown). The
 * cost line is the stored one for the whole metric: it already covers the
 * excluded sources, so the hybrid strategy uses it as is. A row that cannot
 * be split by source keeps its full value with `includesContinuous` set;
 * it already holds the excluded sources at that day's prices.
 */
export function snapshotMetricValue(
  s: SnapshotData,
  metric: SnapshotMetric,
  exclude: ContinuousSource[] = [],
): SnapshotValue | null {
  const breakdown = s.categoryBreakdown;

  if (metric.kind === "category" && metric.category === "liabilities") {
    // Debt is stored as the snapshot's total, not as a breakdown entry
    return {
      timestamp: s.timestamp,
      value: s.totalLiabilities,
      costBasis: null,
      includesContinuous: false,
    };
  }
  if (metric.kind === "category" && !breakdown) return null;

  const excludedOrNull = excludedTotal(breakdown, metric, exclude);
  const includesContinuous = excludedOrNull === null;
  const excluded = excludedOrNull ?? 0;

  if (metric.kind === "category") {
    const entry = breakdown!.find((c) => c.category === metric.category);
    // A breakdown without the category means it was empty then
    return {
      timestamp: s.timestamp,
      value: (entry?.value ?? 0) - excluded,
      costBasis: entry ? snapshotCostLine(entry) : null,
      includesContinuous,
    };
  }

  const assetsCostLine = snapshotCostLine({
    value: s.totalAssets,
    costBasis: s.totalCostBasis,
    coveredValue: s.totalCoveredValue,
  });
  if (metric.kind === "totalAssets") {
    return {
      timestamp: s.timestamp,
      value: s.totalAssets - excluded,
      costBasis: assetsCostLine,
      includesContinuous,
    };
  }
  // Net worth: the same P/L against the cost line less the debt
  return {
    timestamp: s.timestamp,
    value: s.netWorth - excluded,
    costBasis:
      assetsCostLine === null ? null : assetsCostLine - s.totalLiabilities,
    includesContinuous,
  };
}

/**
 * External flow into a flow-adjusted category between two consecutive
 * snapshots (services/portfolio/aggregate.ts snapshotCategoryFlow: the
 * flow the snapshot writer stored, else an estimate), less the excluded
 * sources; null for a measure that is not flow-adjusted (net worth, total
 * assets, cash, liabilities: D2).
 */
export function snapshotMetricFlow(
  prev: SnapshotData,
  cur: SnapshotData,
  metric: SnapshotMetric,
  exclude: ContinuousSource[] = [],
): NetFlow | null {
  if (metric.kind !== "category" || !isFlowAdjustedCategory(metric.category)) {
    return null;
  }
  const find = (s: SnapshotData) =>
    s.categoryBreakdown?.find((c) => c.category === metric.category);
  const excluded = new Set(
    exclude.filter((e) => e.category === metric.category).map((e) => e.source),
  );
  return snapshotCategoryFlow(find(prev), find(cur), excluded);
}

// ═══════════════════════════════════════════════════════════════
// Discrete Performance Strategy
// ═══════════════════════════════════════════════════════════════

/**
 * Discrete Performance Strategy
 *
 * For values known only at sync points (bank balances, broker positions,
 * manual valuations). Each grid point takes the value as known at that
 * time through the shared series lookup: the snapshot within one interval
 * before it, else interpolated across gaps up to the limit, else the last
 * value held. Nothing is carried backward before the first snapshot, so a
 * range that starts before tracking has insufficient history.
 *
 * For a flow-adjusted category each snapshot also yields the external flow
 * since the previous one, dated at the snapshot. A value is never
 * interpolated toward a snapshot that received a flow: the jump is money
 * moved in on that day, not a gain accruing before it.
 */
export class DiscretePerformanceStrategy extends BasePerformanceStrategy<DiscretePerformanceInput> {
  readonly strategyType = "discrete" as const;

  protected generateDataPointsInternal(
    input: DiscretePerformanceInput,
    context: CalculationContext,
  ): DataPointGenerationResult {
    const values: (SnapshotValue & { flow: NetFlow | null })[] = [];
    let prev: SnapshotData | undefined;
    for (const s of sortByTimestamp(input.snapshots ?? [])) {
      const v = snapshotMetricValue(s, input.metric, input.excludeSources);
      if (!v) continue;
      values.push({
        ...v,
        flow: prev
          ? snapshotMetricFlow(prev, s, input.metric, input.excludeSources)
          : null,
      });
      prev = s;
    }
    const tracksFlows =
      input.metric.kind === "category" &&
      isFlowAdjustedCategory(input.metric.category);
    const flows: CashFlow[] = [];
    const estimatedFlowTimestamps: number[] = [];
    for (const [i, v] of values.entries()) {
      if (!v.flow) continue;
      if (v.flow.amount !== 0) {
        // Somewhere between the previous snapshot and this one
        flows.push({
          timestamp: v.timestamp,
          amount: v.flow.amount,
          spanStart: values[i - 1].timestamp,
        });
      }
      if (v.flow.estimated) estimatedFlowTimestamps.push(v.timestamp);
    }

    const dataPoints: PerformanceDataPoint[] = [];
    let observed = 0;
    let interpolated = 0;
    const lookup = this.lookupOptions(context);

    for (const ts of this.generateTimestampSeries(context)) {
      const found = valueAt(values, ts, lookup);
      if (!found) continue;
      const { costBasis, includesContinuous } = found.point;
      // Never interpolate between a row that holds the excluded sources and
      // one that does not: the two values measure different scopes.
      // ... nor toward a snapshot that received a flow
      const next = values[lastIndexAtOrBefore(values, ts) + 1];
      const value =
        found.kind === "interpolated" &&
        next !== undefined &&
        (next.includesContinuous !== includesContinuous ||
          (next.flow !== null && next.flow.amount !== 0))
          ? found.point.value
          : found.value;
      const point =
        found.kind === "observed"
          ? this.createSnapshotPoint(ts, value, costBasis)
          : this.createInterpolatedPoint(ts, value, costBasis);
      if (found.kind === "observed") observed++;
      else interpolated++;
      dataPoints.push(
        includesContinuous ? { ...point, includesContinuous: true } : point,
      );
    }

    return {
      dataPoints,
      actualDataPoints: observed,
      interpolatedDataPoints: interpolated,
      dataQuality: assessDataQuality(observed, context.expectedDataPoints),
      actualSnapshotTimestamps: values
        .map((s) => s.timestamp)
        .filter((t) => t <= context.endTimestamp),
      ...(tracksFlows && {
        flows,
        flowCoverage: "complete" as const,
        estimatedFlowTimestamps,
      }),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate discrete performance with default options
 */
export function calculateDiscretePerformance(
  input: DiscretePerformanceInput,
  options: PerformanceCalculationOptions,
): PerformanceResult {
  const strategy = new DiscretePerformanceStrategy();
  return strategy.calculate(input, options);
}

/**
 * Singleton instance for reuse
 */
let discreteStrategyInstance: DiscretePerformanceStrategy | null = null;

/**
 * Get shared strategy instance
 */
export function getDiscreteStrategy(): DiscretePerformanceStrategy {
  if (!discreteStrategyInstance) {
    discreteStrategyInstance = new DiscretePerformanceStrategy();
  }
  return discreteStrategyInstance;
}
