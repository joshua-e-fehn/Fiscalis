/**
 * Performance Calculation Service - Frontend Re-export Barrel
 *
 * All performance calculation logic lives in the shared services/ package.
 * This file re-exports everything so frontend consumers can continue
 * importing from "@/lib/performance" without changes.
 *
 * @see services/performance/ for the canonical source
 */

// Re-export everything from the shared services package
export {
  // ── Core Types ──────────────────────────────────────────────
  type TimeRange,
  type TimeInterval,
  type PerformanceTimeRangeLabel,
  type ValueType,
  type DataSource,
  type DataQuality,
  type PriceProvider,
  type PerformanceDataPoint,
  type PerformanceMetrics,
  type PerformanceResult,
  type AssetCategoryConfig,
  type SnapshotCategoryBreakdown,
  type SnapshotData,
  type HoldingData,
  type PricePoint,
  type PriceData,

  // ── Mapping Constants & Functions ───────────────────────────
  TIME_RANGE_LABEL_MAP,
  TIME_RANGE_TO_LABEL,
  labelToTimeRange,
  timeRangeToLabel,

  // ── Configuration ───────────────────────────────────────────
  ASSET_CATEGORIES,
  ASSET_CATEGORY_MAP,
  getAssetCategory,
  getDiscreteCategories,
  getContinuousCategories,
  getUpgradeableCategories,
  DEFAULT_CONFIDENCE_THRESHOLD,
  MAX_INTERPOLATION_GAP_MULTIPLIER,
  DEFAULT_TIME_RANGE_OPTIONS,
  PLATFORM_LAUNCH_DATE,
  PLATFORM_LAUNCH_TIMESTAMP,

  // ── Strategy Types ──────────────────────────────────────────
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

  // ── Strategy Classes ────────────────────────────────────────
  BasePerformanceStrategy,
  DiscretePerformanceStrategy,
  calculateDiscretePerformance,
  getDiscreteStrategy,
  ContinuousPerformanceStrategy,
  calculateContinuousPerformance,
  getContinuousStrategy,
  HybridPerformanceStrategy,
  calculateHybridPerformance,
  getHybridStrategy,
  type PerformanceBreakdown,
  type HybridPerformanceResult,
} from "@/../services/performance";
