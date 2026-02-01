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
  categoryColorPalettes,
  Holding,
} from "@/lib/types/investments";
import {
  TrendingUp,
  BarChart3,
  PieChart,
  Briefcase,
  Activity,
} from "lucide-react";
import React from "react";

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
    const colors = categoryColorPalettes.equities;

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
    const bySubcategory = dataSummary.bySubcategory;

    // 1. Public Stocks
    const stocksData = bySubcategory["stocks"] ?? { count: 0, total: 0 };
    const stocksCostBasis = getSubcategoryCostBasis("stocks");
    const stocksPL = getSubcategoryPL("stocks");
    subcategories.push({
      id: "stocks",
      name: "Public Stocks",
      href: "/equities/stocks",
      icon: React.createElement(TrendingUp, { className: "h-4 w-4" }),
      color: colors.stocks,
      totalValue: stocksData.total,
      costBasis: stocksCostBasis,
      profitLoss: stocksPL,
      profitLossPercent:
        stocksCostBasis && stocksPL ? (stocksPL / stocksCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("stocks"),
      holdingsCount: stocksData.count,
      implemented: true,
    });

    // 2. ETFs & Index Funds
    const etfsData = bySubcategory["etfs"] ?? { count: 0, total: 0 };
    const etfsCostBasis = getSubcategoryCostBasis("etfs");
    const etfsPL = getSubcategoryPL("etfs");
    subcategories.push({
      id: "etfs",
      name: "ETFs & Index Funds",
      href: "/equities/etfs",
      icon: React.createElement(BarChart3, { className: "h-4 w-4" }),
      color: colors.etfs,
      totalValue: etfsData.total,
      costBasis: etfsCostBasis,
      profitLoss: etfsPL,
      profitLossPercent:
        etfsCostBasis && etfsPL ? (etfsPL / etfsCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("etfs"),
      holdingsCount: etfsData.count,
      implemented: true,
    });

    // 3. Mutual Funds
    const fundsData = bySubcategory["funds"] ?? { count: 0, total: 0 };
    const fundsCostBasis = getSubcategoryCostBasis("funds");
    const fundsPL = getSubcategoryPL("funds");
    subcategories.push({
      id: "funds",
      name: "Mutual Funds",
      href: "/equities/funds",
      icon: React.createElement(PieChart, { className: "h-4 w-4" }),
      color: colors.funds,
      totalValue: fundsData.total,
      costBasis: fundsCostBasis,
      profitLoss: fundsPL,
      profitLossPercent:
        fundsCostBasis && fundsPL ? (fundsPL / fundsCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("funds"),
      holdingsCount: fundsData.count,
      implemented: true,
    });

    // 4. Options
    const optionsData = bySubcategory["options"] ?? { count: 0, total: 0 };
    const optionsCostBasis = getSubcategoryCostBasis("options");
    const optionsPL = getSubcategoryPL("options");
    subcategories.push({
      id: "options",
      name: "Options",
      href: "/equities/options",
      icon: React.createElement(Activity, { className: "h-4 w-4" }),
      color: colors.options ?? "#9333ea", // Purple fallback if not defined
      totalValue: optionsData.total,
      costBasis: optionsCostBasis,
      profitLoss: optionsPL,
      profitLossPercent:
        optionsCostBasis && optionsPL
          ? (optionsPL / optionsCostBasis) * 100
          : null,
      topHoldings: getTopHoldingsForSubcategory("options"),
      holdingsCount: optionsData.count,
      implemented: true,
    });

    // 5. Private Equity
    const privateData = bySubcategory["private"] ?? { count: 0, total: 0 };
    const privateCostBasis = getSubcategoryCostBasis("private");
    const privatePL = getSubcategoryPL("private");
    subcategories.push({
      id: "private",
      name: "Private Equity",
      href: "/equities/private",
      icon: React.createElement(Briefcase, { className: "h-4 w-4" }),
      color: colors.private,
      totalValue: privateData.total,
      costBasis: privateCostBasis,
      profitLoss: privatePL,
      profitLossPercent:
        privateCostBasis && privatePL
          ? (privatePL / privateCostBasis) * 100
          : null,
      topHoldings: getTopHoldingsForSubcategory("private"),
      holdingsCount: privateData.count,
      implemented: false, // Manual entry, not via broker integration
    });

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
