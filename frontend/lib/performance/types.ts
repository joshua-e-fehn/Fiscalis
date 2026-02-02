/**
 * Performance Calculation Service - Core Types
 *
 * Unified types for performance calculations across all asset categories.
 * Distinguishes between discrete (snapshot-based) and continuous (price-based) values.
 */

import type {
  TimeRange,
  TimeInterval,
} from "@/../services/finance/financeService";

// Re-export for convenience
export type { TimeRange, TimeInterval };

// ═══════════════════════════════════════════════════════════════
// Time Range Mapping
// ═══════════════════════════════════════════════════════════════

/**
 * UI-friendly time range labels
 * Maps short labels (1W, 1M) to service TimeRange values
 */
export type PerformanceTimeRangeLabel =
  | "1H"
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "6M"
  | "YTD"
  | "1Y"
  | "3Y"
  | "5Y"
  | "ALL";

/**
 * Mapping from UI labels to TimeRange
 */
export const TIME_RANGE_LABEL_MAP: Record<
  PerformanceTimeRangeLabel,
  TimeRange
> = {
  "1H": "Hour",
  "1D": "Day",
  "1W": "Week",
  "1M": "Month",
  "3M": "3Month",
  "6M": "6Month",
  YTD: "YTD",
  "1Y": "Year",
  "3Y": "3Year",
  "5Y": "5Year",
  ALL: "ALL",
};

/**
 * Reverse mapping from TimeRange to UI labels
 */
export const TIME_RANGE_TO_LABEL: Record<TimeRange, PerformanceTimeRangeLabel> =
  {
    Hour: "1H",
    Day: "1D",
    Week: "1W",
    Month: "1M",
    "3Month": "3M",
    "6Month": "6M",
    Year: "1Y",
    "3Year": "3Y",
    "5Year": "5Y",
    YTD: "YTD",
    ALL: "ALL",
  };

/**
 * Convert UI label to TimeRange
 */
export function labelToTimeRange(label: PerformanceTimeRangeLabel): TimeRange {
  return TIME_RANGE_LABEL_MAP[label];
}

/**
 * Convert TimeRange to UI label
 */
export function timeRangeToLabel(range: TimeRange): PerformanceTimeRangeLabel {
  return TIME_RANGE_TO_LABEL[range];
}

// ═══════════════════════════════════════════════════════════════
// Value Type Classification
// ═══════════════════════════════════════════════════════════════

/**
 * Classification of how asset values are determined
 *
 * - discrete: Values only known at sync time (bank accounts, broker positions)
 * - continuous: Values can be calculated at any time using price history (precious metals)
 */
export type ValueType = "discrete" | "continuous";

/**
 * Data source reliability indicator
 */
export type DataSource = "snapshot" | "calculated" | "interpolated";

/**
 * Quality indicator for performance data
 *
 * - high: All data points are from actual snapshots/prices
 * - medium: Some interpolation, but good coverage
 * - low: Significant interpolation or sparse data
 */
export type DataQuality = "high" | "medium" | "low";

// ═══════════════════════════════════════════════════════════════
// Data Point Types
// ═══════════════════════════════════════════════════════════════

/**
 * A single point in a performance time series
 */
export interface PerformanceDataPoint {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** ISO date string for display */
  date: string;
  /** Total value at this point */
  value: number;
  /** Cost basis if known */
  costBasis: number | null;
  /** How this data point was derived */
  source: DataSource;
  /** Confidence in this data point (0-1) */
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════
// Performance Metrics
// ═══════════════════════════════════════════════════════════════

/**
 * Performance metrics calculated for a time period
 */
export interface PerformanceMetrics {
  // Core values
  startValue: number;
  endValue: number;
  absoluteChange: number;
  percentChange: number;

  // Range statistics
  highValue: number;
  lowValue: number;

  // Quality metadata
  dataQuality: DataQuality;
  dataPointCount: number;
  interpolatedPointCount: number;

  // Time context
  timeRange: TimeRange;
  startTimestamp: number;
  endTimestamp: number;
  calculatedAt: number;

  // Optional advanced metrics (future enhancement)
  annualizedReturn?: number;
  volatility?: number;
}

/**
 * Complete performance calculation result
 */
export interface PerformanceResult {
  metrics: PerformanceMetrics;
  dataPoints: PerformanceDataPoint[];
  valueType: ValueType;
}

// ═══════════════════════════════════════════════════════════════
// Asset Category Configuration
// ═══════════════════════════════════════════════════════════════

/**
 * Price provider identifiers
 * - metals: Precious metals price API (minutely data)
 * - crypto: Crypto price API (future)
 * - stocks: Stock price API (future)
 */
export type PriceProvider = "metals" | "crypto" | "stocks";

/**
 * Configuration for an asset category
 */
export interface AssetCategoryConfig {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** How values are calculated */
  valueType: ValueType;
  /** For discrete: field in snapshot categoryBreakdown */
  snapshotCategory?: string;
  /** For continuous: which price provider to use */
  priceProvider?: PriceProvider;
  /** Whether this category can be upgraded to continuous in the future */
  canUpgradeToContinuous: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Snapshot Data Types
// ═══════════════════════════════════════════════════════════════

/**
 * Category breakdown within a snapshot
 */
export interface SnapshotCategoryBreakdown {
  category: string;
  value: number;
  costBasis?: number;
}

/**
 * Portfolio snapshot data (from Convex portfolioSnapshots table)
 */
export interface SnapshotData {
  timestamp: number;
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalCostBasis?: number;
  categoryBreakdown?: SnapshotCategoryBreakdown[];
  source?: string;
}

// ═══════════════════════════════════════════════════════════════
// Holding Data Types (for continuous calculation)
// ═══════════════════════════════════════════════════════════════

/**
 * Holding data representing an owned item (for continuous calculation)
 */
export interface HoldingData {
  id: string;
  /** Asset type identifier (e.g., "gold", "silver") */
  assetType: string;
  /** Number of units */
  quantity: number;
  /** For metals: fine weight in grams */
  fineWeightGrams?: number;
  /** For metals: sell premium percentage */
  sellPremium?: number;
  /** Timestamp when acquired */
  purchaseDate: number;
  /** Cost per unit at purchase */
  purchasePricePerUnit?: number;
}

/**
 * Historical price point
 */
export interface PricePoint {
  timestamp: number;
  price: number;
}

/**
 * Price data for multiple assets
 */
export interface PriceData {
  [assetType: string]: PricePoint[];
}
