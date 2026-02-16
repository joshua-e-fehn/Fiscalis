/**
 * Liabilities Category Summary Hook
 *
 * Aggregates data from all liability subcategories (mortgages, loans, credit cards, margin loans)
 * to provide a unified summary for the category dashboard.
 *
 * Uses real data from Plaid accounts and broker positions via classification.
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

    const {
      plaidLiabilities,
      brokerLiabilities,
      manualLoans,
      summary: dataSummary,
    } = liabilitiesData;
    const bySubcategory = dataSummary.bySubcategory;

    // Helper to get top holdings for a subcategory
    const getTopHoldingsForSubcategory = (
      subcategory: string,
      limit: number = 3,
    ): Holding[] => {
      const holdings: Holding[] = [];

      // Add Plaid liabilities matching this subcategory
      plaidLiabilities
        .filter((acc) => acc.investmentSubcategory === subcategory)
        .sort(
          (a, b) =>
            Math.abs(b.currentBalance ?? 0) - Math.abs(a.currentBalance ?? 0),
        )
        .slice(0, limit)
        .forEach((acc) => {
          const value = Math.abs(acc.currentBalance ?? 0);
          holdings.push({
            id: acc._id,
            name: acc.name || acc.officialName || "Account",
            subcategoryId: subcategory,
            value,
            costBasis: null,
            profitLoss: null,
            profitLossPercent: null,
            allocationPercent:
              dataSummary.totalLiabilities > 0
                ? (value / dataSummary.totalLiabilities) * 100
                : 0,
          });
        });

      // Add broker liabilities (margin loans) matching this subcategory
      brokerLiabilities
        .filter((pos) => pos.investmentSubcategory === subcategory)
        .sort(
          (a, b) =>
            Math.abs(b.valueInBaseCurrency ?? b.marketValue ?? 0) -
            Math.abs(a.valueInBaseCurrency ?? a.marketValue ?? 0),
        )
        .slice(0, limit - holdings.length)
        .forEach((pos) => {
          const value = Math.abs(
            pos.valueInBaseCurrency ?? pos.marketValue ?? 0,
          );
          holdings.push({
            id: pos._id,
            name: pos.symbol ?? pos.name ?? "Margin Loan",
            subcategoryId: subcategory,
            value,
            costBasis: null,
            profitLoss: null,
            profitLossPercent: null,
            allocationPercent:
              dataSummary.totalLiabilities > 0
                ? (value / dataSummary.totalLiabilities) * 100
                : 0,
          });
        });

      // Add manual loans for the "loans" subcategory
      if (subcategory === "loans" && manualLoans) {
        manualLoans
          .sort(
            (a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance),
          )
          .slice(0, limit - holdings.length)
          .forEach((loan) => {
            const value = Math.abs(loan.currentBalance);
            holdings.push({
              id: loan._id,
              name: loan.name,
              subcategoryId: subcategory,
              value,
              costBasis: loan.originalPrincipal,
              profitLoss: null,
              profitLossPercent: null,
              allocationPercent:
                dataSummary.totalLiabilities > 0
                  ? (value / dataSummary.totalLiabilities) * 100
                  : 0,
            });
          });
      }

      return holdings.slice(0, limit);
    };

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
