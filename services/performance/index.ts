/**
 * Performance Calculation Service
 *
 * Shared performance calculation library for use across frontend, backend,
 * and other applications. Framework-agnostic — no React, no Convex dependencies.
 *
 * Architecture:
 * - types.ts: Core type definitions (TimeRange, DataPoint, Metrics, etc.)
 * - config.ts: Valuation resolution (category → subcategory → asset) and price feeds
 * - strategies/base.ts also holds the sorted-series lookup, data quality and percent change
 * - strategies/: Strategy pattern implementations
 *   - base.ts: Abstract base class with shared utilities
 *   - discrete.ts: Snapshot-based calculation (bank accounts, equities, etc.)
 *   - continuous.ts: Price-based calculation (precious metals)
 *   - hybrid.ts: Combined discrete + continuous for full portfolio
 */

// ═══════════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════════

export {
  // Re-exported from financeService
  type TimeRange,
  type TimeInterval,

  // Time range mapping
  type PerformanceTimeRangeLabel,
  TIME_RANGE_LABEL_MAP,
  TIME_RANGE_TO_LABEL,
  labelToTimeRange,
  timeRangeToLabel,

  // Value type classification
  type ValueType,
  type DataSource,
  type DataQuality,

  // Data points
  type PerformanceDataPoint,

  // Metrics
  type PerformanceMetrics,
  type PerformanceResult,

  // Valuation config
  type ValuationMethod,
  type ValuationConfig,
  type PriceProvider,
  type ContinuousSource,

  // Snapshot types
  type SnapshotCategoryBreakdown,
  type SnapshotData,

  // Holding types
  type HoldingData,
  type PricePoint,
  type PriceData,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

export {
  CATEGORY_VALUATION_DEFAULTS,
  SUBCATEGORY_VALUATION_OVERRIDES,
  resolveValuationConfig,
  PRICE_FEEDS,
  getValueTypeForConfig,
  continuousSourcesFor,
} from "./config";

export {
  type SeriesPoint,
  type LookupKind,
  type LookupResult,
  type SeriesLookupOptions,
  sortByTimestamp,
  lastIndexAtOrBefore,
  valueAt,
  lookupOptionsForInterval,
  assessDataQuality,
  changePercent,
  withLiveEnd,
  DEFAULT_CONFIDENCE_THRESHOLD,
  MAX_INTERPOLATION_GAP_MULTIPLIER,
} from "./strategies/base";

// ═══════════════════════════════════════════════════════════════
// Strategies
// ═══════════════════════════════════════════════════════════════

export {
  // Strategy types and interfaces
  type PerformanceCalculationOptions,
  type DiscretePerformanceInput,
  type ContinuousPerformanceInput,
  type HybridPerformanceInput,
  type IPerformanceStrategy,
  type IDiscretePerformanceStrategy,
  type IContinuousPerformanceStrategy,
  type IHybridPerformanceStrategy,
  type CalculationContext,
  type DataPointGenerationResult,

  // Base class
  BasePerformanceStrategy,

  // Discrete strategy
  DiscretePerformanceStrategy,
  calculateDiscretePerformance,
  getDiscreteStrategy,

  // Continuous strategy
  ContinuousPerformanceStrategy,
  calculateContinuousPerformance,
  getContinuousStrategy,

  // Hybrid strategy
  HybridPerformanceStrategy,
  calculateHybridPerformance,
  getHybridStrategy,
  type PerformanceBreakdown,
  type HybridPerformanceResult,
} from "./strategies";

export type { SnapshotMetric, PerformanceMeasure, LiveEnd } from "./strategies/types";
export { snapshotMetricValue, netWorthCostLine } from "./strategies/discrete";
export { type ChartPoint, toChartPoints } from "./chartSeries";
