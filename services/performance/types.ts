/**
 * Performance Calculation Service - Core Types
 *
 * Unified types for performance calculations across all asset categories.
 * Distinguishes between discrete (snapshot-based) and continuous (price-based) values.
 */

import type { TimeRange, TimeInterval } from "../finance/financeService";
import type { SnapshotCategoryEntry } from "../portfolio/aggregate";

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
  /**
   * Cost line if known: the cost basis plus the value of holdings without
   * one, so value − costBasis is the P/L of the cost-bearing holdings
   * (services/portfolio/unrealizedProfitLoss.ts costLine)
   */
  costBasis: number | null;
  /** How this data point was derived */
  source: DataSource;
  /** Confidence in this data point (0-1) */
  confidence: number;
  /**
   * Discrete points only: the snapshot could not be split by source, so the
   * value already holds the continuously valued sources (a legacy row). The
   * hybrid strategy adds no continuous value at such a point.
   */
  includesContinuous?: boolean;
  /**
   * Discrete points only: the cost line still holds the continuously valued
   * sources' cost line (a row that does not record costs by source). The
   * hybrid strategy then takes this cost line alone instead of adding the
   * continuous part's.
   */
  costIncludesContinuous?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// External Flows
// ═══════════════════════════════════════════════════════════════

/**
 * Money moved into (> 0: a purchase, a deposit, a newly connected account)
 * or out of (< 0: sale proceeds, a disconnection) the measured holdings at
 * a time. A flow changes the value without being performance.
 */
export interface CashFlow {
  /** When the flow is in the value: exactly then, or by then (spanStart) */
  timestamp: number;
  amount: number;
  /**
   * The flow happened at an unknown time after this and up to `timestamp`
   * (a flow derived by comparing two snapshots, a purchase known only to
   * the day). Modified Dietz then weights it at the middle of that span
   * rather than at its end, where it would count as never invested.
   */
  spanStart?: number;
}

/**
 * How far a series' flows are known (D2):
 * - none: the measure is not flow-adjusted (net worth, cash, liabilities):
 *   its change is a plain change in value;
 * - estimated: some flows were assumed 0 (holdings without a cost basis);
 * - complete: every flow is derived (purchases, cost-basis changes,
 *   holdings appearing or disappearing).
 */
export type FlowCoverage = "none" | "estimated" | "complete";

// ═══════════════════════════════════════════════════════════════
// Performance Metrics
// ═══════════════════════════════════════════════════════════════

/**
 * Performance metrics calculated for a time period
 */
export interface PerformanceMetrics {
  // Core values. The start is the value at the range start; without one
  // (history starts later) it is null and so are the changes.
  startValue: number | null;
  endValue: number;
  absoluteChange: number | null;
  /** Change relative to |startValue|; null when the start is unknown or 0 */
  percentChange: number | null;

  // Flow-adjusted performance (computePeriodReturn). Null when the start is
  // unknown or the measure is not flow-adjusted (flowCoverage "none").
  /** Net external flows dated after the start, up to the end */
  netFlows: number | null;
  /** absoluteChange − netFlows: the gain that is not money moved in */
  profitLoss: number | null;
  /** profitLoss over the start value plus time-weighted flows, in % */
  modifiedDietzPercent: number | null;
  /** Time-weighted return: Modified Dietz chained between observations, in % */
  timeWeightedPercent: number | null;
  flowCoverage: FlowCoverage;

  // Range statistics
  highValue: number;
  lowValue: number;

  // Quality metadata
  dataQuality: DataQuality;
  dataPointCount: number;
  interpolatedPointCount: number;

  /**
   * No value is known at the range start: the series starts at
   * `firstPointTimestamp` instead (never carried backward to the start).
   */
  insufficientHistory: boolean;
  /** Timestamp of the first point in the series, null without points */
  firstPointTimestamp: number | null;
  /**
   * Some values are incomplete: held assets without a price series, or the
   * start or end value rests on a snapshot taken after a provider sync
   * partly failed
   */
  partial: boolean;

  // Time context
  timeRange: TimeRange;
  startTimestamp: number;
  endTimestamp: number;
  calculatedAt: number;
}

/**
 * Complete performance calculation result
 */
export interface PerformanceResult {
  metrics: PerformanceMetrics;
  dataPoints: PerformanceDataPoint[];
  valueType: ValueType | "hybrid";
  /**
   * Discrete strategy only: timestamps of the real snapshots at or before the
   * range end, ascending (including ones before the range start). Consumers
   * use this instead of inferring "real" points from `source`, e.g. to find
   * when tracking started.
   */
  actualSnapshotTimestamps?: number[];
}

// ═══════════════════════════════════════════════════════════════
// Asset Category Configuration
// ═══════════════════════════════════════════════════════════════

/**
 * How a holding's value history is known (docs/VALUATION_RESOLUTION_PLAN.md):
 * - continuous: a price feed values it at any time (vault metals);
 * - semi-continuous: periodic prices (fund NAV, NFT floor), computed like
 *   discrete;
 * - discrete: known only at syncs or manual updates (snapshots).
 */
export type ValuationMethod = "continuous" | "semi-continuous" | "discrete";

/** Where a holding's prices come from */
export type PriceProvider =
  | "market-data"
  | "crypto-exchange"
  | "metals"
  | "nft-floor"
  | "manual";

export interface ValuationConfig {
  method: ValuationMethod;
  priceProvider?: PriceProvider;
  /** Interpolation gap limit, in grid intervals (default MAX_INTERPOLATION_GAP_MULTIPLIER) */
  maxInterpolationGap?: number;
}

/** A holding source valued continuously, and the category snapshots store it under */
export interface ContinuousSource {
  source: string;
  category: string;
}

// ═══════════════════════════════════════════════════════════════
// Snapshot Data Types
// ═══════════════════════════════════════════════════════════════

/**
 * Category breakdown within a snapshot: the entry the snapshot writer
 * builds (services/portfolio/aggregate.ts buildSnapshotBreakdown), with its
 * cost, per-source values and net flow.
 */
export type SnapshotCategoryBreakdown = SnapshotCategoryEntry;

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
  /** Value of the holdings totalCostBasis covers; absent on old snapshots */
  totalCoveredValue?: number;
  categoryBreakdown?: SnapshotCategoryBreakdown[];
  source?: string;
  /** Taken after a provider sync partly failed: some values are stale */
  partial?: boolean;
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
  /**
   * Number of units. Negative for a ledger lot that sold or gave units
   * away: from its date on it reduces what is held.
   */
  quantity: number;
  /**
   * For metals: fine weight in grams. A holding with a fine weight is valued
   * from its PricePoint series as a price per troy ounce (not per gram).
   */
  fineWeightGrams?: number;
  /** For metals: sell premium as a decimal (-0.02 = 2% below spot), as stored on vault items */
  sellPremium?: number;
  /**
   * Timestamp when acquired. Unknown (undefined) means held since before
   * any range start: an item is never dated at record creation.
   */
  purchaseDate?: number;
  /** Cost per unit at purchase, in purchaseCurrency */
  purchasePricePerUnit?: number;
  /**
   * Currency of purchasePricePerUnit (vaultItems.purchaseCurrency). A price
   * in another currency than the series' is not used as the purchase flow.
   */
  purchaseCurrency?: string;
  /**
   * Cost per unit this holding adds to the cost line, when it differs from
   * the flow price: a sale lot (negative quantity, see metalsLedger
   * `ledgerHoldings`) moves money at its proceeds but removes its average
   * cost. Null: unknown cost. Undefined: purchasePricePerUnit.
   */
  costPerUnit?: number | null;
  /**
   * This holding's signed change to its item's cost pool, when it is a
   * ledger lot: known cost (in the series' currency, see metalsLedger
   * `ledgerHoldings`) plus units of unknown cost, which the cost line takes
   * at their value. Undefined on a ledger lot whose cost cannot be
   * converted: the lot is then at its value, never in another currency. Overrides costPerUnit on the cost line, so
   * a sale from a pool mixing known and unknown costs removes its share of
   * each and a sold-out item leaves no cost behind.
   */
  costLine?: { knownCost: number; unknownQuantity: number };
}

/**
 * Historical price point
 */
export interface PricePoint {
  timestamp: number;
  /**
   * Price in the base currency. For metals (holdings with fineWeightGrams)
   * this is the spot price per TROY OUNCE, as served by the price store;
   * passing a per-gram price values metals about 31x too low.
   */
  price: number;
}

/**
 * Price data for multiple assets. Metal series are priced per troy ounce
 * (see PricePoint.price).
 */
export interface PriceData {
  [assetType: string]: PricePoint[];
}
