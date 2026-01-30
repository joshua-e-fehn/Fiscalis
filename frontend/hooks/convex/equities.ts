/**
 * Equities Category Summary Hook
 *
 * Aggregates data from all equity subcategories (Stocks, ETFs, Funds, Private Equity)
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
import { TrendingUp, BarChart3, PieChart, Briefcase } from "lucide-react";
import React from "react";

/**
 * Hook to get the equities category summary
 *
 * This aggregates data from:
 * - Public Stocks (via broker connections)
 * - ETFs & Index Funds (via broker connections)
 * - Mutual Funds (via broker connections)
 * - Private Equity (manual entry)
 */
export function useEquitiesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  // TODO: Integrate with broker positions data
  // const { positions, isLoading: positionsLoading } = useBrokerPositions(userId);

  // Build category summary
  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    const colors = categoryColorPalettes.equities;

    // Build subcategories array - currently placeholders
    const subcategories: SubcategoryData[] = [];

    // 1. Public Stocks
    subcategories.push({
      id: "stocks",
      name: "Public Stocks",
      href: "/equities/stocks",
      icon: React.createElement(TrendingUp, { className: "h-4 w-4" }),
      color: colors.stocks,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 2. ETFs & Index Funds
    subcategories.push({
      id: "etfs",
      name: "ETFs & Index Funds",
      href: "/equities/etfs",
      icon: React.createElement(BarChart3, { className: "h-4 w-4" }),
      color: colors.etfs,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 3. Mutual Funds
    subcategories.push({
      id: "funds",
      name: "Mutual Funds",
      href: "/equities/funds",
      icon: React.createElement(PieChart, { className: "h-4 w-4" }),
      color: colors.funds,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 4. Private Equity
    subcategories.push({
      id: "private",
      name: "Private Equity",
      href: "/equities/private",
      icon: React.createElement(Briefcase, { className: "h-4 w-4" }),
      color: colors.private,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // Calculate totals (currently 0)
    const totalValue = subcategories.reduce((sum, s) => sum + s.totalValue, 0);
    const totalCost = null;
    const profitLoss = null;
    const profitLossPercent = null;

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
  }, [userId]);

  return {
    summary,
    isLoading: false,
  };
}
