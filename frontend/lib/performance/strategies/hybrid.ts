/**
 * Hybrid Performance Strategy
 *
 * Combines discrete (snapshot-based) and continuous (price-based) strategies
 * to calculate unified portfolio performance across all asset types.
 *
 * Aggregates:
 * - Discrete assets: cash, equities, bonds, crypto, real estate, etc.
 * - Continuous assets: precious metals (commodities)
 *
 * The hybrid result merges data points at matching timestamps and provides
 * a unified view of total portfolio performance.
 */

import type {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceResult,
  DataQuality,
  ValueType,
} from "../types";

import { BasePerformanceStrategy } from "./base";
import { DiscretePerformanceStrategy, getDiscreteStrategy } from "./discrete";
import {
  ContinuousPerformanceStrategy,
  getContinuousStrategy,
} from "./continuous";
import type {
  HybridPerformanceInput,
  DiscretePerformanceInput,
  ContinuousPerformanceInput,
  PerformanceCalculationOptions,
  CalculationContext,
  DataPointGenerationResult,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/**
 * Breakdown of performance by value type
 */
export interface PerformanceBreakdown {
  discrete?: PerformanceResult;
  continuous?: PerformanceResult;
}

/**
 * Extended hybrid result with breakdown
 */
export interface HybridPerformanceResult extends PerformanceResult {
  breakdown: PerformanceBreakdown;
}

// ═══════════════════════════════════════════════════════════════
// Hybrid Performance Strategy
// ═══════════════════════════════════════════════════════════════

/**
 * Hybrid Performance Strategy
 *
 * Combines discrete and continuous strategies to provide unified
 * portfolio performance metrics. Handles:
 *
 * 1. Discrete-only portfolios (no metals)
 * 2. Continuous-only portfolios (metals only)
 * 3. Mixed portfolios (most common)
 *
 * Data points are merged by timestamp, with values summed.
 */
export class HybridPerformanceStrategy extends BasePerformanceStrategy<HybridPerformanceInput> {
  readonly strategyType = "hybrid" as const;

  private discreteStrategy: DiscretePerformanceStrategy;
  private continuousStrategy: ContinuousPerformanceStrategy;

  constructor(
    discreteStrategy?: DiscretePerformanceStrategy,
    continuousStrategy?: ContinuousPerformanceStrategy,
  ) {
    super();
    this.discreteStrategy = discreteStrategy ?? getDiscreteStrategy();
    this.continuousStrategy = continuousStrategy ?? getContinuousStrategy();
  }

  // ═══════════════════════════════════════════════════════════════
  // Public Interface
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate hybrid performance with breakdown
   */
  calculate(
    input: HybridPerformanceInput,
    options: PerformanceCalculationOptions,
  ): HybridPerformanceResult {
    const context = this.createContext(options);

    // Calculate discrete and continuous separately
    const discreteResult = this.calculateDiscreteIfPresent(
      input.discrete,
      options,
    );
    const continuousResult = this.calculateContinuousIfPresent(
      input.continuous,
      options,
    );

    // Merge results
    const mergedDataPoints = this.mergeDataPoints(
      discreteResult?.dataPoints ?? [],
      continuousResult?.dataPoints ?? [],
      context,
    );

    // Calculate combined metrics
    const combinedMetrics = this.calculateCombinedMetrics(
      discreteResult?.metrics,
      continuousResult?.metrics,
      mergedDataPoints,
      context,
    );

    return {
      metrics: combinedMetrics,
      dataPoints: options.includeDataPoints ? mergedDataPoints : [],
      valueType: this.determineValueType(discreteResult, continuousResult),
      breakdown: {
        discrete: discreteResult ?? undefined,
        continuous: continuousResult ?? undefined,
      },
    };
  }

  /**
   * Assess overall data quality
   */
  assessDataQuality(
    input: HybridPerformanceInput,
    options: PerformanceCalculationOptions,
  ): DataQuality {
    const discreteQuality = input.discrete
      ? this.discreteStrategy.assessDataQuality(input.discrete, options)
      : null;

    const continuousQuality = input.continuous
      ? this.continuousStrategy.assessDataQuality(input.continuous, options)
      : null;

    // If both exist, use the lower quality
    if (discreteQuality && continuousQuality) {
      return this.combineQuality(discreteQuality, continuousQuality);
    }

    // Return whichever exists, or low if neither
    return discreteQuality ?? continuousQuality ?? "low";
  }

  // ═══════════════════════════════════════════════════════════════
  // Protected Implementation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate merged data points
   */
  protected generateDataPointsInternal(
    input: HybridPerformanceInput,
    context: CalculationContext,
  ): DataPointGenerationResult {
    const options: PerformanceCalculationOptions = {
      timeRange: context.timeRange,
      interval: context.interval,
      endTimestamp: context.endTimestamp,
      includeDataPoints: true,
    };

    const discreteResult = this.calculateDiscreteIfPresent(
      input.discrete,
      options,
    );
    const continuousResult = this.calculateContinuousIfPresent(
      input.continuous,
      options,
    );

    const mergedPoints = this.mergeDataPoints(
      discreteResult?.dataPoints ?? [],
      continuousResult?.dataPoints ?? [],
      context,
    );

    const interpolatedCount = mergedPoints.filter(
      (p) => p.source === "interpolated",
    ).length;

    const quality = this.assessQuality(
      mergedPoints.length,
      context.expectedDataPoints,
      interpolatedCount,
    );

    return {
      dataPoints: mergedPoints,
      actualDataPoints: mergedPoints.length - interpolatedCount,
      interpolatedDataPoints: interpolatedCount,
      dataQuality: quality,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate discrete performance if input is present
   */
  private calculateDiscreteIfPresent(
    input: DiscretePerformanceInput | undefined,
    options: PerformanceCalculationOptions,
  ): PerformanceResult | null {
    if (!input || !input.snapshots || input.snapshots.length === 0) {
      return null;
    }

    return this.discreteStrategy.calculate(input, {
      ...options,
      includeDataPoints: true,
    });
  }

  /**
   * Calculate continuous performance if input is present
   */
  private calculateContinuousIfPresent(
    input: ContinuousPerformanceInput | undefined,
    options: PerformanceCalculationOptions,
  ): PerformanceResult | null {
    if (!input || !input.holdings || input.holdings.length === 0) {
      return null;
    }

    // Check if there's any price data
    const hasPrices = Object.values(input.prices).some(
      (prices) => prices && prices.length > 0,
    );
    if (!hasPrices) {
      return null;
    }

    return this.continuousStrategy.calculate(input, {
      ...options,
      includeDataPoints: true,
    });
  }

  /**
   * Merge data points from discrete and continuous results
   * Points at the same timestamp are combined (values summed)
   */
  private mergeDataPoints(
    discretePoints: PerformanceDataPoint[],
    continuousPoints: PerformanceDataPoint[],
    context: CalculationContext,
  ): PerformanceDataPoint[] {
    // If only one has points, return that
    if (discretePoints.length === 0) return continuousPoints;
    if (continuousPoints.length === 0) return discretePoints;

    // Build a map of timestamp -> points
    const pointMap = new Map<number, PerformanceDataPoint[]>();

    for (const point of discretePoints) {
      const existing = pointMap.get(point.timestamp) ?? [];
      existing.push(point);
      pointMap.set(point.timestamp, existing);
    }

    for (const point of continuousPoints) {
      const existing = pointMap.get(point.timestamp) ?? [];
      existing.push(point);
      pointMap.set(point.timestamp, existing);
    }

    // Merge points at each timestamp
    const mergedPoints: PerformanceDataPoint[] = [];

    for (const [timestamp, points] of pointMap) {
      const merged = this.mergePointsAtTimestamp(timestamp, points);
      mergedPoints.push(merged);
    }

    // Sort by timestamp
    mergedPoints.sort((a, b) => a.timestamp - b.timestamp);

    return mergedPoints;
  }

  /**
   * Merge multiple points at the same timestamp
   */
  private mergePointsAtTimestamp(
    timestamp: number,
    points: PerformanceDataPoint[],
  ): PerformanceDataPoint {
    if (points.length === 1) return points[0];

    // Sum values and cost basis
    let totalValue = 0;
    let totalCostBasis: number | null = null;
    let hasAnyInterpolation = false;
    let lowestConfidence = 1;

    for (const point of points) {
      totalValue += point.value;

      if (point.costBasis !== null) {
        totalCostBasis = (totalCostBasis ?? 0) + point.costBasis;
      }

      if (point.source === "interpolated") {
        hasAnyInterpolation = true;
      }

      lowestConfidence = Math.min(lowestConfidence, point.confidence);
    }

    // Determine combined source
    const sources = points.map((p) => p.source);
    let combinedSource: "snapshot" | "calculated" | "interpolated";
    if (hasAnyInterpolation) {
      combinedSource = "interpolated";
    } else if (sources.includes("calculated")) {
      combinedSource = "calculated";
    } else {
      combinedSource = "snapshot";
    }

    return {
      timestamp,
      date: new Date(timestamp).toISOString(),
      value: totalValue,
      costBasis: totalCostBasis,
      source: combinedSource,
      confidence: lowestConfidence,
    };
  }

  /**
   * Calculate combined metrics from individual results
   */
  private calculateCombinedMetrics(
    discreteMetrics: PerformanceMetrics | undefined,
    continuousMetrics: PerformanceMetrics | undefined,
    mergedPoints: PerformanceDataPoint[],
    context: CalculationContext,
  ): PerformanceMetrics {
    // If we have merged points, calculate from those
    if (mergedPoints.length > 0) {
      const interpolatedCount = mergedPoints.filter(
        (p) => p.source === "interpolated",
      ).length;

      const quality = this.assessQuality(
        mergedPoints.length,
        context.expectedDataPoints,
        interpolatedCount,
      );

      return this.calculateMetrics(mergedPoints, context, quality);
    }

    // Fallback: combine metrics directly
    const hasDiscrete = !!discreteMetrics;
    const hasContinuous = !!continuousMetrics;

    if (!hasDiscrete && !hasContinuous) {
      return this.createEmptyMetrics(context, "low");
    }

    if (hasDiscrete && !hasContinuous) {
      return discreteMetrics!;
    }

    if (!hasDiscrete && hasContinuous) {
      return continuousMetrics!;
    }

    // Both exist - combine them
    const d = discreteMetrics!;
    const c = continuousMetrics!;

    const startValue = d.startValue + c.startValue;
    const endValue = d.endValue + c.endValue;
    const absoluteChange = endValue - startValue;
    const percentChange =
      startValue !== 0 ? (absoluteChange / startValue) * 100 : 0;

    return {
      startValue,
      endValue,
      absoluteChange,
      percentChange,
      highValue: d.highValue + c.highValue,
      lowValue: d.lowValue + c.lowValue,
      dataQuality: this.combineQuality(d.dataQuality, c.dataQuality),
      dataPointCount: Math.max(d.dataPointCount, c.dataPointCount),
      interpolatedPointCount:
        d.interpolatedPointCount + c.interpolatedPointCount,
      timeRange: context.timeRange,
      startTimestamp: context.startTimestamp,
      endTimestamp: context.endTimestamp,
      calculatedAt: Date.now(),
    };
  }

  /**
   * Determine the effective value type of the result
   */
  private determineValueType(
    discrete: PerformanceResult | null,
    continuous: PerformanceResult | null,
  ): ValueType {
    if (discrete && continuous) {
      return "discrete"; // Hybrid treated as discrete for simplicity
    }
    if (continuous) {
      return "continuous";
    }
    return "discrete";
  }

  /**
   * Combine two quality ratings (returns the lower one)
   */
  private combineQuality(q1: DataQuality, q2: DataQuality): DataQuality {
    const qualityOrder: DataQuality[] = ["low", "medium", "high"];
    const i1 = qualityOrder.indexOf(q1);
    const i2 = qualityOrder.indexOf(q2);
    return qualityOrder[Math.min(i1, i2)];
  }
}

// ═══════════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate hybrid performance with default options
 */
export function calculateHybridPerformance(
  input: HybridPerformanceInput,
  options: PerformanceCalculationOptions,
): HybridPerformanceResult {
  const strategy = new HybridPerformanceStrategy();
  return strategy.calculate(input, options);
}

/**
 * Singleton instance for reuse
 */
let hybridStrategyInstance: HybridPerformanceStrategy | null = null;

/**
 * Get shared strategy instance
 */
export function getHybridStrategy(): HybridPerformanceStrategy {
  if (!hybridStrategyInstance) {
    hybridStrategyInstance = new HybridPerformanceStrategy();
  }
  return hybridStrategyInstance;
}
