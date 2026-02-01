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
  categoryColorPalettes,
  Holding,
} from "@/lib/types/investments";
import { Home, Building2, BarChart3, Users, TreePine } from "lucide-react";
import React from "react";

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
    const colors = categoryColorPalettes["real-estate"];

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

    // Build subcategories array
    const subcategories: SubcategoryData[] = [];
    const bySubcategory = dataSummary.bySubcategory;

    // 1. Residential (manual entry)
    subcategories.push({
      id: "residential",
      name: "Residential",
      href: "/real-estate/residential",
      icon: React.createElement(Home, { className: "h-4 w-4" }),
      color: colors.residential,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 2. Commercial (manual entry)
    subcategories.push({
      id: "commercial",
      name: "Commercial",
      href: "/real-estate/commercial",
      icon: React.createElement(Building2, { className: "h-4 w-4" }),
      color: colors.commercial,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 3. REITs (from broker positions)
    const reitsData = bySubcategory["reits"] ?? { count: 0, total: 0 };
    const reitsCostBasis = getSubcategoryCostBasis("reits");
    const reitsPL = getSubcategoryPL("reits");
    subcategories.push({
      id: "reits",
      name: "REITs",
      href: "/real-estate/reits",
      icon: React.createElement(BarChart3, { className: "h-4 w-4" }),
      color: colors.reits,
      totalValue: reitsData.total,
      costBasis: reitsCostBasis,
      profitLoss: reitsPL,
      profitLossPercent:
        reitsCostBasis && reitsPL ? (reitsPL / reitsCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("reits"),
      holdingsCount: reitsData.count,
      implemented: true,
    });

    // 4. Crowdfunding (manual entry)
    subcategories.push({
      id: "crowdfunding",
      name: "Crowdfunding",
      href: "/real-estate/crowdfunding",
      icon: React.createElement(Users, { className: "h-4 w-4" }),
      color: colors.crowdfunding,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 5. Land (manual entry)
    subcategories.push({
      id: "land",
      name: "Land",
      href: "/real-estate/land",
      icon: React.createElement(TreePine, { className: "h-4 w-4" }),
      color: colors.land,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

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
