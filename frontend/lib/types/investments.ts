/**
 * Investment Category Dashboard Types
 *
 * Shared types for the investment category overview dashboards
 * that display KPIs, allocation charts, and performance metrics.
 */

import { ReactNode } from "react";

/**
 * Currency options for displaying values
 */
export type InvestmentCurrency = "eur" | "usd" | "chf";

/**
 * Investment category identifiers
 */
export type InvestmentCategory =
  | "equities"
  | "commodities"
  | "bonds"
  | "real-estate"
  | "cash"
  | "crypto"
  | "collectibles"
  | "liabilities";

/**
 * Represents a single holding within a subcategory
 */
export interface Holding {
  id: string;
  name: string;
  subcategoryId: string;
  value: number;
  costBasis: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  allocationPercent: number; // Percentage of total category value
  institutionName?: string; // Bank or broker name (e.g., "Deutsche Bank", "Alpaca")
}

/**
 * Data for a single subcategory within an investment category
 */
export interface SubcategoryData {
  id: string;
  name: string;
  href: string;
  icon: ReactNode;
  color: string; // Hex color for chart segments
  totalValue: number;
  costBasis: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  topHoldings: Holding[];
  holdingsCount: number;
  implemented: boolean;
}

/**
 * A single data point in the portfolio history
 */
export interface PortfolioDataPoint {
  date: string;
  timestamp: number;
  value: number;
  cost: number;
}

/**
 * Summary data for an entire investment category
 */
export interface CategorySummary {
  totalValue: number;
  totalCost: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtYearStart: number | null; // Value on Jan 1 of current year
  subcategories: SubcategoryData[];
  historyDataPoints: PortfolioDataPoint[];
}

/**
 * Props for the category dashboard section
 */
export interface CategoryDashboardProps {
  summary: CategorySummary | null;
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  emptyStateMessage?: string;
  emptyStateCTA?: {
    label: string;
    href: string;
  };
}

/**
 * Color palettes for different investment categories
 */
export const categoryColorPalettes: Record<
  InvestmentCategory,
  Record<string, string>
> = {
  equities: {
    primary: "#4F46E5", // Indigo - main category color
    stocks: "#4F46E5", // Indigo
    etfs: "#0EA5E9", // Sky blue
    funds: "#8B5CF6", // Violet
    options: "#F97316", // Orange
    private: "#EC4899", // Pink
  },
  commodities: {
    primary: "#FFD700", // Gold - main category color
    metals: "#FFD700", // Gold
    energy: "#F97316", // Orange
    industrial: "#64748B", // Slate
    agricultural: "#22C55E", // Green
    "rare-earth": "#A855F7", // Purple
    gemstones: "#06B6D4", // Cyan
  },
  bonds: {
    primary: "#1E40AF", // Blue - main category color
    government: "#1E40AF", // Blue
    corporate: "#059669", // Emerald
    municipal: "#7C3AED", // Purple
    savings: "#F59E0B", // Amber
    funds: "#6366F1", // Indigo
  },
  "real-estate": {
    primary: "#10B981", // Emerald - main category color
    residential: "#10B981", // Emerald
    commercial: "#3B82F6", // Blue
    reits: "#8B5CF6", // Violet
    crowdfunding: "#F59E0B", // Amber
    land: "#84CC16", // Lime
  },
  cash: {
    primary: "#22C55E", // Green - main category color
    "savings-accounts": "#22C55E", // Green
    "checking-accounts": "#10B981", // Emerald
    "money-market": "#0EA5E9", // Sky
    cds: "#6366F1", // Indigo
    "treasury-bills": "#F59E0B", // Amber
    forex: "#8B5CF6", // Violet
    "broker-cash": "#64748B", // Slate
  },
  crypto: {
    primary: "#F7931A", // Bitcoin orange - main category color
    bitcoin: "#F7931A", // Bitcoin orange
    ethereum: "#627EEA", // Ethereum blue
    altcoins: "#8B5CF6", // Violet
    stablecoins: "#22C55E", // Green
    defi: "#EC4899", // Pink
    nfts: "#06B6D4", // Cyan
  },
  collectibles: {
    primary: "#8B5CF6", // Violet - main category color
    art: "#8B5CF6", // Violet
    watches: "#0EA5E9", // Sky
    wine: "#DC2626", // Red
    cars: "#64748B", // Slate
    memorabilia: "#F59E0B", // Amber
    nfts: "#06B6D4", // Cyan
    other: "#6B7280", // Gray
  },
  liabilities: {
    primary: "#EF4444", // Red - main category color
    mortgages: "#EF4444", // Red
    loans: "#F97316", // Orange
    "credit-cards": "#F59E0B", // Amber
    "margin-loans": "#DC2626", // Dark red
  },
};

/**
 * Currency symbols mapping
 */
export const currencySymbols: Record<InvestmentCurrency, string> = {
  eur: "€",
  usd: "$",
  chf: "CHF ",
};

/**
 * Currency codes for Intl.NumberFormat
 */
export const currencyCodes: Record<InvestmentCurrency, string> = {
  eur: "EUR",
  usd: "USD",
  chf: "CHF",
};

/**
 * Format a number as currency
 */
export function formatCurrency(
  value: number,
  currency: InvestmentCurrency,
  options?: { compact?: boolean; showSign?: boolean },
): string {
  const { compact = false, showSign = false } = options ?? {};

  const formatted = new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyCodes[currency],
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(Math.abs(value));

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  }

  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Format a percentage value
 */
export function formatPercent(value: number, showSign = false): string {
  const formatted = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
  }

  return `${value < 0 ? "-" : ""}${formatted}%`;
}

/**
 * Calculate YTD performance
 *
 * YTD = performance from January 1 of current year to today
 *
 * Strategies:
 * 1. If we have a value at year start -> YTD = (current - yearStart) / yearStart
 * 2. If portfolio started this year -> YTD = (current - totalCost) as absolute gain
 * 3. If no data -> null
 */
export function calculateYTDPerformance(
  currentValue: number,
  totalCost: number | null,
  historyDataPoints: PortfolioDataPoint[],
): {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtYearStart: number | null;
} {
  if (currentValue === 0) {
    return {
      ytdProfitLoss: null,
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
    };
  }

  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1).getTime(); // Jan 1, 00:00:00

  // Find the value at the start of the year
  // Look for the most recent data point on or before Jan 1
  const pointsBeforeYearStart = historyDataPoints
    .filter((dp) => dp.timestamp <= startOfYear)
    .sort((a, b) => b.timestamp - a.timestamp);

  const valueAtYearStart = pointsBeforeYearStart[0]?.value ?? null;

  // Case 1: We have historical data from before this year
  if (valueAtYearStart !== null && valueAtYearStart > 0) {
    const ytdProfitLoss = currentValue - valueAtYearStart;
    const ytdProfitLossPercent = (ytdProfitLoss / valueAtYearStart) * 100;

    return {
      ytdProfitLoss,
      ytdProfitLossPercent,
      valueAtYearStart,
    };
  }

  // Case 2: Portfolio started this year (no data before Jan 1)
  // Show performance since first investment as YTD
  if (totalCost !== null && totalCost > 0) {
    const ytdProfitLoss = currentValue - totalCost;
    const ytdProfitLossPercent = (ytdProfitLoss / totalCost) * 100;

    return {
      ytdProfitLoss,
      ytdProfitLossPercent,
      valueAtYearStart: 0, // Started at 0 this year
    };
  }

  // Case 3: No meaningful data
  return {
    ytdProfitLoss: null,
    ytdProfitLossPercent: null,
    valueAtYearStart: null,
  };
}
