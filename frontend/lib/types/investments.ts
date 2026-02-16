/**
 * Investment Category Dashboard Types
 *
 * Shared types for the investment category overview dashboards
 * that display KPIs, allocation charts, and performance metrics.
 */

import { ReactNode } from "react";

// Re-export from the single source of truth
export type { InvestmentCategory } from "./classification";

/**
 * Currency options for displaying values
 */
export type InvestmentCurrency = "eur" | "usd" | "chf";

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
