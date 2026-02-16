/**
 * Discrete Performance Strategy
 *
 * Calculates performance from portfolio snapshots for assets where
 * values are only known at sync points (bank accounts, broker positions, etc.)
 *
 * Uses interpolation to estimate values at timestamps between snapshots.
 */

import { getTimeIntervalInMilliseconds } from "../../finance/financeService";

import type {
  PerformanceDataPoint,
  PerformanceResult,
  DataQuality,
  SnapshotData,
} from "../types";

import { BasePerformanceStrategy } from "./base";
import type {
  DiscretePerformanceInput,
  PerformanceCalculationOptions,
  CalculationContext,
  DataPointGenerationResult,
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
// Discrete Performance Strategy
// ═══════════════════════════════════════════════════════════════

/**
 * Discrete Performance Strategy
 *
 * For assets with values known only at discrete sync points:
 * - Bank account balances
 * - Broker positions (at sync time)
 * - Credit card balances
 * - Real estate values
 *
 * Interpolates between snapshots when data at exact timestamps is needed.
 */
export class DiscretePerformanceStrategy extends BasePerformanceStrategy<DiscretePerformanceInput> {
  readonly strategyType = "discrete" as const;

  // ═══════════════════════════════════════════════════════════════
  // Public Interface
  // ═══════════════════════════════════════════════════════════════

  /**
   * Assess data quality based on snapshot coverage
   */
  assessDataQuality(
    input: DiscretePerformanceInput,
    options: PerformanceCalculationOptions,
  ): DataQuality {
    const context = this.createContext(options);
    const { snapshots, categoryFilter } = input;

    if (!snapshots || snapshots.length === 0) {
      return "low";
    }

    // Filter snapshots within range
    const rangeSnapshots = snapshots.filter(
      (s) =>
        s.timestamp >= context.startTimestamp &&
        s.timestamp <= context.endTimestamp,
    );

    // Calculate coverage
    const coverageRatio = rangeSnapshots.length / context.expectedDataPoints;

    // Check for category-specific data if filtering
    if (categoryFilter) {
      const hasCategory = rangeSnapshots.some((s) =>
        s.categoryBreakdown?.some((c) => c.category === categoryFilter),
      );
      if (!hasCategory) return "low";
    }

    return this.assessQuality(
      rangeSnapshots.length,
      context.expectedDataPoints,
      0,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Protected Implementation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate data points from snapshots
   */
  protected generateDataPointsInternal(
    input: DiscretePerformanceInput,
    context: CalculationContext,
  ): DataPointGenerationResult {
    const { snapshots, categoryFilter } = input;

    if (!snapshots || snapshots.length === 0) {
      return {
        dataPoints: [],
        actualDataPoints: 0,
        interpolatedDataPoints: 0,
        dataQuality: "low",
      };
    }

    // Extract values from snapshots
    const snapshotValues = this.extractSnapshotValues(
      snapshots,
      categoryFilter,
    );

    // Sort by timestamp
    snapshotValues.sort((a, b) => a.timestamp - b.timestamp);

    // For category-specific calculations, check if the category had meaningful value
    // before the range start. If the category had 0 value (or didn't exist) before
    // the range, we shouldn't show misleading YTD performance.
    let shouldUseCurrentAsBaseline = false;

    if (categoryFilter) {
      // Check if there's a meaningful baseline (non-zero value) at or before range start
      // A snapshot with 0 value doesn't count as a valid baseline for this category
      // because if something went from 0 to X, there's no meaningful "performance" to measure
      const hasNonZeroSnapshotBeforeRangeStart = snapshotValues.some(
        (s) => s.timestamp <= context.startTimestamp && s.value > 0,
      );

      // If this category didn't have a non-zero value before range start,
      // use the current value as baseline (showing 0% change)
      shouldUseCurrentAsBaseline = !hasNonZeroSnapshotBeforeRangeStart;
    }

    // Generate timestamp series for the context
    const timestamps = this.generateTimestampSeries(context);

    // Build data points by mapping timestamps to values
    const dataPoints: PerformanceDataPoint[] = [];
    let interpolatedCount = 0;

    for (const ts of timestamps) {
      const point = this.getValueAtTimestamp(snapshotValues, ts);
      if (point) {
        dataPoints.push(point);
        if (point.source === "interpolated") {
          interpolatedCount++;
        }
      }
    }

    // If we should use current value as baseline (only 1 snapshot in range,
    // no historical data before range), flatten all points to the current value
    if (shouldUseCurrentAsBaseline && dataPoints.length > 0) {
      const latestValue = dataPoints[dataPoints.length - 1].value;
      const latestCostBasis = dataPoints[dataPoints.length - 1].costBasis;
      for (const point of dataPoints) {
        point.value = latestValue;
        point.costBasis = latestCostBasis;
        point.source = "interpolated";
      }
      interpolatedCount = dataPoints.length;
    }

    const dataQuality = this.assessQuality(
      dataPoints.length,
      context.expectedDataPoints,
      interpolatedCount,
    );

    return {
      dataPoints,
      actualDataPoints: dataPoints.length - interpolatedCount,
      interpolatedDataPoints: interpolatedCount,
      dataQuality,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Extract snapshot values, optionally filtering by category
   */
  private extractSnapshotValues(
    snapshots: SnapshotData[],
    categoryFilter?: string,
  ): SnapshotValue[] {
    return snapshots.map((s) => {
      if (categoryFilter && s.categoryBreakdown) {
        const categoryData = s.categoryBreakdown.find(
          (c) => c.category === categoryFilter,
        );
        return {
          timestamp: s.timestamp,
          value: categoryData?.value ?? 0,
          costBasis: categoryData?.costBasis ?? null,
        };
      }

      return {
        timestamp: s.timestamp,
        value: s.totalAssets,
        costBasis: s.totalCostBasis ?? null,
      };
    });
  }

  /**
   * Get value at a specific timestamp
   * Returns exact snapshot if exists, otherwise interpolates
   */
  private getValueAtTimestamp(
    snapshotValues: SnapshotValue[],
    timestamp: number,
  ): PerformanceDataPoint | null {
    if (snapshotValues.length === 0) return null;

    // Find exact match
    const exactMatch = snapshotValues.find((s) => s.timestamp === timestamp);
    if (exactMatch) {
      return this.createSnapshotPoint(
        exactMatch.timestamp,
        exactMatch.value,
        exactMatch.costBasis,
      );
    }

    // Find surrounding snapshots for interpolation
    const { before, after } = this.findSurroundingSnapshots(
      snapshotValues,
      timestamp,
    );

    // Handle edge cases
    if (!before && !after) return null;

    if (!before && after) {
      // Before range start, use first snapshot value (carry backward)
      return this.createInterpolatedPoint(
        timestamp,
        after.value,
        after.costBasis,
      );
    }

    if (before && !after) {
      // After last snapshot, use last value (carry forward)
      return this.createInterpolatedPoint(
        timestamp,
        before.value,
        before.costBasis,
      );
    }

    // Interpolate between two snapshots
    const interpolatedValue = this.interpolateValue(
      timestamp,
      { timestamp: before!.timestamp, value: before!.value },
      { timestamp: after!.timestamp, value: after!.value },
    );

    // For cost basis, we don't interpolate - use the before value
    return this.createInterpolatedPoint(
      timestamp,
      interpolatedValue,
      before!.costBasis,
    );
  }

  /**
   * Find snapshots immediately before and after a timestamp
   */
  private findSurroundingSnapshots(
    snapshotValues: SnapshotValue[],
    timestamp: number,
  ): { before: SnapshotValue | null; after: SnapshotValue | null } {
    let before: SnapshotValue | null = null;
    let after: SnapshotValue | null = null;

    for (const snapshot of snapshotValues) {
      if (snapshot.timestamp <= timestamp) {
        before = snapshot;
      } else if (snapshot.timestamp > timestamp && !after) {
        after = snapshot;
        break;
      }
    }

    return { before, after };
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
