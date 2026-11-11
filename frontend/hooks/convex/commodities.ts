/**
 * Commodities Category Summary Hook
 *
 * Aggregates data from all commodity subcategories (Precious Metals, Energy, etc.)
 * to provide a unified summary for the category dashboard.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMetalsSummary, useMetals } from "./metals";
import { useVaultPerformance } from "@/hooks/performance/useContinuousPerformance";
import { useMetalsYTD } from "@/hooks/performance/useMetalsYTD";
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
  const { summary: metalsSummary, isLoading: metalsLoading } = useMetalsSummary(currency);

  const { items: metalsItems } = useMetals(currency);

  // History and YTD from the one vault engine: ledger quantities at
  // historical spot, sales as outflows (useVaultPerformance / useMetalsYTD)
  const history = useVaultPerformance("Year", {
    currency,
    includeDataPoints: true,
  });
  const ytd = useMetalsYTD(currency);

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
          profitLoss: metalsSummary?.unrealizedProfitLoss ?? null,
          profitLossPercent: metalsSummary?.unrealizedProfitLossPercent ?? null,
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

    // Only precious metals carry data. Their cost and unrealized P/L cover
    // just the items with a cost (summarizeMetalItems), so the P/L is taken
    // from the summary rather than recomputed against the full value.
    const totalCost = metalsSummary?.totalCost ?? null;
    const profitLoss = metalsSummary?.unrealizedProfitLoss ?? null;
    const profitLossPercent =
      metalsSummary?.unrealizedProfitLossPercent ?? null;

    // The chart's cost line: the lots' cost, or the value where unknown
    const historyDataPoints: PortfolioDataPoint[] = history.dataPoints.map(
      (dp) => ({
        date: new Date(dp.timestamp).toLocaleDateString("de-DE"),
        timestamp: dp.timestamp,
        value: dp.value,
        cost: dp.costBasis ?? dp.value,
      }),
    );

    // YTD net of this year's purchases and sales; null without a value at 1 Jan
    const ytdProfitLoss = ytd.ytdProfitLoss;
    const ytdProfitLossPercent = ytd.ytdProfitLossPercent;
    const valueAtYearStart = ytd.valueAtStartOfYear;

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
  }, [userId, metalsSummary, metalsItems, history.dataPoints, ytd]);

  return {
    summary,
    isLoading: metalsLoading || history.isLoading || ytd.isLoading,
  };
}
