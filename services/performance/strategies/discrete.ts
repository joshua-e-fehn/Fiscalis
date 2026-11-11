/**
 * Discrete Performance Strategy
 *
 * Calculates performance from portfolio snapshots for assets where
 * values are only known at sync points (bank accounts, broker positions, etc.)
 *
 * Uses interpolation to estimate values at timestamps between snapshots.
 */

import { snapshotCostLine } from "../../portfolio/unrealizedProfitLoss";

import type {
  ContinuousSource,
  PerformanceDataPoint,
  PerformanceResult,
  SnapshotCategoryBreakdown,
  SnapshotData,
} from "../types";

import {
  BasePerformanceStrategy,
  assessDataQuality,
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
}

// ═══════════════════════════════════════════════════════════════
// Snapshot value extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Value of the excluded sources in one breakdown entry. An entry written
 * before per-source values existed counts wholly to a source stored under
 * its category (old commodities entries are taken as vault).
 */
function excludedValue(
  entry: SnapshotCategoryBreakdown,
  exclude: ContinuousSource[],
): number {
  let total = 0;
  for (const ex of exclude) {
    if (entry.sources) {
      total += entry.sources
        .filter((s) => s.source === ex.source)
        .reduce((sum, s) => sum + s.value, 0);
    } else if (entry.category === ex.category) {
      total += entry.value;
    }
  }
  return total;
}

/**
 * A snapshot's value and cost line for a metric, or null when the snapshot
 * does not record it (a legacy row without a category breakdown). The cost
 * line is the stored one for the whole metric: it already covers the
 * excluded sources, so the hybrid strategy uses it as is.
 */
export function snapshotMetricValue(
  s: SnapshotData,
  metric: SnapshotMetric,
  exclude: ContinuousSource[] = [],
): SnapshotValue | null {
  const breakdown = s.categoryBreakdown;
  const excluded =
    exclude.length === 0
      ? 0
      : (breakdown ?? [])
          .filter((e) => metric.kind !== "category" || e.category === metric.category)
          .reduce((sum, e) => sum + excludedValue(e, exclude), 0);

  if (metric.kind === "category" && metric.category === "liabilities") {
    // Debt is stored as the snapshot's total, not as a breakdown entry
    return { timestamp: s.timestamp, value: s.totalLiabilities, costBasis: null };
  }
  if (metric.kind === "category") {
    if (!breakdown) return null;
    const entry = breakdown.find((c) => c.category === metric.category);
    // A breakdown without the category means it was empty then
    return {
      timestamp: s.timestamp,
      value: (entry?.value ?? 0) - excluded,
      costBasis: entry ? snapshotCostLine(entry) : null,
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
    };
  }
  // Net worth: the same P/L against the cost line less the debt
  return {
    timestamp: s.timestamp,
    value: s.netWorth - excluded,
    costBasis:
      assetsCostLine === null ? null : assetsCostLine - s.totalLiabilities,
  };
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
 */
export class DiscretePerformanceStrategy extends BasePerformanceStrategy<DiscretePerformanceInput> {
  readonly strategyType = "discrete" as const;

  protected generateDataPointsInternal(
    input: DiscretePerformanceInput,
    context: CalculationContext,
  ): DataPointGenerationResult {
    const values = sortByTimestamp(
      (input.snapshots ?? []).flatMap((s) => {
        const v = snapshotMetricValue(s, input.metric, input.excludeSources);
        return v ? [v] : [];
      }),
    );

    const dataPoints: PerformanceDataPoint[] = [];
    let observed = 0;
    let interpolated = 0;
    const lookup = this.lookupOptions(context);

    for (const ts of this.generateTimestampSeries(context)) {
      const found = valueAt(values, ts, lookup);
      if (!found) continue;
      const costBasis = found.point.costBasis;
      if (found.kind === "observed") {
        observed++;
        dataPoints.push(this.createSnapshotPoint(ts, found.value, costBasis));
      } else {
        interpolated++;
        dataPoints.push(this.createInterpolatedPoint(ts, found.value, costBasis));
      }
    }

    return {
      dataPoints,
      actualDataPoints: observed,
      interpolatedDataPoints: interpolated,
      dataQuality: assessDataQuality(observed, context.expectedDataPoints),
      actualSnapshotTimestamps: values
        .map((s) => s.timestamp)
        .filter((t) => t <= context.endTimestamp),
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
