/**
 * Base Performance Strategy
 *
 * Abstract base class providing common functionality for all
 * performance calculation strategies.
 */

import {
  getTimeRangeStartTimestamp,
  getDefaultIntervalForRange,
  getTimeIntervalInMilliseconds,
  type TimeRange,
  type TimeInterval,
} from "../../finance/financeService";

import type {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceResult,
  ValueType,
  DataQuality,
} from "../types";

import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  MAX_INTERPOLATION_GAP_MULTIPLIER,
} from "../config";

import type {
  IPerformanceStrategy,
  PerformanceCalculationOptions,
  CalculationContext,
  DataPointGenerationResult,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Abstract Base Strategy
// ═══════════════════════════════════════════════════════════════

/**
 * Abstract base class for performance strategies
 *
 * Provides common utilities:
 * - Context creation from options
 * - Metrics calculation from data points
 * - Data quality assessment
 * - Interpolation helpers
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
    const context = this.createContext(options);
    const generationResult = this.generateDataPointsInternal(input, context);

    const metrics = this.calculateMetrics(
      generationResult.dataPoints,
      context,
      generationResult.dataQuality,
    );

    return {
      metrics,
      dataPoints: options.includeDataPoints ? generationResult.dataPoints : [],
      valueType:
        this.strategyType === "hybrid" ? "discrete" : this.strategyType,
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
   * Assess data quality - delegates to subclass
   */
  abstract assessDataQuality(
    input: TInput,
    options: PerformanceCalculationOptions,
  ): DataQuality;

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
   * Create calculation context from options
   */
  protected createContext(
    options: PerformanceCalculationOptions,
  ): CalculationContext {
    const { timeRange, interval, endTimestamp } = options;

    const end = endTimestamp ?? Date.now();
    const start = getTimeRangeStartTimestamp(timeRange);
    const actualInterval = interval ?? getDefaultIntervalForRange(timeRange);
    const intervalMs = getTimeIntervalInMilliseconds(actualInterval);

    // Calculate expected number of data points
    const rangeMs = end - start;
    const expectedDataPoints = Math.ceil(rangeMs / intervalMs);

    return {
      startTimestamp: start,
      endTimestamp: end,
      timeRange,
      interval: actualInterval,
      expectedDataPoints,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Metrics Calculation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate performance metrics from data points
   */
  protected calculateMetrics(
    dataPoints: PerformanceDataPoint[],
    context: CalculationContext,
    dataQuality: DataQuality,
  ): PerformanceMetrics {
    if (dataPoints.length === 0) {
      return this.createEmptyMetrics(context, dataQuality);
    }

    const sortedPoints = [...dataPoints].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const startValue = sortedPoints[0].value;
    const endValue = sortedPoints[sortedPoints.length - 1].value;
    const absoluteChange = endValue - startValue;
    const percentChange =
      startValue !== 0 ? (absoluteChange / startValue) * 100 : 0;

    const values = sortedPoints.map((p) => p.value);
    const highValue = Math.max(...values);
    const lowValue = Math.min(...values);

    const interpolatedCount = sortedPoints.filter(
      (p) => p.source === "interpolated",
    ).length;

    return {
      startValue,
      endValue,
      absoluteChange,
      percentChange,
      highValue,
      lowValue,
      dataQuality,
      dataPointCount: sortedPoints.length,
      interpolatedPointCount: interpolatedCount,
      timeRange: context.timeRange,
      startTimestamp: context.startTimestamp,
      endTimestamp: context.endTimestamp,
      calculatedAt: Date.now(),
    };
  }

  /**
   * Create empty metrics when no data is available
   */
  protected createEmptyMetrics(
    context: CalculationContext,
    dataQuality: DataQuality = "low",
  ): PerformanceMetrics {
    return {
      startValue: 0,
      endValue: 0,
      absoluteChange: 0,
      percentChange: 0,
      highValue: 0,
      lowValue: 0,
      dataQuality,
      dataPointCount: 0,
      interpolatedPointCount: 0,
      timeRange: context.timeRange,
      startTimestamp: context.startTimestamp,
      endTimestamp: context.endTimestamp,
      calculatedAt: Date.now(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Data Quality Assessment
  // ═══════════════════════════════════════════════════════════════

  /**
   * Assess data quality based on coverage and interpolation
   */
  protected assessQuality(
    actualPoints: number,
    expectedPoints: number,
    interpolatedPoints: number,
  ): DataQuality {
    if (actualPoints === 0) return "low";

    const coverage = actualPoints / expectedPoints;
    const interpolationRatio =
      actualPoints > 0 ? interpolatedPoints / actualPoints : 1;

    // High quality: > 90% coverage and < 10% interpolation
    if (
      coverage >= DEFAULT_CONFIDENCE_THRESHOLD.high &&
      interpolationRatio < 0.1
    ) {
      return "high";
    }

    // Medium quality: > 70% coverage and < 30% interpolation
    if (
      coverage >= DEFAULT_CONFIDENCE_THRESHOLD.medium &&
      interpolationRatio < 0.3
    ) {
      return "medium";
    }

    return "low";
  }

  // ═══════════════════════════════════════════════════════════════
  // Interpolation Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Linear interpolation between two values
   */
  protected interpolateValue(
    timestamp: number,
    beforePoint: { timestamp: number; value: number },
    afterPoint: { timestamp: number; value: number },
  ): number {
    const totalTime = afterPoint.timestamp - beforePoint.timestamp;
    const elapsedTime = timestamp - beforePoint.timestamp;
    const ratio = totalTime > 0 ? elapsedTime / totalTime : 0;

    return beforePoint.value + (afterPoint.value - beforePoint.value) * ratio;
  }

  /**
   * Check if interpolation gap is too large
   */
  protected isGapTooLarge(
    gapMs: number,
    intervalMs: number,
    multiplier: number = MAX_INTERPOLATION_GAP_MULTIPLIER,
  ): boolean {
    return gapMs > intervalMs * multiplier;
  }

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

  /**
   * Generate timestamp series for a context
   */
  protected generateTimestampSeries(context: CalculationContext): number[] {
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
