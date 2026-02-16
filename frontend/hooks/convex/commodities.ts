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
} from "@/lib/types/investments";
import { MetalsCurrency } from "@/lib/types/metals-extended";
import {
  commoditiesSubcategoryUI,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";

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

    // Build subcategories array from centralized config
    const subcategories: SubcategoryData[] = [];

    for (const [slug, meta] of Object.entries(commoditiesSubcategoryUI)) {
      if (slug === "metals") {
        // Precious Metals — has real data
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
                    ? ((item.marketValue ?? 0) /
                        metalsSummary.totalMarketValue) *
                      100
                    : 0,
              }))
          : [];

        subcategories.push({
          ...makeSubcategoryBase(slug, meta),
          totalValue: metalsSummary?.totalMarketValue ?? 0,
          costBasis: metalsSummary?.totalCost ?? null,
          profitLoss: metalsSummary?.totalProfitLoss ?? null,
          profitLossPercent: metalsSummary?.totalProfitLossPercent ?? null,
          topHoldings: metalsTopHoldings,
          holdingsCount: metalsItems?.length ?? 0,
          implemented: true,
        });
      } else {
        // Other commodities — placeholder
        subcategories.push(makeSubcategoryBase(slug, meta));
      }
    }

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
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();
    const pointBeforeYear = historyDataPoints
      .filter((dp) => dp.timestamp <= startOfYear)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const valueAtYearStart = pointBeforeYear?.value ?? null;

    let ytdProfitLoss: number | null = null;
    let ytdProfitLossPercent: number | null = null;

    if (valueAtYearStart !== null && valueAtYearStart > 0) {
      ytdProfitLoss = totalValue - valueAtYearStart;
      ytdProfitLossPercent = (ytdProfitLoss / valueAtYearStart) * 100;
    } else if (totalCost !== null && totalCost > 0) {
      ytdProfitLoss = totalValue - totalCost;
      ytdProfitLossPercent = (ytdProfitLoss / totalCost) * 100;
    }

    return {
      totalValue,
      totalCost,
      profitLoss,
      profitLossPercent,
      ytdProfitLoss,
      ytdProfitLossPercent,
      valueAtYearStart,
      subcategories,
      historyDataPoints,
    };
  }, [userId, metalsSummary, metalsItems, historicalDataPoints]);

  return {
    summary,
    isLoading: metalsLoading || historicalLoading,
  };
}
