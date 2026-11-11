/**
 * Performance Hooks
 *
 * One entry point (useCategoryPerformance) over one snapshot reader
 * (useSnapshots) and the vault's price input; the rest adapt its output.
 */

export {
  useSnapshots,
  useCategoryPerformance,
  toPeriodChange,
  type UseSnapshotsResult,
  type CategoryPerformanceResult,
  type PeriodChange,
  type UseCategoryPerformanceOptions,
} from "./useCategoryPerformance";

export {
  useVaultPerformanceInput,
  type UseVaultPerformanceInputOptions,
  type VaultPerformanceInput,
} from "./useContinuousPerformance";

// YTD card adapters (net worth, one category)
export {
  useCategoryYTD,
  useNetWorthYTD,
  type PortfolioYTDResult,
  type NetWorthYTDResult,
} from "./usePortfolioYTD";

// Vault-only YTD for the metals pages
export { useMetalsYTD, type MetalsYTDResult } from "./useMetalsYTD";

// Portfolio chart data (adapts the engine's series)
export {
  usePortfolioChartData,
  type PortfolioChartPoint,
  type UsePortfolioChartDataOptions,
  type UsePortfolioChartDataResult,
} from "./usePortfolioChartData";

// Category P/L (uses first snapshot as cost basis when no explicit cost basis)
export {
  useCategoryProfitLoss,
  type CategoryProfitLossResult,
  type UseCategoryProfitLossOptions,
} from "./useCategoryProfitLoss";
