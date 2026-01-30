/**
 * Crypto Category Summary Hook
 *
 * Aggregates data from all crypto subcategories
 * to provide a unified summary for the category dashboard.
 *
 * Currently placeholder - will integrate with wallet/exchange data when available.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  categoryColorPalettes,
} from "@/lib/types/investments";
import { Bitcoin, Coins, CircleDollarSign, Layers } from "lucide-react";
import React from "react";

/**
 * Hook to get the crypto category summary
 */
export function useCryptoSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  const summary = useMemo<CategorySummary | null>(() => {
    if (!userId) return null;

    const colors = categoryColorPalettes.crypto;

    const subcategories: SubcategoryData[] = [
      {
        id: "bitcoin",
        name: "Bitcoin",
        href: "/crypto/bitcoin",
        icon: React.createElement(Bitcoin, { className: "h-4 w-4" }),
        color: colors.bitcoin,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "ethereum",
        name: "Ethereum",
        href: "/crypto/ethereum",
        icon: React.createElement(Coins, { className: "h-4 w-4" }),
        color: colors.ethereum,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "altcoins",
        name: "Altcoins",
        href: "/crypto/altcoins",
        icon: React.createElement(Coins, { className: "h-4 w-4" }),
        color: colors.altcoins,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "stablecoins",
        name: "Stablecoins",
        href: "/crypto/stablecoins",
        icon: React.createElement(CircleDollarSign, { className: "h-4 w-4" }),
        color: colors.stablecoins,
        totalValue: 0,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        topHoldings: [],
        holdingsCount: 0,
        implemented: false,
      },
      {
        id: "defi",
        name: "DeFi",
        href: "/crypto/defi",
        icon: React.createElement(Layers, { className: "h-4 w-4" }),
        color: colors.defi,
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
