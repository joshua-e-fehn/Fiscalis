/**
 * Cash & Money Market Category Summary Hook
 *
 * Aggregates data from all cash subcategories (bank accounts, money market, CDs, etc.)
 * to provide a unified summary for the category dashboard.
 *
 * Uses real data from Plaid bank accounts and broker cash positions via classification.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CategorySummary,
  SubcategoryData,
  Holding,
} from "@/lib/types/investments";
import {
  cashSubcategoryUI,
  makeSubcategoryBase,
} from "@/lib/config/categoryUI";
import {
  bankAccountValue,
  brokerAccountCash as accountCash,
  positionValue,
} from "@/../services/portfolio/categorySummary";

/**
 * Hook to get the cash category summary
 */
export function useCashSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  // Fetch real cash data from Convex
  const cashData = useQuery(api.categories.getCashHoldings);

  const isLoading = cashData === undefined;

  const summary = useMemo<CategorySummary | null>(() => {
    // Return null if not authenticated or still loading
    if (cashData === undefined || cashData === null) return null;

    const {
      bankAccounts,
      brokerCash,
      brokerAccountCash,
      summary: dataSummary,
    } = cashData;
    const bySubcategory = dataSummary.bySubcategory;

    // Helper to get top holdings for a subcategory
    const getTopHoldingsForSubcategory = (
      subcategory: string,
      limit: number = 3,
    ): Holding[] => {
      const holdings: Holding[] = [];

      // Every value is in EUR, as the server totals are (an amount
      // without a base value counts as 0 there too)

      // Add bank accounts matching this subcategory
      bankAccounts
        .filter((acc) => acc.investmentSubcategory === subcategory)
        .sort((a, b) => bankAccountValue(b) - bankAccountValue(a))
        .slice(0, limit)
        .forEach((acc) => {
          const value = bankAccountValue(acc);
          holdings.push({
            id: acc._id,
            name: acc.name || acc.officialName || "Bank Account",
            subcategoryId: subcategory,
            value,
            costBasis: null,
            profitLoss: null,
            profitLossPercent: null,
            allocationPercent:
              dataSummary.totalValue > 0
                ? (value / dataSummary.totalValue) * 100
                : 0,
            institutionName: acc.institutionName ?? undefined,
          });
        });

      // Add broker cash positions matching this subcategory
      brokerCash
        .filter((pos) => pos.investmentSubcategory === subcategory)
        .sort((a, b) => positionValue(b) - positionValue(a))
        .slice(0, limit - holdings.length)
        .forEach((pos) => {
          const value = positionValue(pos);
          holdings.push({
            id: pos._id,
            name: pos.symbol ?? pos.name ?? "Cash Position",
            subcategoryId: subcategory,
            value,
            costBasis: null,
            profitLoss: null,
            profitLossPercent: null,
            allocationPercent:
              dataSummary.totalValue > 0
                ? (value / dataSummary.totalValue) * 100
                : 0,
          });
        });

      // Add broker account cash for "broker-cash" subcategory: the EUR
      // amount the server counted (brokerAccountCash), never the balance
      if (subcategory === "broker-cash" && brokerAccountCash) {
        [...brokerAccountCash]
          .sort((a, b) => accountCash(b) - accountCash(a))
          .slice(0, limit - holdings.length)
          .forEach((acc) => {
            const value = accountCash(acc);
            holdings.push({
              id: acc._id,
              name: `${acc.institutionName || acc.name} - Cash`,
              subcategoryId: subcategory,
              value,
              costBasis: null,
              profitLoss: null,
              profitLossPercent: null,
              allocationPercent:
                dataSummary.totalValue > 0
                  ? (value / dataSummary.totalValue) * 100
                  : 0,
            });
          });
      }

      return holdings.slice(0, limit);
    };

    // Build subcategories array with real data from centralized config
    const subcategories: SubcategoryData[] = [];

    for (const [slug, meta] of Object.entries(cashSubcategoryUI)) {
      const data = bySubcategory[slug] ?? { count: 0, total: 0 };
      subcategories.push({
        ...makeSubcategoryBase(slug, meta),
        totalValue: data.total,
        topHoldings: getTopHoldingsForSubcategory(slug),
        holdingsCount: data.count,
        implemented: true,
      });
    }

    // Calculate totals
    const totalValue = dataSummary.totalValue;

    return {
      totalValue,
      totalCost: null,
      profitLoss: null,
      profitLossPercent: null,
      ytdProfitLoss: null,
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
    };
  }, [cashData]);

  return {
    summary,
    isLoading,
  };
}
