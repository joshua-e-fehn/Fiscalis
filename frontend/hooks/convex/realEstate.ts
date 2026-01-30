/**
 * Real Estate Category Summary Hook
 *
 * Aggregates data from all real estate subcategories
 * to provide a unified summary for the category dashboard.
 *
 * Currently placeholder - will integrate with property data when available.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  categoryColorPalettes,
} from "@/lib/types/investments";
import { Home, Building2, BarChart3, Users, TreePine } from "lucide-react";
import React from "react";

/**
 * Hook to get the real estate category summary
 */
export function useRealEstateSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    const colors = categoryColorPalettes["real-estate"];

    const subcategories: SubcategoryData[] = [
      {
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
      },
      {
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
      },
      {
        id: "reits",
        name: "REITs",
        href: "/real-estate/reits",
        icon: React.createElement(BarChart3, { className: "h-4 w-4" }),
        color: colors.reits,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
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
      },
      {
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
      },
    ];

    const totalValue = subcategories.reduce((sum, s) => sum + s.totalValue, 0);
    const historyDataPoints: PortfolioDataPoint[] = [];

    return {
      totalValue,
      totalCost: null,
      profitLoss: null,
      profitLossPercent: null,
      ytdProfitLoss: null,
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
      historyDataPoints,
    };
  }, [userId]);

  return {
    summary,
    isLoading: false,
  };
}
