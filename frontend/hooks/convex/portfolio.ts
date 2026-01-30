/**
 * Portfolio Summary Hook
 *
 * Aggregates data from ALL investment categories and liabilities
 * to provide a unified portfolio overview for the dashboard.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  InvestmentCategory,
  PortfolioDataPoint,
  categoryColorPalettes,
} from "@/lib/types/investments";
import { MetalsCurrency } from "@/lib/types/metals-extended";
import { useCommoditiesSummary } from "./commodities";
import { useEquitiesSummary } from "./equities";
import { useBondsSummary } from "./bonds";
import { useCryptoSummary } from "./crypto";
import { useRealEstateSummary } from "./realEstate";
import { useCashSummary } from "./cash";
import { useCollectiblesSummary } from "./collectibles";
import { useLoansSummary } from "./loans";
import {
  Briefcase,
  Coins,
  Receipt,
  Building2,
  Banknote,
  Bitcoin,
  Gem,
  CreditCard,
} from "lucide-react";
import React from "react";

/**
 * Asset category data for portfolio overview
 */
export interface AssetCategoryData {
  id: InvestmentCategory;
  name: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  totalValue: number;
  costBasis: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  holdingsCount: number;
  implemented: boolean;
}

/**
 * Liabilities summary for portfolio overview
 */
export interface LiabilitiesSummaryData {
  totalBalance: number;
  monthlyPayment: number;
  loansCount: number;
  upcomingPaymentAmount: number | null;
  upcomingPaymentDate: string | null;
}

/**
 * Combined portfolio summary
 */
export interface PortfolioSummary {
  // Net worth calculation
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;

  // Overall performance
  totalCostBasis: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercent: number | null;

  // YTD performance
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;

  // Category breakdown
  assetCategories: AssetCategoryData[];

  // Liabilities
  liabilities: LiabilitiesSummaryData | null;

  // Historical performance (combined)
  historyDataPoints: PortfolioDataPoint[];
}

/**
 * Hook to get the complete portfolio overview
 *
 * Aggregates data from all investment categories and liabilities.
 */
export function usePortfolioOverview(currency: MetalsCurrency = "eur"): {
  summary: PortfolioSummary | null;
  isLoading: boolean;
} {
  const { userId } = useAuth();

  // Fetch all category summaries
  const { summary: commoditiesSummary, isLoading: commoditiesLoading } =
    useCommoditiesSummary(currency);
  const { summary: equitiesSummary, isLoading: equitiesLoading } =
    useEquitiesSummary();
  const { summary: bondsSummary, isLoading: bondsLoading } = useBondsSummary();
  const { summary: cryptoSummary, isLoading: cryptoLoading } =
    useCryptoSummary();
  const { summary: realEstateSummary, isLoading: realEstateLoading } =
    useRealEstateSummary();
  const { summary: cashSummary, isLoading: cashLoading } = useCashSummary();
  const { summary: collectiblesSummary, isLoading: collectiblesLoading } =
    useCollectiblesSummary();

  // Fetch liabilities
  const loansSummaryData = useLoansSummary(userId ?? undefined);

  const isLoading =
    commoditiesLoading ||
    equitiesLoading ||
    bondsLoading ||
    cryptoLoading ||
    realEstateLoading ||
    cashLoading ||
    collectiblesLoading ||
    loansSummaryData === undefined;

  // Build portfolio summary
  const summary = useMemo<PortfolioSummary | null>(() => {
    if (!userId) return null;

    // Build asset categories array
    const assetCategories: AssetCategoryData[] = [];

    // 1. Equities
    assetCategories.push({
      id: "equities",
      name: "Equities",
      href: "/equities",
      icon: React.createElement(Briefcase, { className: "h-4 w-4" }),
      color: categoryColorPalettes.equities.primary,
      totalValue: equitiesSummary?.totalValue ?? 0,
      costBasis: equitiesSummary?.totalCost ?? null,
      profitLoss: equitiesSummary?.profitLoss ?? null,
      profitLossPercent: equitiesSummary?.profitLossPercent ?? null,
      holdingsCount:
        equitiesSummary?.subcategories.reduce(
          (sum, s) => sum + s.holdingsCount,
          0,
        ) ?? 0,
      implemented:
        equitiesSummary?.subcategories.some((s) => s.implemented) ?? false,
    });

    // 2. Commodities
    assetCategories.push({
      id: "commodities",
      name: "Commodities",
      href: "/commodities",
      icon: React.createElement(Coins, { className: "h-4 w-4" }),
      color: categoryColorPalettes.commodities.primary,
      totalValue: commoditiesSummary?.totalValue ?? 0,
      costBasis: commoditiesSummary?.totalCost ?? null,
      profitLoss: commoditiesSummary?.profitLoss ?? null,
      profitLossPercent: commoditiesSummary?.profitLossPercent ?? null,
      holdingsCount:
        commoditiesSummary?.subcategories.reduce(
          (sum, s) => sum + s.holdingsCount,
          0,
        ) ?? 0,
      implemented:
        commoditiesSummary?.subcategories.some((s) => s.implemented) ?? false,
    });

    // 3. Bonds
    assetCategories.push({
      id: "bonds",
      name: "Bonds",
      href: "/bonds",
      icon: React.createElement(Receipt, { className: "h-4 w-4" }),
      color: categoryColorPalettes.bonds.primary,
      totalValue: bondsSummary?.totalValue ?? 0,
      costBasis: bondsSummary?.totalCost ?? null,
      profitLoss: bondsSummary?.profitLoss ?? null,
      profitLossPercent: bondsSummary?.profitLossPercent ?? null,
      holdingsCount:
        bondsSummary?.subcategories.reduce(
          (sum, s) => sum + s.holdingsCount,
          0,
        ) ?? 0,
      implemented:
        bondsSummary?.subcategories.some((s) => s.implemented) ?? false,
    });

    // 4. Real Estate
    assetCategories.push({
      id: "real-estate",
      name: "Real Estate",
      href: "/real-estate",
      icon: React.createElement(Building2, { className: "h-4 w-4" }),
      color: categoryColorPalettes["real-estate"].primary,
      totalValue: realEstateSummary?.totalValue ?? 0,
      costBasis: realEstateSummary?.totalCost ?? null,
      profitLoss: realEstateSummary?.profitLoss ?? null,
      profitLossPercent: realEstateSummary?.profitLossPercent ?? null,
      holdingsCount:
        realEstateSummary?.subcategories.reduce(
          (sum, s) => sum + s.holdingsCount,
          0,
        ) ?? 0,
      implemented:
        realEstateSummary?.subcategories.some((s) => s.implemented) ?? false,
    });

    // 5. Cash
    assetCategories.push({
      id: "cash",
      name: "Cash & Savings",
      href: "/cash",
      icon: React.createElement(Banknote, { className: "h-4 w-4" }),
      color: categoryColorPalettes.cash.primary,
      totalValue: cashSummary?.totalValue ?? 0,
      costBasis: cashSummary?.totalCost ?? null,
      profitLoss: cashSummary?.profitLoss ?? null,
      profitLossPercent: cashSummary?.profitLossPercent ?? null,
      holdingsCount:
        cashSummary?.subcategories.reduce(
          (sum, s) => sum + s.holdingsCount,
          0,
        ) ?? 0,
      implemented:
        cashSummary?.subcategories.some((s) => s.implemented) ?? false,
    });

    // 6. Crypto
    assetCategories.push({
      id: "crypto",
      name: "Cryptocurrency",
      href: "/crypto",
      icon: React.createElement(Bitcoin, { className: "h-4 w-4" }),
      color: categoryColorPalettes.crypto.primary,
      totalValue: cryptoSummary?.totalValue ?? 0,
      costBasis: cryptoSummary?.totalCost ?? null,
      profitLoss: cryptoSummary?.profitLoss ?? null,
      profitLossPercent: cryptoSummary?.profitLossPercent ?? null,
      holdingsCount:
        cryptoSummary?.subcategories.reduce(
          (sum, s) => sum + s.holdingsCount,
          0,
        ) ?? 0,
      implemented:
        cryptoSummary?.subcategories.some((s) => s.implemented) ?? false,
    });

    // 7. Collectibles
    assetCategories.push({
      id: "collectibles",
      name: "Collectibles",
      href: "/collectibles",
      icon: React.createElement(Gem, { className: "h-4 w-4" }),
      color: categoryColorPalettes.collectibles.primary,
      totalValue: collectiblesSummary?.totalValue ?? 0,
      costBasis: collectiblesSummary?.totalCost ?? null,
      profitLoss: collectiblesSummary?.profitLoss ?? null,
      profitLossPercent: collectiblesSummary?.profitLossPercent ?? null,
      holdingsCount:
        collectiblesSummary?.subcategories.reduce(
          (sum, s) => sum + s.holdingsCount,
          0,
        ) ?? 0,
      implemented:
        collectiblesSummary?.subcategories.some((s) => s.implemented) ?? false,
    });

    // Calculate totals
    const totalAssets = assetCategories.reduce(
      (sum, cat) => sum + cat.totalValue,
      0,
    );

    // Calculate total cost basis (only if all have cost basis, otherwise null)
    const categoriesWithCost = assetCategories.filter(
      (cat) => cat.costBasis !== null && cat.totalValue > 0,
    );
    const totalCostBasis =
      categoriesWithCost.length > 0
        ? categoriesWithCost.reduce((sum, cat) => sum + (cat.costBasis ?? 0), 0)
        : null;

    // Calculate unrealized P/L
    const unrealizedProfitLoss =
      totalCostBasis !== null ? totalAssets - totalCostBasis : null;
    const unrealizedProfitLossPercent =
      unrealizedProfitLoss !== null &&
      totalCostBasis !== null &&
      totalCostBasis > 0
        ? (unrealizedProfitLoss / totalCostBasis) * 100
        : null;

    // Liabilities summary
    const totalLiabilities = loansSummaryData?.totalDebt ?? 0;
    const liabilities: LiabilitiesSummaryData | null = loansSummaryData
      ? {
          totalBalance: loansSummaryData.totalDebt ?? 0,
          monthlyPayment: loansSummaryData.totalMonthlyPayments ?? 0,
          loansCount: loansSummaryData.loansCount ?? 0,
          upcomingPaymentAmount: null, // TODO: Add from upcoming payments query
          upcomingPaymentDate: null,
        }
      : null;

    // Net worth
    const netWorth = totalAssets - totalLiabilities;

    // Merge history data points from all categories
    // For now, use commodities history as it's the only one with real data
    // TODO: Implement proper multi-category history merging
    const historyDataPoints = commoditiesSummary?.historyDataPoints ?? [];

    // Calculate YTD from history
    let ytdProfitLoss: number | null = null;
    let ytdProfitLossPercent: number | null = null;

    if (historyDataPoints.length > 0) {
      const currentYear = new Date().getFullYear();
      const yearStartTimestamp = new Date(currentYear, 0, 1).getTime();

      // Find the closest data point to year start
      const yearStartPoint = historyDataPoints.find(
        (p) => p.timestamp >= yearStartTimestamp,
      );

      if (yearStartPoint) {
        const valueAtYearStart = yearStartPoint.value;
        ytdProfitLoss = totalAssets - valueAtYearStart;
        if (valueAtYearStart > 0) {
          ytdProfitLossPercent = (ytdProfitLoss / valueAtYearStart) * 100;
        }
      }
    }

    return {
      totalAssets,
      totalLiabilities,
      netWorth,
      totalCostBasis,
      unrealizedProfitLoss,
      unrealizedProfitLossPercent,
      ytdProfitLoss,
      ytdProfitLossPercent,
      assetCategories,
      liabilities,
      historyDataPoints,
    };
  }, [
    userId,
    commoditiesSummary,
    equitiesSummary,
    bondsSummary,
    cryptoSummary,
    realEstateSummary,
    cashSummary,
    collectiblesSummary,
    loansSummaryData,
  ]);

  return { summary, isLoading };
}
