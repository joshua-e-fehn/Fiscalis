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
  /**
   * The cost line still holds the excluded sources' cost line, because the
   * snapshot does not record it by source (rows written before per-source
   * costs, and every row with includesContinuous).
   */
  costIncludesContinuous: boolean;
}

interface SeriesValue extends SnapshotValue {
  flow: NetFlow | null;
  /** The snapshot was taken after a provider sync partly failed */
  partial: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Snapshot value extraction
// ═══════════════════════════════════════════════════════════════

/** Value and cost line of the excluded sources in a snapshot. */
interface ExcludedPart {
  value: number;
  /** Their cost line; null when the row does not record it by source */
  costLine: number | null;
}

/**
 * Cost line of one source entry (snapshotCostLine: its cost plus the value
 * of its holdings without one), or null on a row written before sources
 * recorded their cost.
 */
function sourceCostLine(source: {
  value: number;
  costBasis?: number;
  coveredValue?: number;
}): number | null {
  if (source.coveredValue === undefined) return null;
  return source.costBasis === undefined
    ? source.value
    : snapshotCostLine(source);
}

/**
 * The excluded sources' part of one breakdown entry, or null when the entry
 * holds one of them but cannot be split (an entry written before
 * per-source values existed: old commodities entries were vault plus
 * Bitpanda and broker metals together).
 */
function excludedPart(
  entry: SnapshotCategoryBreakdown,
  exclude: ContinuousSource[],
): ExcludedPart | null {
  let value = 0;
  let costLine: number | null = 0;
  for (const ex of exclude) {
    if (entry.sources) {
      for (const s of entry.sources) {
        if (s.source !== ex.source) continue;
        value += s.value;
        const line = sourceCostLine(s);
        costLine = costLine === null || line === null ? null : costLine + line;
      }
    } else if (entry.category === ex.category) {
      return null;
    }
  }
  return { value, costLine };
}

/**
 * The excluded sources' part across the entries in scope, or null when the
 * snapshot cannot be split: then its full value is kept, flagged as
 * already including them.
 */
function excludedTotal(
  breakdown: SnapshotCategoryBreakdown[] | undefined,
  metric: SnapshotMetric,
  exclude: ContinuousSource[],
): ExcludedPart | null {
  if (exclude.length === 0) return { value: 0, costLine: 0 };
  if (!breakdown) return null;
  const total: ExcludedPart = { value: 0, costLine: 0 };
  for (const e of breakdown) {
    if (metric.kind === "category" && e.category !== metric.category) continue;
    const part = excludedPart(e, exclude);
    if (part === null) return null;
    total.value += part.value;
    total.costLine =
      total.costLine === null || part.costLine === null
        ? null
        : total.costLine + part.costLine;
  }
  return total;
}

/**
 * A snapshot's value and cost line for a metric, or null when the snapshot
 * does not record it (a category on a legacy row without a breakdown). Both
 * leave out the excluded (continuously valued) sources where the row
 * records them by source. A row that cannot be split keeps its full value
 * with `includesContinuous` set: it already holds the excluded sources at
 * that day's prices. A row that records values but not costs by source
 * keeps the full cost line, flagged `costIncludesContinuous`.
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
      costIncludesContinuous: false,
    };
  }
  if (metric.kind === "category" && !breakdown) return null;

  const excluded = excludedTotal(breakdown, metric, exclude);
  const includesContinuous = excluded === null;
  const costIncludesContinuous = excluded?.costLine == null;
  const without = (value: number, costLine: number | null) => ({
    timestamp: s.timestamp,
    value: value - (excluded?.value ?? 0),
    costBasis:
      costLine === null || costIncludesContinuous
        ? costLine
        : costLine - excluded!.costLine!,
    includesContinuous,
    costIncludesContinuous,
  });

  if (metric.kind === "category") {
    const entry = breakdown!.find((c) => c.category === metric.category);
    // A breakdown without the category means it was empty then
    return without(entry?.value ?? 0, entry ? snapshotCostLine(entry) : null);
  }

  const assetsCostLine = snapshotCostLine({
    value: s.totalAssets,
    costBasis: s.totalCostBasis,
    coveredValue: s.totalCoveredValue,
  });
  if (metric.kind === "totalAssets") {
    return without(s.totalAssets, assetsCostLine);
  }
  return without(s.netWorth, netWorthCostLine(assetsCostLine, s.totalLiabilities));
}

/**
 * Net worth's cost line: the assets' cost line less the debt, so the P/L
 * against it is the assets' P/L. Null when the assets' cost line is.
 */
export function netWorthCostLine(
  assetsCostLine: number | null,
  totalLiabilities: number,
): number | null {
  return assetsCostLine === null ? null : assetsCostLine - totalLiabilities;
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
    const values: SeriesValue[] = [];
    let prev: SnapshotData | undefined;
    for (const s of sortByTimestamp(input.snapshots ?? [])) {
      const v = snapshotMetricValue(s, input.metric, input.excludeSources);
      if (!v) continue;
      values.push({
        ...v,
        partial: s.partial === true,
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
    // Whether each point's value rests on a partial snapshot
    const pointPartial: boolean[] = [];
    const lookup = this.lookupOptions(context);

    for (const ts of this.generateTimestampSeries(context)) {
      const found = valueAt(values, ts, lookup);
      if (!found) continue;
      const { costBasis, includesContinuous, costIncludesContinuous } =
        found.point;
      // Never interpolate between a row that holds the excluded sources and
      // one that does not: the two values measure different scopes.
      // ... nor toward a snapshot that received a flow
      const next = values[lastIndexAtOrBefore(values, ts) + 1];
      const interpolatesToNext =
        found.kind === "interpolated" &&
        next !== undefined &&
        next.includesContinuous === includesContinuous &&
        (next.flow === null || next.flow.amount === 0);
      const value =
        found.kind === "interpolated" && !interpolatesToNext
          ? found.point.value
          : found.value;
      // The next snapshot's partial status counts only when its value
      // enters this point
      pointPartial.push(
        found.point.partial || (interpolatesToNext && next.partial === true),
      );
      const point =
        found.kind === "observed"
          ? this.createSnapshotPoint(ts, value, costBasis)
          : this.createInterpolatedPoint(ts, value, costBasis);
      if (found.kind === "observed") observed++;
      else interpolated++;
      dataPoints.push({
        ...point,
        ...(includesContinuous && { includesContinuous: true }),
        ...(costIncludesContinuous && { costIncludesContinuous: true }),
      });
    }

    return {
      dataPoints,
      actualDataPoints: observed,
      interpolatedDataPoints: interpolated,
      dataQuality: assessDataQuality(observed, context.expectedDataPoints),
      // The measured figures (start and end) rest on a partial snapshot
      partial: pointPartial[0] === true || pointPartial.at(-1) === true,
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
