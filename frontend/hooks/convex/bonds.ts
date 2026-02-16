/**
 * Bonds Category Summary Hook
 *
 * Aggregates data from all bond subcategories (Government, Corporate, Municipal, etc.)
 * to provide a unified summary for the category dashboard.
 *
 * Uses real data from broker positions via the categories.getBonds query.
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
  bondsSubcategoryUI,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";

/**
 * Hook to get the bonds category summary
 *
 * This aggregates data from:
 * - Government Bonds (via broker connections)
 * - Corporate Bonds (via broker connections)
 * - Municipal Bonds (via broker connections)
 * - Savings Bonds (manual entry)
 * - Bond Funds & ETFs (via broker connections)
 */
export function useBondsSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  // Fetch real bond data from Convex
  const bondsData = useQuery(api.categories.getBonds);

  const isLoading = bondsData === undefined;

  // Build category summary from real data
  const summary = useMemo<CategorySummary | null>(() => {
    // Return null if not authenticated or still loading
    if (bondsData === undefined || bondsData === null) return null;

    const { positions, summary: dataSummary } = bondsData;
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

    // Iterate over all bond subcategories from centralized config
    for (const [slug, meta] of Object.entries(bondsSubcategoryUI)) {
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
    const totalCostBasis = positions.reduce(
      (sum, p) => sum + (p.totalCostBasis ?? 0),
      0,
    );
    const totalCost = totalCostBasis > 0 ? totalCostBasis : null;
    const totalPL = positions.reduce(
      (sum, p) => sum + (p.unrealizedPL ?? 0),
      0,
    );
    const profitLoss = totalPL !== 0 ? totalPL : null;
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
  }, [bondsData]);

  return {
    summary,
    isLoading,
  };
}
