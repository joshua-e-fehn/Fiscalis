/**
 * Real Estate Category Summary Hook
 *
 * Aggregates data from all real estate subcategories
 * to provide a unified summary for the category dashboard.
 *
 * REITs are populated from broker positions via api.categories.getRealEstate.
 * Physical properties (residential, commercial, land) are manual entry.
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
  realEstateSubcategoryUI,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";

/**
 * Hook to get the real estate category summary
 *
 * This aggregates data from:
 * - REITs (via broker connections)
 * - Residential (manual entry)
 * - Commercial (manual entry)
 * - Crowdfunding (manual entry)
 * - Land (manual entry)
 */
export function useRealEstateSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  // Fetch real estate data from broker positions (primarily REITs)
  const realEstateData = useQuery(api.categories.getRealEstate);

  const isLoading = realEstateData === undefined;

  // Build category summary from real data
  const summary = useMemo<CategorySummary | null>(() => {
    // Return null if not authenticated or still loading
    if (realEstateData === undefined || realEstateData === null) return null;

    const { positions, summary: dataSummary } = realEstateData;
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

    // Build subcategories array from centralized config
    const subcategories: SubcategoryData[] = [];

    for (const [slug, meta] of Object.entries(realEstateSubcategoryUI)) {
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

    // Calculate totals - REITs from broker positions + any future manual entries
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
      ytdProfitLoss: null,
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
      historyDataPoints,
    };
  }, [realEstateData]);

  return {
    summary,
    isLoading,
  };
}
