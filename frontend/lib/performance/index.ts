/**
 * Performance Calculation Service
 *
 * Unified performance calculation for all asset types.
 * Exports types, configuration, and calculation utilities.
 */

// Types
export {
  // Time range types
  type TimeRange,
  type TimeInterval,
  type PerformanceTimeRangeLabel,

  // Value classification
  type ValueType,
  type DataSource,
  type DataQuality,
  type PriceProvider,

  // Data structures
  type PerformanceDataPoint,
  type PerformanceMetrics,
  type PerformanceResult,

  // Configuration
  type AssetCategoryConfig,

  // Snapshot types
  type SnapshotCategoryBreakdown,
  type SnapshotData,

  // Holding types
  type HoldingData,
  type PricePoint,
  type PriceData,

  // Mapping constants
  TIME_RANGE_LABEL_MAP,
  TIME_RANGE_TO_LABEL,

  // Conversion functions
  labelToTimeRange,
  timeRangeToLabel,
} from "./types";

// Configuration
export {
  // Asset categories
  ASSET_CATEGORIES,
  ASSET_CATEGORY_MAP,

  // Category helpers
  getAssetCategory,
  getDiscreteCategories,
  getContinuousCategories,
  getUpgradeableCategories,

  // Defaults
  DEFAULT_CONFIDENCE_THRESHOLD,
  MAX_INTERPOLATION_GAP_MULTIPLIER,
  DEFAULT_TIME_RANGE_OPTIONS,
  PLATFORM_LAUNCH_DATE,
  PLATFORM_LAUNCH_TIMESTAMP,
} from "./config";

// Strategy pattern
export {
  // Input types
  type PerformanceCalculationOptions,
  type DiscretePerformanceInput,
  type ContinuousPerformanceInput,
  type HybridPerformanceInput,

  // Strategy interfaces
  type IPerformanceStrategy,
  type IDiscretePerformanceStrategy,
  type IContinuousPerformanceStrategy,
  type IHybridPerformanceStrategy,

  // Context types
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
