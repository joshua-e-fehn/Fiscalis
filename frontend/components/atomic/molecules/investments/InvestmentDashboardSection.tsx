"use client";

/**
 * Investment Dashboard Section
 *
 * A flexible, unified dashboard section for all investment category pages.
 * Supports configurable KPI cards that can be customized per category.
 *
 * Layout:
 * - Row 1: 3 configurable KPI cards
 * - Row 2: Allocation chart + Performance chart
 * - Row 3: Largest Holdings (optional, only shown when there are holdings)
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  CategorySummary,
  InvestmentCurrency,
  InvestmentCategory,
} from "@/lib/types/investments";
import { currencySymbols } from "@/lib/utils/currency";
import {
  useCategoryYTD,
  useCategoryProfitLoss,
  useMetalsYTD,
} from "@/hooks/performance";
import { CategoryAllocationChart } from "./CategoryAllocationChart";
import { CategoryPerformanceChart } from "./CategoryPerformanceChart";
import { TopHoldingsList } from "./TopHoldingsList";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  PieChart,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { MetalsCurrency } from "@/lib/types/metals-extended";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type KPICardType =
  | "total-value"
  | "profit-loss"
  | "ytd-performance"
  | "ytd-continuous" // For commodities with price-based YTD
  | "portfolio-allocation"
  | "accounts-count"
  | "custom";

export interface KPICardConfig {
  type: KPICardType;
  /** Custom title override */
  title?: string;
  /** Custom icon override */
  icon?: LucideIcon;
  /** For custom cards: render function */
  render?: (props: KPICardRenderProps) => ReactNode;
}

export interface KPICardRenderProps {
  summary: CategorySummary | null;
  currency: InvestmentCurrency;
  isLoading: boolean;
  // Computed values available for custom cards
  totalPortfolioAssets?: number;
  profitLoss?: number | null;
  profitLossPercent?: number | null;
  ytdProfitLoss?: number | null;
  ytdProfitLossPercent?: number | null;
  costBasis?: number | null;
}

export interface InvestmentDashboardSectionProps {
  /** The category identifier (used for YTD/P&L calculations) */
  category: InvestmentCategory;
  /** Summary data from the category hook */
  summary: CategorySummary | null;
  /** Display currency */
  currency?: InvestmentCurrency;
  /** Loading state */
  isLoading?: boolean;
  /** Whether to show the top holdings section */
  showTopHoldings?: boolean;
  /** Maximum holdings per subcategory in top holdings list */
  maxHoldingsPerSubcategory?: number;
  /** KPI card configurations (defaults to standard: value, P/L, YTD) */
  kpiCards?: [KPICardConfig, KPICardConfig, KPICardConfig];
  /** Total portfolio assets (for allocation percentage calculations) */
  totalPortfolioAssets?: number;
  /** Custom KPI cards row (replaces the entire KPI cards section) */
  customKPICards?: ReactNode;
  /** Custom allocation chart component (replaces default CategoryAllocationChart) */
  customAllocationChart?: ReactNode;
  /** Custom performance chart component (replaces default CategoryPerformanceChart) */
  customPerformanceChart?: ReactNode;
  /** Custom content to show between charts and holdings (e.g., metal type cards) */
  customContentBelowCharts?: ReactNode;
  /** Custom holdings component (replaces default TopHoldingsList) */
  customHoldingsSection?: ReactNode;
  /** Custom chart title */
  performanceChartTitle?: string;
  /** Additional class name */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════
// KPI Card Presets
// ═══════════════════════════════════════════════════════════════

/** Standard KPI cards: Total Value, P/L, YTD */
export const STANDARD_KPI_CARDS: [KPICardConfig, KPICardConfig, KPICardConfig] =
  [
    { type: "total-value" },
    { type: "profit-loss" },
    { type: "ytd-performance" },
  ];

/** Commodities KPI cards: Total Value, P/L, YTD (continuous/price-based) */
export const COMMODITIES_KPI_CARDS: [
  KPICardConfig,
  KPICardConfig,
  KPICardConfig,
] = [
  { type: "total-value" },
  { type: "profit-loss" },
  { type: "ytd-continuous" },
];

/** Cash KPI cards: Total Cash, Portfolio %, Accounts */
export const CASH_KPI_CARDS: [KPICardConfig, KPICardConfig, KPICardConfig] = [
  { type: "total-value", title: "Total Cash Holdings", icon: Wallet },
  { type: "portfolio-allocation" },
  { type: "accounts-count" },
];

// ═══════════════════════════════════════════════════════════════
// Loading Skeleton Component
// ═══════════════════════════════════════════════════════════════

function KPICardSkeleton({ title }: { title: string }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-9 w-40 bg-muted animate-pulse rounded" />
        <div className="h-4 w-24 bg-muted animate-pulse rounded mt-2" />
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// KPI Card Components
// ═══════════════════════════════════════════════════════════════

interface TotalValueCardProps {
  totalValue: number;
  currency: InvestmentCurrency;
  isLoading: boolean;
  title?: string;
  icon?: LucideIcon;
}

function TotalValueCard({
  totalValue,
  currency,
  isLoading,
  title = "Total Portfolio Value",
  icon: Icon = TrendingUp,
}: TotalValueCardProps) {
  if (isLoading) {
    return <KPICardSkeleton title={title} />;
  }

  const formattedValue = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(totalValue);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-3xl font-bold">
          {currencySymbols[currency]}
          {formattedValue}
        </span>
      </CardContent>
    </Card>
  );
}

interface ProfitLossCardProps {
  profitLoss: number | null;
  profitLossPercent: number | null;
  currency: InvestmentCurrency;
  isLoading: boolean;
  hasHoldings: boolean;
  title?: string;
}

function ProfitLossCard({
  profitLoss,
  profitLossPercent,
  currency,
  isLoading,
  hasHoldings,
  title = "Total Profit / Loss",
}: ProfitLossCardProps) {
  if (isLoading) {
    return <KPICardSkeleton title={title} />;
  }

  const hasData =
    hasHoldings && profitLoss !== null && profitLossPercent !== null;
  const isProfit = (profitLoss ?? 0) >= 0;

  const formattedValue = hasData
    ? new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(profitLoss!))
    : null;

  const formattedPercent = hasData
    ? new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(profitLossPercent!))
    : null;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {hasData ? (
            isProfit ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          ) : (
            <Minus className="h-4 w-4" />
          )}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={cn(
                "text-3xl font-bold",
                isProfit ? "text-profit" : "text-loss",
              )}
            >
              {isProfit ? "+" : "-"}
              {currencySymbols[currency]}
              {formattedValue}
            </span>
            <span
              className={cn(
                "text-xl font-semibold",
                isProfit ? "text-profit" : "text-loss",
              )}
            >
              ({isProfit ? "+" : "-"}
              {formattedPercent}%)
            </span>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">
            {hasHoldings
              ? "Add cost data to track performance"
              : "No holdings yet"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface YTDPerformanceCardProps {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  currency: InvestmentCurrency;
  isLoading: boolean;
  hasHoldings: boolean;
  title?: string;
}

function YTDPerformanceCard({
  ytdProfitLoss,
  ytdProfitLossPercent,
  currency,
  isLoading,
  hasHoldings,
  title = "YTD Performance",
}: YTDPerformanceCardProps) {
  if (isLoading) {
    return <KPICardSkeleton title={title} />;
  }

  const hasData =
    hasHoldings && ytdProfitLoss !== null && ytdProfitLossPercent !== null;
  const isProfit = (ytdProfitLoss ?? 0) >= 0;

  const formattedValue = hasData
    ? new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(ytdProfitLoss!))
    : null;

  const formattedPercent = hasData
    ? new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(ytdProfitLossPercent!))
    : null;

  const currentYear = new Date().getFullYear();

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {hasData ? (
            isProfit ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          ) : (
            <Minus className="h-4 w-4" />
          )}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={cn(
                  "text-3xl font-bold",
                  isProfit ? "text-profit" : "text-loss",
                )}
              >
                {isProfit ? "+" : "-"}
                {currencySymbols[currency]}
                {formattedValue}
              </span>
              <span
                className={cn(
                  "text-xl font-semibold",
                  isProfit ? "text-profit" : "text-loss",
                )}
              >
                ({isProfit ? "+" : "-"}
                {formattedPercent}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Since Jan 1, {currentYear}
            </p>
          </>
        ) : (
          <div className="text-muted-foreground text-sm">
            {hasHoldings ? "Calculating..." : "No holdings yet"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PortfolioAllocationCardProps {
  cashValue: number;
  totalPortfolioAssets: number;
  isLoading: boolean;
}

function PortfolioAllocationCard({
  cashValue,
  totalPortfolioAssets,
  isLoading,
}: PortfolioAllocationCardProps) {
  if (isLoading) {
    return <KPICardSkeleton title="Portfolio Allocation" />;
  }

  const hasData = totalPortfolioAssets > 0;
  const percentage = hasData ? (cashValue / totalPortfolioAssets) * 100 : 0;

  const formattedPercent = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(percentage);

  const isHighAllocation = percentage > 25;
  const isLowAllocation = percentage < 5;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <PieChart className="h-4 w-4" />
          Portfolio Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <>
            <span className="text-3xl font-bold">{formattedPercent}%</span>
            <p className="text-xs text-muted-foreground mt-1">
              {isHighAllocation
                ? "High cash position (conservative)"
                : isLowAllocation
                  ? "Low cash reserve"
                  : "of total portfolio"}
            </p>
          </>
        ) : (
          <div className="text-muted-foreground text-sm">
            Add assets to see allocation
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AccountsCountCardProps {
  accountsCount: number;
  isLoading: boolean;
}

function AccountsCountCard({
  accountsCount,
  isLoading,
}: AccountsCountCardProps) {
  if (isLoading) {
    return <KPICardSkeleton title="Active Accounts" />;
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Active Accounts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-3xl font-bold">{accountsCount}</span>
        <p className="text-xs text-muted-foreground mt-1">
          {accountsCount === 1 ? "account" : "accounts"} linked
        </p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function InvestmentDashboardSection({
  category,
  summary,
  currency = "eur",
  isLoading = false,
  showTopHoldings = true,
  maxHoldingsPerSubcategory = 3,
  kpiCards = STANDARD_KPI_CARDS,
  totalPortfolioAssets = 0,
  customKPICards,
  customAllocationChart,
  customPerformanceChart,
  customContentBelowCharts,
  customHoldingsSection,
  performanceChartTitle,
  className,
}: InvestmentDashboardSectionProps) {
  // ─────────────────────────────────────────────────────────────
  // Performance Calculations
  // ─────────────────────────────────────────────────────────────

  // Determine if we need discrete or continuous YTD
  const needsContinuousYTD = kpiCards.some((c) => c.type === "ytd-continuous");
  const needsDiscreteYTD = kpiCards.some((c) => c.type === "ytd-performance");

  // Discrete YTD (snapshot-based) for most categories
  const discreteYTD = useCategoryYTD(category, {
    enabled: needsDiscreteYTD && !isLoading,
  });

  // Continuous YTD (price-based) for commodities
  const continuousYTD = useMetalsYTD(currency as MetalsCurrency, {
    enabled: needsContinuousYTD && !isLoading,
  });

  // P/L calculation using first snapshot as cost basis when no explicit cost basis
  const plData = useCategoryProfitLoss({
    category,
    currentValue: summary?.totalValue ?? 0,
    explicitCostBasis: summary?.totalCost,
    enabled: !isLoading && (summary?.totalValue ?? 0) > 0,
  });

  // Computed values
  const profitLoss = summary?.profitLoss ?? plData.profitLoss;
  const profitLossPercent =
    summary?.profitLossPercent ?? plData.profitLossPercent;
  const costBasis = plData.costBasis ?? summary?.totalCost ?? null;

  // Select appropriate YTD values
  const ytdProfitLoss = needsContinuousYTD
    ? continuousYTD.ytdProfitLoss
    : discreteYTD.ytdProfitLoss;
  const ytdProfitLossPercent = needsContinuousYTD
    ? continuousYTD.ytdProfitLossPercent
    : discreteYTD.ytdProfitLossPercent;

  // Loading states
  const isYTDLoading = needsContinuousYTD
    ? continuousYTD.isLoading
    : discreteYTD.isLoading;

  // P/L loading: only show loading when there ARE holdings and P/L is calculating
  // If there are no holdings, we show "No holdings yet" immediately (not skeleton)
  const hasHoldings = (summary?.totalValue ?? 0) > 0;
  const isPLLoading = isLoading || (hasHoldings && plData.isLoading);

  // Count accounts for cash category
  const accountsCount =
    summary?.subcategories.reduce(
      (count, sub) => count + sub.topHoldings.length,
      0,
    ) ?? 0;

  // Check if there are holdings to show
  const hasTopHoldings =
    summary?.subcategories.some((s) => s.topHoldings.length > 0) ?? false;

  // ─────────────────────────────────────────────────────────────
  // Render KPI Card
  // ─────────────────────────────────────────────────────────────

  function renderKPICard(config: KPICardConfig, index: number) {
    const key = `kpi-${index}-${config.type}`;

    switch (config.type) {
      case "total-value":
        return (
          <TotalValueCard
            key={key}
            totalValue={summary?.totalValue ?? 0}
            currency={currency}
            isLoading={isLoading}
            title={config.title}
            icon={config.icon}
          />
        );

      case "profit-loss":
        return (
          <ProfitLossCard
            key={key}
            profitLoss={profitLoss}
            profitLossPercent={profitLossPercent}
            currency={currency}
            isLoading={isPLLoading}
            hasHoldings={hasHoldings}
            title={config.title}
          />
        );

      case "ytd-performance":
        return (
          <YTDPerformanceCard
            key={key}
            ytdProfitLoss={ytdProfitLoss}
            ytdProfitLossPercent={ytdProfitLossPercent}
            currency={currency}
            isLoading={isLoading || (hasHoldings && isYTDLoading)}
            hasHoldings={hasHoldings}
            title={config.title}
          />
        );

      case "ytd-continuous":
        return (
          <YTDPerformanceCard
            key={key}
            ytdProfitLoss={continuousYTD.ytdProfitLoss}
            ytdProfitLossPercent={continuousYTD.ytdProfitLossPercent}
            currency={currency}
            isLoading={isLoading || (hasHoldings && continuousYTD.isLoading)}
            hasHoldings={hasHoldings}
            title={config.title}
          />
        );

      case "portfolio-allocation":
        return (
          <PortfolioAllocationCard
            key={key}
            cashValue={summary?.totalValue ?? 0}
            totalPortfolioAssets={totalPortfolioAssets}
            isLoading={isLoading}
          />
        );

      case "accounts-count":
        return (
          <AccountsCountCard
            key={key}
            accountsCount={accountsCount}
            isLoading={isLoading}
          />
        );

      case "custom":
        if (config.render) {
          return (
            <div key={key}>
              {config.render({
                summary,
                currency,
                isLoading,
                totalPortfolioAssets,
                profitLoss,
                profitLossPercent,
                ytdProfitLoss,
                ytdProfitLossPercent,
                costBasis,
              })}
            </div>
          );
        }
        return null;

      default:
        return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-4", className)}>
      {/* Row 1: KPI Cards */}
      {customKPICards ?? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kpiCards.map((config, index) => renderKPICard(config, index))}
        </div>
      )}

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {customAllocationChart ?? (
          <CategoryAllocationChart
            subcategories={summary?.subcategories ?? []}
            isLoading={isLoading}
          />
        )}
        {customPerformanceChart ?? (
          <CategoryPerformanceChart
            dataPoints={summary?.historyDataPoints ?? []}
            currentValue={summary?.totalValue ?? 0}
            totalCost={costBasis}
            currency={currency}
            isLoading={isLoading}
            title={performanceChartTitle}
          />
        )}
      </div>

      {/* Optional: Custom content below charts (e.g., metal type cards) */}
      {customContentBelowCharts}

      {/* Row 3: Largest Holdings (only shown when there are holdings) */}
      {showTopHoldings &&
        hasTopHoldings &&
        (customHoldingsSection ?? (
          <TopHoldingsList
            subcategories={summary?.subcategories ?? []}
            currency={currency}
            maxHoldingsPerSubcategory={maxHoldingsPerSubcategory}
            isLoading={isLoading}
          />
        ))}
    </div>
  );
}
