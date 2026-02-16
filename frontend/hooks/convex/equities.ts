/**
 * Equities Category Summary Hook
 *
 * Aggregates data from all equity subcategories (Stocks, ETFs, Funds, Options, Private Equity)
 * to provide a unified summary for the category dashboard.
 *
 * Uses real data from broker positions via the categories.getEquities query.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  Holding,
} from "@/lib/types/investments";
import {
  equitiesSubcategoryUI,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";

/**
 * Hook to get the equities category summary
 *
 * This aggregates data from:
 * - Public Stocks (via broker connections)
 * - ETFs & Index Funds (via broker connections)
 * - Mutual Funds (via broker connections)
 * - Options (via broker connections)
 * - Private Equity (manual entry)
 */
export function useEquitiesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  // Fetch real equity data from Convex
  const equitiesData = useQuery(api.categories.getEquities);

  const isLoading = equitiesData === undefined;

  // Build category summary from real data
  const summary = useMemo<CategorySummary | null>(() => {
    // Return null if not authenticated or still loading
    if (equitiesData === undefined || equitiesData === null) return null;

    const { positions, summary: dataSummary } = equitiesData;
    const bySubcategory = dataSummary.bySubcategory;

    // Helper to get top holdings for a subcategory
    const getTopHoldingsForSubcategory = (
      subcategory: string,
      limit: number = 3,
    ): Holding[] => {
      return positions
        .filter((p) => p.investmentSubcategory === subcategory)
        .sort((a, b) => {
          const aValue = a.valueInBaseCurrency ?? a.marketValue ?? 0;
          const bValue = b.valueInBaseCurrency ?? b.marketValue ?? 0;
          return bValue - aValue;
        })
        .slice(0, limit)
        .map((p) => {
          const value = p.valueInBaseCurrency ?? p.marketValue ?? 0;
          const costBasis = p.totalCostBasis ?? null;
          const profitLoss = p.unrealizedPL ?? null;
          const profitLossPercent =
            costBasis && profitLoss ? (profitLoss / costBasis) * 100 : null;

          return {
            id: p._id,
            name: p.symbol ?? p.name ?? "Unknown",
            subcategoryId: subcategory,
            value,
            costBasis,
            profitLoss,
            profitLossPercent,
            allocationPercent:
              dataSummary.totalValue > 0
                ? (value / dataSummary.totalValue) * 100
                : 0,
          };
        });
    };

    // Helper to calculate subcategory cost basis
    const getSubcategoryCostBasis = (subcategory: string): number | null => {
      const filtered = positions.filter(
        (p) => p.investmentSubcategory === subcategory,
      );
      if (filtered.length === 0) return null;
      const total = filtered.reduce(
        (sum, p) => sum + (p.totalCostBasis ?? 0),
        0,
      );
      return total > 0 ? total : null;
    };

    // Helper to calculate subcategory P/L
    const getSubcategoryPL = (subcategory: string): number | null => {
      const filtered = positions.filter(
        (p) => p.investmentSubcategory === subcategory,
      );
      if (filtered.length === 0) return null;
      const total = filtered.reduce((sum, p) => sum + (p.unrealizedPL ?? 0), 0);
      return total;
    };

    // Build subcategories array with real data
    const subcategories: SubcategoryData[] = [];

    // Iterate over all equities subcategories from centralized config
    for (const [slug, meta] of Object.entries(equitiesSubcategoryUI)) {
      const data = bySubcategory[slug] ?? { count: 0, total: 0 };
      const costBasis = getSubcategoryCostBasis(slug);
      const pl = getSubcategoryPL(slug);
      subcategories.push({
        ...makeSubcategoryBase(slug, meta),
        totalValue: data.total,
        costBasis,
        profitLoss: pl,
        profitLossPercent: costBasis && pl ? (pl / costBasis) * 100 : null,
        topHoldings: getTopHoldingsForSubcategory(slug),
        holdingsCount: data.count,
        implemented: data.count > 0 || meta.implemented,
      });
    }

    // Calculate totals
    const totalValue = dataSummary.totalValue;
    const totalCost =
      dataSummary.totalCostBasis > 0 ? dataSummary.totalCostBasis : null;
    const profitLoss =
      dataSummary.totalUnrealizedPL !== 0
        ? dataSummary.totalUnrealizedPL
        : null;
    const profitLossPercent =
      totalCost && profitLoss ? (profitLoss / totalCost) * 100 : null;

    // TODO: Implement historical data points for chart
    const historyDataPoints: PortfolioDataPoint[] = [];

    return {
      totalValue,
      totalCost,
      profitLoss,
      profitLossPercent,
      ytdProfitLoss: null, // TODO: Calculate from historical data
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
      historyDataPoints,
    };
  }, [equitiesData]);

  return {
    summary,
    isLoading,
  };
}
