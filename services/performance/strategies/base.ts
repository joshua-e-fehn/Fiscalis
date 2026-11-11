/**
 * Base Performance Strategy
 *
 * Abstract base class providing common functionality for all
 * performance calculation strategies, and the sorted-series helpers they
 * share.
 */

import {
  getTimeRangeStartTimestamp,
  getDefaultIntervalForRange,
  getTimeIntervalInMilliseconds,
} from "../../finance/financeService";

import type {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceResult,
  ValueType,
  DataQuality,
} from "../types";

import type {
  IPerformanceStrategy,
  PerformanceCalculationOptions,
  CalculationContext,
  DataPointGenerationResult,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Sorted-series helpers
// ═══════════════════════════════════════════════════════════════
// Shared by every strategy: one lookup for "value at t" (snapshots and
// price series alike), one data-quality rule and one percent-change rule.

/** Share of observed grid points needed for each data-quality level */
export const DEFAULT_CONFIDENCE_THRESHOLD = {
  high: 0.9,
  medium: 0.7,
};

/**
 * Longest gap, in grid intervals, a value is interpolated across; beyond it
 * the last known value is held (a bank balance does not drift linearly).
 */
export const MAX_INTERPOLATION_GAP_MULTIPLIER = 3;

export interface SeriesPoint {
  timestamp: number;
  value: number;
}

/**
 * How a looked-up value was obtained:
 * - observed: a real point lies within the tolerance of t;
 * - interpolated: linear between the neighbours (gap within the limit);
 * - held: the last value at or before t, carried forward (after the last
 *   point, or across a gap too large to interpolate).
 */
export type LookupKind = "observed" | "interpolated" | "held";

export interface LookupResult<T extends SeriesPoint> {
  value: number;
  kind: LookupKind;
  /** The point at or before t the value comes from (after t only for a look-ahead match) */
  point: T;
}

export interface SeriesLookupOptions {
  /** A point at most this far before t (or half as far after it) counts as observed */
  toleranceMs: number;
  /** Interpolate only across gaps up to this length; beyond, step-hold */
  maxGapMs: number;
  /** false: never interpolate, always take the last point at or before t */
  interpolate?: boolean;
}

/** Ascending copy of a series. */
export function sortByTimestamp<T extends { timestamp: number }>(
  points: readonly T[],
): T[] {
  return [...points].sort((a, b) => a.timestamp - b.timestamp);
}

/** Index of the last point at or before t in an ascending series, or -1. */
export function lastIndexAtOrBefore(
  sorted: readonly { timestamp: number }[],
  t: number,
): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].timestamp <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Value of an ascending series at t, or null when nothing is known at t:
 * there is no point at or before t and none within half the tolerance
 * after it. A value is never carried backward from a later point.
 */
export function valueAt<T extends SeriesPoint>(
  sorted: readonly T[],
  t: number,
  options: SeriesLookupOptions,
): LookupResult<T> | null {
  const i = lastIndexAtOrBefore(sorted, t);
  const before = i >= 0 ? sorted[i] : undefined;
  const after = i + 1 < sorted.length ? sorted[i + 1] : undefined;

  if (!before) {
    if (after && after.timestamp - t <= options.toleranceMs / 2) {
      return { value: after.value, kind: "observed", point: after };
    }
    return null;
  }
  if (t - before.timestamp <= options.toleranceMs) {
    return { value: before.value, kind: "observed", point: before };
  }
  if (
    !after ||
    options.interpolate === false ||
    after.timestamp - before.timestamp > options.maxGapMs
  ) {
    return { value: before.value, kind: "held", point: before };
  }
  const ratio =
    (t - before.timestamp) / (after.timestamp - before.timestamp);
  return {
    value: before.value + (after.value - before.value) * ratio,
    kind: "interpolated",
    point: before,
  };
}

/** Lookup options for a grid of the given interval. */
export function lookupOptionsForInterval(
  intervalMs: number,
  maxGapMultiplier: number = MAX_INTERPOLATION_GAP_MULTIPLIER,
  interpolate = true,
): SeriesLookupOptions {
  return {
    toleranceMs: intervalMs,
    maxGapMs: intervalMs * maxGapMultiplier,
    interpolate,
  };
}

/**
 * The one data-quality rule: the share of grid points backed by a real
 * observation, against the confidence thresholds.
 */
export function assessDataQuality(
  observedPoints: number,
  expectedPoints: number,
): DataQuality {
  if (observedPoints <= 0 || expectedPoints <= 0) return "low";
  const coverage = observedPoints / expectedPoints;
  if (coverage >= DEFAULT_CONFIDENCE_THRESHOLD.high) return "high";
  if (coverage >= DEFAULT_CONFIDENCE_THRESHOLD.medium) return "medium";
  return "low";
}

/**
 * Percent change from start to end, relative to |start| so a negative start
 * (net worth in debt) keeps the sign of the change. Null when the start is
 * unknown or 0, where a percentage is undefined.
 */
export function changePercent(
  start: number | null,
  end: number,
): number | null {
  if (start === null || start === 0) return null;
  return ((end - start) / Math.abs(start)) * 100;
}

// ═══════════════════════════════════════════════════════════════
// Abstract Base Strategy
// ═══════════════════════════════════════════════════════════════

/**
 * Abstract base class for performance strategies
 *
 * Provides common utilities:
 * - Context creation from options (one reference time)
 * - Metrics calculation from data points (one baseline rule)
 * - Data point constructors and the grid
 */
export abstract class BasePerformanceStrategy<
  TInput,
> implements IPerformanceStrategy<TInput> {
  abstract readonly strategyType: ValueType | "hybrid";

  /**
   * Calculate performance - template method
   */
  calculate(
    input: TInput,
    options: PerformanceCalculationOptions,
  ): PerformanceResult {
    return this.calculateInContext(
      input,
      this.createContext(options),
      options.includeDataPoints,
    );
  }

  /** Calculate on a given context (the hybrid strategy shares one). */
  calculateInContext(
    input: TInput,
    context: CalculationContext,
    includeDataPoints = false,
  ): PerformanceResult {
    const generationResult = this.generateDataPointsInternal(input, context);

    const metrics = this.calculateMetrics(
      generationResult.dataPoints,
      context,
      generationResult.dataQuality,
      generationResult.partial ?? false,
    );

    return {
      metrics,
      dataPoints: includeDataPoints ? generationResult.dataPoints : [],
      valueType: this.strategyType,
      ...(generationResult.actualSnapshotTimestamps && {
        actualSnapshotTimestamps: generationResult.actualSnapshotTimestamps,
      }),
    };
  }

  /**
   * Generate data points - delegates to subclass
   */
  generateDataPoints(
    input: TInput,
    options: PerformanceCalculationOptions,
  ): PerformanceDataPoint[] {
    const context = this.createContext(options);
    return this.generateDataPointsInternal(input, context).dataPoints;
  }

  /**
   * Internal data point generation - implemented by subclasses
   */
  protected abstract generateDataPointsInternal(
    input: TInput,
    context: CalculationContext,
  ): DataPointGenerationResult;

  // ═══════════════════════════════════════════════════════════════
  // Context Creation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create calculation context from options. The reference time is read
   * once (`endTimestamp ?? Date.now()`) and the range start derives from it.
   */
  createContext(options: PerformanceCalculationOptions): CalculationContext {
    const { timeRange, interval, endTimestamp, maxInterpolationGap } = options;

    const end = endTimestamp ?? Date.now();
    const start = getTimeRangeStartTimestamp(timeRange, end);
    const actualInterval = interval ?? getDefaultIntervalForRange(timeRange);
    return {
      startTimestamp: start,
      endTimestamp: end,
      timeRange,
      interval: actualInterval,
      expectedDataPoints: this.generateTimestampSeries({
        startTimestamp: start,
        endTimestamp: end,
        interval: actualInterval,
      }).length,
      maxInterpolationGap,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Metrics Calculation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Metrics from a series on the context's grid. The baseline is the value
   * at the range start (the first grid point); a series that starts later
   * has insufficient history, and its start and changes are null.
   */
  protected calculateMetrics(
    dataPoints: PerformanceDataPoint[],
    context: CalculationContext,
    dataQuality: DataQuality,
    partial = false,
  ): PerformanceMetrics {
    if (dataPoints.length === 0) {
      return this.createEmptyMetrics(context, dataQuality, partial);
    }

    const sortedPoints = [...dataPoints].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const first = sortedPoints[0];
    const insufficientHistory = first.timestamp > context.startTimestamp;
    const startValue = insufficientHistory ? null : first.value;
    const endValue = sortedPoints[sortedPoints.length - 1].value;

    let highValue = -Infinity;
    let lowValue = Infinity;
    let interpolatedCount = 0;
    for (const p of sortedPoints) {
      if (p.value > highValue) highValue = p.value;
      if (p.value < lowValue) lowValue = p.value;
      if (p.source === "interpolated") interpolatedCount++;
    }

    return {
      startValue,
      endValue,
      absoluteChange: startValue === null ? null : endValue - startValue,
      percentChange: changePercent(startValue, endValue),
      highValue,
      lowValue,
      dataQuality,
      dataPointCount: sortedPoints.length,
      interpolatedPointCount: interpolatedCount,
      insufficientHistory,
      firstPointTimestamp: first.timestamp,
      partial,
      timeRange: context.timeRange,
      startTimestamp: context.startTimestamp,
      endTimestamp: context.endTimestamp,
      calculatedAt: context.endTimestamp,
    };
  }

  /**
   * Create empty metrics when no data is available
   */
  protected createEmptyMetrics(
    context: CalculationContext,
    dataQuality: DataQuality = "low",
    partial = false,
  ): PerformanceMetrics {
    return {
      startValue: null,
      endValue: 0,
      absoluteChange: null,
      percentChange: null,
      highValue: 0,
      lowValue: 0,
      dataQuality,
      dataPointCount: 0,
      interpolatedPointCount: 0,
      insufficientHistory: true,
      firstPointTimestamp: null,
      partial,
      timeRange: context.timeRange,
      startTimestamp: context.startTimestamp,
      endTimestamp: context.endTimestamp,
      calculatedAt: context.endTimestamp,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Data Point Constructors
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create an interpolated data point
   */
  protected createInterpolatedPoint(
    timestamp: number,
    value: number,
    costBasis: number | null = null,
  ): PerformanceDataPoint {
    return {
      timestamp,
      date: new Date(timestamp).toISOString(),
      value,
      costBasis,
      source: "interpolated",
      confidence: 0.5,
    };
  }

  /**
   * Create a snapshot-based data point
   */
  protected createSnapshotPoint(
    timestamp: number,
    value: number,
    costBasis: number | null = null,
  ): PerformanceDataPoint {
    return {
      timestamp,
      date: new Date(timestamp).toISOString(),
      value,
      costBasis,
      source: "snapshot",
      confidence: 1.0,
    };
  }

  /**
   * Create a calculated data point (from price data)
   */
  protected createCalculatedPoint(
    timestamp: number,
    value: number,
    costBasis: number | null = null,
    confidence: number = 0.95,
  ): PerformanceDataPoint {
    return {
      timestamp,
      date: new Date(timestamp).toISOString(),
      value,
      costBasis,
      source: "calculated",
      confidence,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Time Series Helpers
  // ═══════════════════════════════════════════════════════════════

  /** Series lookup options for the context's grid (see series.valueAt) */
  protected lookupOptions(
    context: CalculationContext,
    interpolate = true,
  ): SeriesLookupOptions {
    return lookupOptionsForInterval(
      getTimeIntervalInMilliseconds(context.interval),
      context.maxInterpolationGap,
      interpolate,
    );
  }

  /**
   * Generate timestamp series for a context
   */
  protected generateTimestampSeries(
    context: Pick<CalculationContext, "startTimestamp" | "endTimestamp" | "interval">,
  ): number[] {
    const { startTimestamp, endTimestamp, interval } = context;
    const intervalMs = getTimeIntervalInMilliseconds(interval);
    const timestamps: number[] = [];

    let current = startTimestamp;
    while (current <= endTimestamp) {
      timestamps.push(current);
      current += intervalMs;
    }

    // Always include end timestamp if not already included
    if (timestamps[timestamps.length - 1] !== endTimestamp) {
      timestamps.push(endTimestamp);
    }

    return timestamps;
  }
}
