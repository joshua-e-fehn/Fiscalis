/**
 * Bonds Category Summary Hook
 *
 * Aggregates data from all bond subcategories (Government, Corporate, Municipal, etc.)
 * to provide a unified summary for the category dashboard.
 *
 * Currently placeholder - will integrate with broker data when available.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  categoryColorPalettes,
} from "@/lib/types/investments";
import {
  Landmark,
  Building,
  Building2,
  PiggyBank,
  BarChart3,
} from "lucide-react";
import React from "react";

/**
 * Hook to get the bonds category summary
 */
export function useBondsSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    const colors = categoryColorPalettes.bonds;

    const subcategories: SubcategoryData[] = [
      {
        id: "government",
        name: "Government Bonds",
        href: "/bonds/government",
        icon: React.createElement(Landmark, { className: "h-4 w-4" }),
        color: colors.government,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "corporate",
        name: "Corporate Bonds",
        href: "/bonds/corporate",
        icon: React.createElement(Building, { className: "h-4 w-4" }),
        color: colors.corporate,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "municipal",
        name: "Municipal Bonds",
        href: "/bonds/municipal",
        icon: React.createElement(Building2, { className: "h-4 w-4" }),
        color: colors.municipal,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "savings",
        name: "Savings Bonds",
        href: "/bonds/savings",
        icon: React.createElement(PiggyBank, { className: "h-4 w-4" }),
        color: colors.savings,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "funds",
        name: "Bond Funds & ETFs",
        href: "/bonds/funds",
        icon: React.createElement(BarChart3, { className: "h-4 w-4" }),
        color: colors.funds,
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
