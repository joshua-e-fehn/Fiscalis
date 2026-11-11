/**
 * Liabilities Category Summary Hook
 *
 * Aggregates data from all liability subcategories (mortgages, loans, credit cards, margin loans)
 * to provide a unified summary for the category dashboard.
 *
 * Rows and totals come from categories.getLiabilities, which reads the shared
 * net-worth aggregator, so the totals equal the dashboard's and the
 * snapshots' liabilities.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  Holding,
} from "@/lib/types/investments";
import {
  liabilitiesSubcategoryUI,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";

/**
 * Hook to get the liabilities category summary
 *
 * This aggregates data from:
 * - Mortgages (via Plaid connections)
 * - Loans (via Plaid connections + manual entry)
 * - Credit Cards (via Plaid connections)
 * - Margin Loans (via broker connections)
 */
export function useLiabilitiesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  // Fetch real liabilities data from Convex
  const liabilitiesData = useQuery(api.categories.getLiabilities);

  const isLoading = liabilitiesData === undefined;

  const summary = useMemo<CategorySummary | null>(() => {
    // Return null if not authenticated or still loading
    if (liabilitiesData === undefined || liabilitiesData === null) return null;

    const { rows, summary: dataSummary } = liabilitiesData;
    const bySubcategory = dataSummary.bySubcategory;

    // The largest liabilities of a subcategory, by amount owed in EUR (the
    // server's rows: Plaid accounts, margin debits, Bitpanda, manual loans)
    const getTopHoldingsForSubcategory = (
      subcategory: string,
      limit: number = 3,
    ): Holding[] =>
      rows
        .filter((row) => row.subcategory === subcategory)
        .sort((a, b) => b.owedInBaseCurrency - a.owedInBaseCurrency)
        .slice(0, limit)
        .map((row) => ({
          id: row.id,
          name: row.name,
          subcategoryId: subcategory,
          value: row.owedInBaseCurrency,
          costBasis: null,
          profitLoss: null,
          profitLossPercent: null,
          allocationPercent:
            dataSummary.totalLiabilities > 0
              ? (row.owedInBaseCurrency / dataSummary.totalLiabilities) * 100
              : 0,
        }));

    // Build subcategories array from centralized config
    const subcategories: SubcategoryData[] = [];

    for (const [slug, meta] of Object.entries(liabilitiesSubcategoryUI)) {
      const data = bySubcategory[slug] ?? { count: 0, total: 0 };
      subcategories.push({
        ...makeSubcategoryBase(slug, meta),
        totalValue: data.total,
        topHoldings: getTopHoldingsForSubcategory(slug),
        holdingsCount: data.count,
        implemented: true,
      });
    }

    // Calculate totals - liabilities are shown as positive values for display
    const totalValue = dataSummary.totalLiabilities;
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
  }, [liabilitiesData]);

  return {
    summary,
    isLoading,
  };
}
