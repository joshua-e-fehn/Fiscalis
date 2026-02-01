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
  categoryColorPalettes,
  Holding,
} from "@/lib/types/investments";
import { Home, CreditCard, Banknote, TrendingDown } from "lucide-react";
import React from "react";

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
    const colors = categoryColorPalettes.liabilities;
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

    // Build subcategories array with real data
    const subcategories: SubcategoryData[] = [];

    // 1. Mortgages
    const mortgagesData = bySubcategory["mortgages"] ?? { count: 0, total: 0 };
    subcategories.push({
      id: "mortgages",
      name: "Mortgages",
      href: "/liabilities/mortgages",
      icon: React.createElement(Home, { className: "h-4 w-4" }),
      color: colors.mortgages,
      totalValue: mortgagesData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("mortgages"),
      holdingsCount: mortgagesData.count,
      implemented: true,
    });

    // 2. Loans (personal, auto, student, etc.)
    const loansData = bySubcategory["loans"] ?? { count: 0, total: 0 };
    subcategories.push({
      id: "loans",
      name: "Loans",
      href: "/liabilities/loans",
      icon: React.createElement(Banknote, { className: "h-4 w-4" }),
      color: colors.loans,
      totalValue: loansData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("loans"),
      holdingsCount: loansData.count,
      implemented: true,
    });

    // 3. Credit Cards
    const creditCardsData = bySubcategory["credit-cards"] ?? {
      count: 0,
      total: 0,
    };
    subcategories.push({
      id: "credit-cards",
      name: "Credit Cards",
      href: "/liabilities/credit-cards",
      icon: React.createElement(CreditCard, { className: "h-4 w-4" }),
      color: colors["credit-cards"],
      totalValue: creditCardsData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("credit-cards"),
      holdingsCount: creditCardsData.count,
      implemented: true,
    });

    // 4. Margin Loans
    const marginLoansData = bySubcategory["margin-loans"] ?? {
      count: 0,
      total: 0,
    };
    subcategories.push({
      id: "margin-loans",
      name: "Margin Loans",
      href: "/liabilities/margin",
      icon: React.createElement(TrendingDown, { className: "h-4 w-4" }),
      color: colors["margin-loans"],
      totalValue: marginLoansData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("margin-loans"),
      holdingsCount: marginLoansData.count,
      implemented: true,
    });

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
