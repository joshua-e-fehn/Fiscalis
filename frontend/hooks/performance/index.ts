/**
 * Performance Hooks
 *
 * React hooks for unified performance calculations across all asset types.
 * Integrates with Convex for snapshots and tanstack-query for price data.
 */

// Core performance hook
export {
  usePerformance,
  usePerformanceMetrics,
  type UsePerformanceOptions,
  type UsePerformanceResult,
} from "./usePerformance";

// Discrete (snapshot-based) performance
export {
  useDiscretePerformance,
  type UseDiscretePerformanceOptions,
  type UseDiscretePerformanceResult,
} from "./useDiscretePerformance";

// Continuous (price-based) performance
export {
  useContinuousPerformance,
  type UseContinuousPerformanceOptions,
  type UseContinuousPerformanceResult,
} from "./useContinuousPerformance";

// Time range selection
export {
  useTimeRangeSelection,
  type UseTimeRangeSelectionOptions,
  type UseTimeRangeSelectionResult,
} from "./useTimeRangeSelection";

// ═══════════════════════════════════════════════════════════════
// Bridge Hooks (for backward compatibility during migration)
// ═══════════════════════════════════════════════════════════════

/**
 * Bridge hooks that provide backward-compatible interfaces to the new
 * unified performance service. Use these for gradual migration.
 *
 * @deprecated New code should use usePerformance, useDiscretePerformance,
 * or useContinuousPerformance directly.
 */

// Portfolio YTD (replaces calculateYTDPerformance from investments.ts)
export {
  usePortfolioYTD,
  useCategoryYTD,
  useNetWorthYTD,
  type PortfolioYTDResult,
  type NetWorthYTDResult,
} from "./usePortfolioYTD";

// Metals YTD (replaces useYTDPortfolioPerformance from metals.ts)
export {
  useMetalsYTD,
  useMetalsPerformance,
  type MetalsYTDResult,
} from "./useMetalsYTD";

// Portfolio chart data (combines discrete + continuous)
export {
  usePortfolioChartData,
  type PortfolioDataPoint,
  type UsePortfolioChartDataOptions,
  type UsePortfolioChartDataResult,
} from "./usePortfolioChartData";

// Category P/L (uses first snapshot as cost basis when no explicit cost basis)
export {
  useCategoryProfitLoss,
  usePortfolioProfitLoss,
  type CategoryProfitLossResult,
  type UseCategoryProfitLossOptions,
} from "./useCategoryProfitLoss";
