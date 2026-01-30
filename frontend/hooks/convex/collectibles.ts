/**
 * Collectibles Category Summary Hook
 *
 * Aggregates data from all collectibles subcategories
 * to provide a unified summary for the category dashboard.
 *
 * Currently placeholder - will integrate with collectibles data when available.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  categoryColorPalettes,
} from "@/lib/types/investments";
import { Palette, Wine, Watch, Car, Coins, Image } from "lucide-react";
import React from "react";

/**
 * Hook to get the collectibles category summary
 */
export function useCollectiblesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    const colors = categoryColorPalettes.collectibles;

    const subcategories: SubcategoryData[] = [
      {
        id: "art",
        name: "Art",
        href: "/collectibles/art",
        icon: React.createElement(Palette, { className: "h-4 w-4" }),
        color: colors.art,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "watches",
        name: "Watches",
        href: "/collectibles/watches",
        icon: React.createElement(Watch, { className: "h-4 w-4" }),
        color: colors.watches,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "wine",
        name: "Wine",
        href: "/collectibles/wine",
        icon: React.createElement(Wine, { className: "h-4 w-4" }),
        color: colors.wine,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "cars",
        name: "Classic Cars",
        href: "/collectibles/cars",
        icon: React.createElement(Car, { className: "h-4 w-4" }),
        color: colors.cars,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "coins",
        name: "Numismatic Coins",
        href: "/collectibles/coins",
        icon: React.createElement(Coins, { className: "h-4 w-4" }),
        color: colors.memorabilia,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "nfts",
        name: "NFTs",
        href: "/collectibles/nfts",
        icon: React.createElement(Image, { className: "h-4 w-4" }),
        color: colors.other,
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
