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
}

/**
 * Input for discrete (snapshot-based) performance calculation
 */
export interface DiscretePerformanceInput {
  /** Portfolio snapshots ordered by timestamp */
  snapshots: SnapshotData[];
  /** Optional: filter to specific category */
  categoryFilter?: string;
}

/**
 * Input for continuous (price-based) performance calculation
 */
export interface ContinuousPerformanceInput {
  /** Holdings to calculate value for */
  holdings: HoldingData[];
  /** Historical price data keyed by asset type */
  prices: PriceData;
}

/**
 * Combined input for hybrid calculation
 */
export interface HybridPerformanceInput {
  discrete?: DiscretePerformanceInput;
  continuous?: ContinuousPerformanceInput;
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

  /**
   * Generate time series data points
   */
  generateDataPoints(
    input: TInput,
    options: PerformanceCalculationOptions,
  ): PerformanceDataPoint[];

  /**
   * Assess data quality for the given input and time range
   */
  assessDataQuality(
    input: TInput,
    options: PerformanceCalculationOptions,
  ): DataQuality;
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
}

/**
 * Result of data point generation before metrics calculation
 */
export interface DataPointGenerationResult {
  dataPoints: PerformanceDataPoint[];
  actualDataPoints: number;
  interpolatedDataPoints: number;
  dataQuality: DataQuality;
}
