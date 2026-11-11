/**
 * Performance Strategy Types
 *
 * Defines the strategy interface and supporting types for
 * discrete and continuous performance calculation strategies.
 */

import type {
  TimeRange,
  TimeInterval,
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceResult,
  ValueType,
  DataQuality,
  SnapshotData,
  HoldingData,
  PriceData,
  PricePoint,
  ContinuousSource,
} from "../types";

// ═══════════════════════════════════════════════════════════════
// Strategy Input Types
// ═══════════════════════════════════════════════════════════════

/**
 * Common options for all performance calculations
 */
export interface PerformanceCalculationOptions {
  /** Time range to calculate */
  timeRange: TimeRange;
  /** Override the default interval for data points */
  interval?: TimeInterval;
  /** Override the end timestamp (defaults to now) */
  endTimestamp?: number;
  /** Include detailed data points in result */
  includeDataPoints?: boolean;
  /** Interpolation gap limit in grid intervals (ValuationConfig.maxInterpolationGap) */
  maxInterpolationGap?: number;
}

/**
 * The figure a snapshot series measures. Every caller names it, so a chart
 * and a card on the same page cannot silently measure different things.
 */
export type SnapshotMetric =
  | { kind: "netWorth" }
  | { kind: "totalAssets" }
  | { kind: "category"; category: string };

/**
 * Input for discrete (snapshot-based) performance calculation
 */
export interface DiscretePerformanceInput {
  /** Portfolio snapshots (any order) */
  snapshots: SnapshotData[];
  metric: SnapshotMetric;
  /**
   * Holding sources left out of the values because another strategy values
   * them (set by the hybrid strategy). A snapshot entry without per-source
   * values counts wholly to the source stored under its category.
   */
  excludeSources?: ContinuousSource[];
}

/**
 * Input for continuous (price-based) performance calculation
 */
export interface ContinuousPerformanceInput {
  /** Holdings to calculate value for */
  holdings: HoldingData[];
  /** Historical price data keyed by asset type (fetch from a few days before the range start) */
  prices: PriceData;
  /**
   * Live spot per asset type. The point at the range end is valued at it
   * with valueVaultItem, the function behind the Total Value cards.
   */
  livePrices?: Partial<Record<string, PricePoint>>;
}

/**
 * Combined input for hybrid calculation: snapshots for everything except
 * `continuousSources`, which the continuous input values.
 */
export interface HybridPerformanceInput {
  discrete?: DiscretePerformanceInput;
  continuous?: ContinuousPerformanceInput;
  continuousSources: ContinuousSource[];
}

// ═══════════════════════════════════════════════════════════════
// Strategy Interface
// ═══════════════════════════════════════════════════════════════

/**
 * Core interface for performance calculation strategies
 *
 * Implementations:
 * - DiscretePerformanceStrategy: Uses portfolio snapshots
 * - ContinuousPerformanceStrategy: Uses real-time price data
 * - HybridPerformanceStrategy: Combines discrete + continuous
 */
export interface IPerformanceStrategy<TInput> {
  /** Strategy identifier */
  readonly strategyType: ValueType | "hybrid";

  /**
   * Calculate performance metrics for a time range
   */
  calculate(
    input: TInput,
    options: PerformanceCalculationOptions,
  ): PerformanceResult;

  /** Calculate on a given context, so combined strategies share one grid */
  calculateInContext(
    input: TInput,
    context: CalculationContext,
    includeDataPoints?: boolean,
  ): PerformanceResult;

  /**
   * Generate time series data points
   */
  generateDataPoints(
    input: TInput,
    options: PerformanceCalculationOptions,
  ): PerformanceDataPoint[];
}

// ═══════════════════════════════════════════════════════════════
// Typed Strategy Interfaces
// ═══════════════════════════════════════════════════════════════

/**
 * Strategy for discrete (snapshot-based) assets
 */
export type IDiscretePerformanceStrategy =
  IPerformanceStrategy<DiscretePerformanceInput>;

/**
 * Strategy for continuous (price-based) assets
 */
export type IContinuousPerformanceStrategy =
  IPerformanceStrategy<ContinuousPerformanceInput>;

/**
 * Strategy for hybrid calculation
 */
export type IHybridPerformanceStrategy =
  IPerformanceStrategy<HybridPerformanceInput>;

// ═══════════════════════════════════════════════════════════════
// Calculation Context
// ═══════════════════════════════════════════════════════════════

/**
 * Context passed to calculation helpers
 */
export interface CalculationContext {
  /** Start timestamp for the range */
  startTimestamp: number;
  /** End timestamp for the range */
  endTimestamp: number;
  /** Time range being calculated */
  timeRange: TimeRange;
  /** Interval between data points */
  interval: TimeInterval;
  /** Expected number of data points */
  expectedDataPoints: number;
  /** Interpolation gap limit in grid intervals */
  maxInterpolationGap?: number;
}

/**
 * Result of data point generation before metrics calculation
 */
export interface DataPointGenerationResult {
  dataPoints: PerformanceDataPoint[];
  /** Grid points backed by a real observation */
  actualDataPoints: number;
  interpolatedDataPoints: number;
  dataQuality: DataQuality;
  /** Some held assets had no price series (continuous) */
  partial?: boolean;
  /**
   * Timestamps of the real snapshots (not grid points) the series was built
   * from, ascending. Discrete strategy only.
   */
  actualSnapshotTimestamps?: number[];
}
