/**
 * Portfolio Overview Hook
 *
 * The dashboard's net worth, category cards and liabilities card, read from
 * portfolio.getOverview: the same server-side loader and aggregator as the
 * snapshots and GET /api/v1/net-worth, so every surface shows one figure.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  InvestmentCategory,
  InvestmentCurrency,
} from "@/lib/types/investments";
import { categoryPrimaryColors } from "@/lib/config/categoryUI";
import { useUserSettings } from "./onboarding";
import { costLine } from "@/../services/portfolio/unrealizedProfitLoss";
import {
  Briefcase,
  Coins,
  Receipt,
  Building2,
  Banknote,
  Bitcoin,
  Gem,
  HelpCircle,
} from "lucide-react";
import React from "react";

// ═══════════════════════════════════════════════════════════════
// Base currency
// ═══════════════════════════════════════════════════════════════

/**
 * Base currencies the stored values can be in. Every *InBaseCurrency field
 * and the FX mirror are EUR-based, so EUR is the only one today.
 */
const SUPPORTED_BASE_CURRENCIES: readonly InvestmentCurrency[] = ["eur"];

/**
 * The user's base currency, from userSettings.defaultCurrency, for display
 * and formatting (lib/utils/currency formatCurrency). A preference the data
 * cannot be shown in yet falls back to EUR.
 */
export function useBaseCurrency(): InvestmentCurrency {
  const preferred = useUserSettings()?.defaultCurrency?.toLowerCase();
  return (
    SUPPORTED_BASE_CURRENCIES.find((c) => c === preferred) ??
    SUPPORTED_BASE_CURRENCIES[0]
  );
}

// ═══════════════════════════════════════════════════════════════
// Overview
// ═══════════════════════════════════════════════════════════════

/** A dashboard category: an investment category or unclassified holdings */
export type AssetCategoryId = Exclude<InvestmentCategory, "liabilities">
  | "unclassified";

/**
 * Asset category data for portfolio overview
 */
export interface AssetCategoryData {
  id: AssetCategoryId;
  name: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  totalValue: number;
  /** Cost basis of the holdings that have one */
  costBasis: number | null;
  /** P/L over the holdings costBasis covers (never the uncovered value) */
  profitLoss: number | null;
  profitLossPercent: number | null;
  holdingsCount: number;
  implemented: boolean;
}

/**
 * Liabilities summary for portfolio overview
 */
export interface LiabilitiesSummaryData {
  /** Amount owed in the base currency */
  totalBalance: number;
  /** Loans' scheduled payments as a monthly equivalent */
  monthlyPayment: number;
  /** Manual loans counted as liabilities (active, defaulted) */
  loansCount: number;
  /**
   * Liability accounts other than loans (credit cards, provider loan
   * accounts, margin debits); loans are counted in loansCount only
   */
  accountsCount: number;
}

/**
 * Combined portfolio summary
 */
export interface PortfolioSummary {
  // Net worth calculation
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;

  // Overall performance, over cost-bearing categories only
  totalCostBasis: number | null;
  /** Chart cost line: totalAssets − unrealizedProfitLoss (see costLine) */
  costLine: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercent: number | null;
  /** Share of total assets (0..1) that the unrealised P/L covers */
  unrealizedProfitLossCoverage: number | null;

  // Category breakdown
  assetCategories: AssetCategoryData[];

  // Liabilities
  liabilities: LiabilitiesSummaryData | null;

  /** Data freshness: oldest provider sync or spot price (ms) */
  asOf: number | null;
}

const ICON = { className: "h-4 w-4" };

/** Display metadata per dashboard category, in card order. */
const CATEGORY_CARDS: Array<{
  id: AssetCategoryId;
  name: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  implemented: boolean;
}> = [
  { id: "equities", name: "Equities", href: "/assets/equities", icon: React.createElement(Briefcase, ICON), color: categoryPrimaryColors.equities, implemented: true },
  { id: "commodities", name: "Commodities", href: "/assets/commodities", icon: React.createElement(Coins, ICON), color: categoryPrimaryColors.commodities, implemented: true },
  { id: "bonds", name: "Bonds", href: "/assets/bonds", icon: React.createElement(Receipt, ICON), color: categoryPrimaryColors.bonds, implemented: true },
  { id: "real-estate", name: "Real Estate", href: "/assets/real-estate", icon: React.createElement(Building2, ICON), color: categoryPrimaryColors["real-estate"], implemented: true },
  { id: "cash", name: "Cash & Savings", href: "/assets/cash", icon: React.createElement(Banknote, ICON), color: categoryPrimaryColors.cash, implemented: true },
  { id: "crypto", name: "Cryptocurrency", href: "/assets/crypto", icon: React.createElement(Bitcoin, ICON), color: categoryPrimaryColors.crypto, implemented: true },
  { id: "collectibles", name: "Collectibles", href: "/assets/collectibles", icon: React.createElement(Gem, ICON), color: categoryPrimaryColors.collectibles, implemented: false },
  // Holdings without a known category: counted in the totals, shown only
  // when there are any
  { id: "unclassified", name: "Unclassified", href: "/integrations", icon: React.createElement(HelpCircle, ICON), color: "#94a3b8", implemented: true },
];

/**
 * Hook to get the complete portfolio overview (base currency).
 */
export function usePortfolioOverview(): {
  summary: PortfolioSummary | null;
  isLoading: boolean;
} {
  const overview = useQuery(api.portfolio.getOverview);
  const isLoading = overview === undefined;

  const summary = useMemo<PortfolioSummary | null>(() => {
    if (!overview) return null;

    const byId = new Map(overview.categories.map((c) => [c.category, c]));
    const assetCategories: AssetCategoryData[] = CATEGORY_CARDS.flatMap(
      (card) => {
        const c = byId.get(card.id);
        if (card.id === "unclassified" && !c?.count) return [];
        return [
          {
            ...card,
            totalValue: c?.value ?? 0,
            costBasis: c?.costBasis ?? null,
            profitLoss: c?.profitLoss ?? null,
            profitLossPercent: c?.profitLossPercent ?? null,
            holdingsCount: c?.count ?? 0,
            implemented: card.implemented || (c?.count ?? 0) > 0,
          },
        ];
      },
    );

    const { totalAssets, unrealized } = overview;
    const totalCostLine = costLine(totalAssets, unrealized.profitLoss);

    return {
      totalAssets,
      totalLiabilities: overview.totalLiabilities,
      netWorth: overview.netWorth,
      totalCostBasis: unrealized.costBasis,
      costLine: totalCostLine,
      unrealizedProfitLoss: unrealized.profitLoss,
      unrealizedProfitLossPercent: unrealized.profitLossPercent,
      unrealizedProfitLossCoverage: unrealized.coverage,
      assetCategories,
      liabilities: overview.liabilities,
      asOf: overview.asOf,
    };
  }, [overview]);

  return { summary, isLoading };
}
