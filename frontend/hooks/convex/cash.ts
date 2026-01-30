/**
 * Cash & Money Market Category Summary Hook
 *
 * Aggregates data from all cash subcategories
 * to provide a unified summary for the category dashboard.
 *
 * Currently placeholder - will integrate with banking data when available.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  categoryColorPalettes,
} from "@/lib/types/investments";
import {
  PiggyBank,
  Landmark,
  Clock,
  Banknote,
  ArrowRightLeft,
} from "lucide-react";
import React from "react";

/**
 * Hook to get the cash category summary
 */
export function useCashSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    const colors = categoryColorPalettes.cash;

    const subcategories: SubcategoryData[] = [
      {
        id: "savings-accounts",
        name: "Savings Accounts",
        href: "/cash/savings",
        icon: React.createElement(PiggyBank, { className: "h-4 w-4" }),
        color: colors["savings-accounts"],
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "money-market",
        name: "Money Market Funds",
        href: "/cash/money-market",
        icon: React.createElement(Landmark, { className: "h-4 w-4" }),
        color: colors["money-market"],
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "cds",
        name: "Certificates of Deposit",
        href: "/cash/cds",
        icon: React.createElement(Clock, { className: "h-4 w-4" }),
        color: colors.cds,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "treasury-bills",
        name: "Treasury Bills",
        href: "/cash/tbills",
        icon: React.createElement(Banknote, { className: "h-4 w-4" }),
        color: colors["treasury-bills"],
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "forex",
        name: "Foreign Currency",
        href: "/cash/forex",
        icon: React.createElement(ArrowRightLeft, { className: "h-4 w-4" }),
        color: "#9333EA", // Purple for forex
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
