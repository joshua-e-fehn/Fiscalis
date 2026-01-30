/**
 * Commodities Category Summary Hook
 *
 * Aggregates data from all commodity subcategories (Precious Metals, Energy, etc.)
 * to provide a unified summary for the category dashboard.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMetalsSummary, useMetals, useVaultTransactions } from "./metals";
import { usePortfolioHistoricalValues } from "@/hooks/metals";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  Holding,
  categoryColorPalettes,
  calculateYTDPerformance,
} from "@/lib/types/investments";
import { MetalsCurrency } from "@/lib/types/metals-extended";
import { Coins, Fuel, Factory, Wheat, Atom, Gem } from "lucide-react";
import React from "react";

/**
 * Hook to get the commodities category summary
 *
 * This aggregates data from:
 * - Precious Metals (implemented)
 * - Energy (not yet implemented)
 * - Industrial Metals (not yet implemented)
 * - Agricultural (not yet implemented)
 * - Rare Earth (not yet implemented)
 * - Gemstones (not yet implemented)
 */
export function useCommoditiesSummary(currency: MetalsCurrency = "eur"): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  // Get metals data
  const { summary: metalsSummary, isLoading: metalsLoading } = useMetalsSummary(
    userId ?? "",
    currency,
  );

  const { items: metalsItems } = useMetals(userId ?? "", currency);
  const { transactions: metalsTransactions } = useVaultTransactions(
    userId ?? "",
  );

  // Calculate current values for the historical values hook
  const currentPortfolioValue = metalsSummary?.totalMarketValue ?? 0;
  const totalCostValue = metalsSummary?.totalCost ?? null;

  // Get historical portfolio values using actual spot prices
  const { dataPoints: historicalDataPoints, isLoading: historicalLoading } =
    usePortfolioHistoricalValues(
      metalsItems,
      metalsTransactions,
      currentPortfolioValue,
      totalCostValue,
      "1Y", // Fetch 1 year of data to cover all time ranges
      currency,
    );

  // Build category summary
  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    const colors = categoryColorPalettes.commodities;

    // Build subcategories array
    const subcategories: SubcategoryData[] = [];

    // 1. Precious Metals (implemented)
    const metalsTopHoldings: Holding[] = metalsItems
      ? metalsItems
          .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
          .slice(0, 5)
          .map((item) => ({
            id: item._id,
            name: item.displayName,
            subcategoryId: "metals",
            value: item.marketValue ?? 0,
            costBasis: item.totalCost ?? null,
            profitLoss: item.profitLoss ?? null,
            profitLossPercent: item.profitLossPercent ?? null,
            allocationPercent:
              metalsSummary && metalsSummary.totalMarketValue > 0
                ? ((item.marketValue ?? 0) / metalsSummary.totalMarketValue) *
                  100
                : 0,
          }))
      : [];

    subcategories.push({
      id: "metals",
      name: "Precious Metals",
      href: "/commodities/metals",
      icon: React.createElement(Coins, { className: "h-4 w-4" }),
      color: colors.metals,
      totalValue: metalsSummary?.totalMarketValue ?? 0,
      costBasis: metalsSummary?.totalCost ?? null,
      profitLoss: metalsSummary?.totalProfitLoss ?? null,
      profitLossPercent: metalsSummary?.totalProfitLossPercent ?? null,
      topHoldings: metalsTopHoldings,
      holdingsCount: metalsItems?.length ?? 0,
      implemented: true,
    });

    // 2. Energy (not implemented - placeholder)
    subcategories.push({
      id: "energy",
      name: "Energy",
      href: "/commodities/energy",
      icon: React.createElement(Fuel, { className: "h-4 w-4" }),
      color: colors.energy,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 3. Industrial Metals (not implemented - placeholder)
    subcategories.push({
      id: "industrial",
      name: "Industrial Metals",
      href: "/commodities/industrial",
      icon: React.createElement(Factory, { className: "h-4 w-4" }),
      color: colors.industrial,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 4. Agricultural (not implemented - placeholder)
    subcategories.push({
      id: "agricultural",
      name: "Agricultural",
      href: "/commodities/agricultural",
      icon: React.createElement(Wheat, { className: "h-4 w-4" }),
      color: colors.agricultural,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 5. Rare Earth (not implemented - placeholder)
    subcategories.push({
      id: "rare-earth",
      name: "Rare Earth",
      href: "/commodities/rare-earth",
      icon: React.createElement(Atom, { className: "h-4 w-4" }),
      color: colors["rare-earth"],
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // 6. Gemstones (not implemented - placeholder)
    subcategories.push({
      id: "gemstones",
      name: "Gemstones",
      href: "/commodities/gemstones",
      icon: React.createElement(Gem, { className: "h-4 w-4" }),
      color: colors.gemstones,
      totalValue: 0,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: [],
      holdingsCount: 0,
      implemented: false,
    });

    // Calculate totals
    const totalValue = subcategories.reduce((sum, s) => sum + s.totalValue, 0);

    // Only include cost if all subcategories with value have cost data
    const subcatsWithValue = subcategories.filter((s) => s.totalValue > 0);
    const allHaveCost = subcatsWithValue.every((s) => s.costBasis !== null);
    const totalCost = allHaveCost
      ? subcatsWithValue.reduce((sum, s) => sum + (s.costBasis ?? 0), 0)
      : null;

    const profitLoss = totalCost !== null ? totalValue - totalCost : null;
    const profitLossPercent =
      totalCost !== null && totalCost > 0
        ? (profitLoss! / totalCost) * 100
        : null;

    // Convert historical data points to the expected format
    const historyDataPoints: PortfolioDataPoint[] = historicalDataPoints.map(
      (dp) => ({
        date: dp.date,
        timestamp: dp.timestamp,
        value: dp.value,
        cost: dp.cost,
      }),
    );

    // Calculate YTD
    const ytdData = calculateYTDPerformance(
      totalValue,
      totalCost,
      historyDataPoints,
    );

    return {
      totalValue,
      totalCost,
      profitLoss,
      profitLossPercent,
      ytdProfitLoss: ytdData.ytdProfitLoss,
      ytdProfitLossPercent: ytdData.ytdProfitLossPercent,
      valueAtYearStart: ytdData.valueAtYearStart,
      subcategories,
      historyDataPoints,
    };
  }, [userId, metalsSummary, metalsItems, historicalDataPoints]);

  return {
    summary,
    isLoading: metalsLoading || historicalLoading,
  };
}
