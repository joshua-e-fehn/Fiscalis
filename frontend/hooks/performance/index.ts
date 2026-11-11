/**
 * Performance Hooks
 *
 * React hooks for performance calculations across asset types.
 * Integrates with Convex for snapshots and tanstack-query for price data.
 */

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

// Net worth and category YTD (snapshot-based)
export {
  useCategoryYTD,
  useNetWorthYTD,
  type PortfolioYTDResult,
  type NetWorthYTDResult,
} from "./usePortfolioYTD";

// Metals YTD (price-based)
export { useMetalsYTD, type MetalsYTDResult } from "./useMetalsYTD";

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
  type CategoryProfitLossResult,
  type UseCategoryProfitLossOptions,
} from "./useCategoryProfitLoss";
