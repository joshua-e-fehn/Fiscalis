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
} from "@/lib/types/investments";
import {
  collectiblesSubcategoryUI,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";

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

    // Build subcategories from centralized UI config
    const subcategories: SubcategoryData[] = Object.entries(
      collectiblesSubcategoryUI,
    ).map(([slug, meta]) => makeSubcategoryBase(slug, meta));

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
