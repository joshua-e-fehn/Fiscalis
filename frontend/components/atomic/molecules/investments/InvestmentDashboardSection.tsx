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

import { ReactNode, useMemo, useState } from "react";
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
import { currencySuffixes } from "@/lib/utils/currency";
import {
  useCategoryChartData,
  useCategoryYTD,
  useCategoryProfitLoss,
} from "@/hooks/performance";
import { TIME_RANGE_LABEL_MAP } from "@/lib/performance";
import type { ChartTimeRange } from "@/components/atomic/molecules/metals/PortfolioChart";
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
import { partialCoveragePercent } from "@/../services/portfolio/unrealizedProfitLoss";

/** A short date for "since …" notes on the KPI cards */
function formatSince(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * The YTD card's title (D2): a return when it is net of purchases and
 * deposits, else a plain change.
 */
function ytdTitle(flowAdjusted: boolean, flowsEstimated: boolean): string {
  if (!flowAdjusted) return "YTD Change";
  return flowsEstimated ? "YTD Return (est.)" : "YTD Return";
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type KPICardType =
  | "total-value"
  | "profit-loss"
  | "ytd-performance"
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
  /**
   * Colour a rise as a loss and a fall as a gain (a debt going down is
   * good). Defaults to true for the liabilities category.
   */
  invertColors?: boolean;
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
          {formattedValue}
          {currencySuffixes[currency]}
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
  /** Shown under the figure, e.g. what it is measured since */
  note?: string | null;
  /** A rise is bad (liabilities) */
  invertColors?: boolean;
}

/**
 * A return in percent, signed and coloured by its own sign: a time-weighted
 * return can fall while the money P/L rises (a loss, then a deposit that
 * grows), so it never takes the amount's sign.
 */
function SignedPercent({
  percent,
  invertColors = false,
}: {
  percent: number;
  invertColors?: boolean;
}) {
  const formatted = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(percent));
  // A loss that rounds to 0.00 shows as +0.00, not -0.00
  const isGain = percent >= 0 || formatted === "0.00";
  return (
    <span
      className={cn(
        "text-xl font-semibold",
        isGain !== invertColors ? "text-profit" : "text-loss",
      )}
    >
      ({isGain ? "+" : "-"}
      {formatted}%)
    </span>
  );
}

function ProfitLossCard({
  profitLoss,
  profitLossPercent,
  currency,
  isLoading,
  hasHoldings,
  title = "Total Profit / Loss",
  note = null,
  invertColors = false,
}: ProfitLossCardProps) {
  if (isLoading) {
    return <KPICardSkeleton title={title} />;
  }

  const hasData = hasHoldings && profitLoss !== null;
  const isProfit = (profitLoss ?? 0) >= 0;

  const formattedValue = hasData
    ? new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(profitLoss!))
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
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={cn(
                  "text-3xl font-bold",
                  isProfit !== invertColors ? "text-profit" : "text-loss",
                )}
              >
                {isProfit ? "+" : "-"}
                {formattedValue}
                {currencySuffixes[currency]}
              </span>
              {profitLossPercent !== null && (
                <SignedPercent
                  percent={profitLossPercent}
                  invertColors={invertColors}
                />
              )}
            </div>
            {note && (
              <p className="text-xs text-muted-foreground mt-1">{note}</p>
            )}
          </>
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
  /** First known value when there is none at 1 Jan */
  trackingSince: number | null;
  /** Some values are incomplete (a missing price, a partly failed sync) */
  partial: boolean;
  currency: InvestmentCurrency;
  isLoading: boolean;
  hasHoldings: boolean;
  title: string;
  /** A rise is bad (liabilities) */
  invertColors?: boolean;
}

function YTDPerformanceCard({
  ytdProfitLoss,
  ytdProfitLossPercent,
  trackingSince,
  partial,
  currency,
  isLoading,
  hasHoldings,
  title,
  invertColors = false,
}: YTDPerformanceCardProps) {
  if (isLoading) {
    return <KPICardSkeleton title={title} />;
  }

  const hasData = hasHoldings && ytdProfitLoss !== null;
  const isProfit = (ytdProfitLoss ?? 0) >= 0;

  const formattedValue = hasData
    ? new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(ytdProfitLoss!))
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
                  isProfit !== invertColors ? "text-profit" : "text-loss",
                )}
              >
                {isProfit ? "+" : "-"}
                {formattedValue}
                {currencySuffixes[currency]}
              </span>
              {ytdProfitLossPercent !== null && (
                <SignedPercent
                  percent={ytdProfitLossPercent}
                  invertColors={invertColors}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Since Jan 1, {currentYear}
              {partial && " · partial: a sync failed or a price is missing"}
            </p>
          </>
        ) : (
          <div className="text-muted-foreground text-sm">
            {!hasHoldings
              ? "No holdings yet"
              : trackingSince !== null
                ? `Not enough history (tracked since ${formatSince(trackingSince)})`
                : "No data for this year yet"}
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
  invertColors = category === "liabilities",
  className,
}: InvestmentDashboardSectionProps) {
  // ─────────────────────────────────────────────────────────────
  // Performance Calculations
  // ─────────────────────────────────────────────────────────────

  // YTD of the category from the one performance entry point: the resolver
  // values sources with a price feed (vault metals) continuously and the
  // rest from snapshots (hybrid), so no preset picks a strategy
  const needsYTD = kpiCards.some((c) => c.type === "ytd-performance");
  const categoryYTD = useCategoryYTD(category, {
    enabled: needsYTD && !isLoading,
  });

  // One P/L resolution (holdings cost basis, else the performance since
  // tracking started) for the KPI card
  const holdingsPL = useMemo(
    () =>
      summary
        ? {
            costBasis: summary.totalCost,
            profitLoss: summary.profitLoss,
            profitLossPercent: summary.profitLossPercent,
          }
        : null,
    [summary],
  );
  const plData = useCategoryProfitLoss({
    category,
    currentValue: summary?.totalValue ?? 0,
    holdings: holdingsPL,
    enabled: !isLoading && (summary?.totalValue ?? 0) > 0,
  });
  const { profitLoss, profitLossPercent, costBasis } = plData;

  // Without a holdings cost basis the card shows the performance since
  // tracking started: a profit only when it is net of known flows
  const sinceTrackingProfit =
    plData.source === "since-tracking" &&
    plData.flowAdjusted &&
    !plData.flowsEstimated;
  const plTitle =
    plData.source !== "since-tracking"
      ? undefined
      : sinceTrackingProfit
        ? "Profit / Loss since tracking started"
        : "Change since tracking started";
  // A cost-basis P/L covers only the holdings that have a cost basis
  const coveredPercent =
    plData.source === "cost-basis"
      ? partialCoveragePercent(summary?.profitLossCoverage)
      : null;
  const plNote =
    plData.since !== null
      ? `Since ${formatSince(plData.since)}${
          sinceTrackingProfit ? ", net of purchases and deposits" : ""
        }`
      : coveredPercent !== null
        ? `On ${coveredPercent}% of the value: holdings without a cost basis are left out`
        : null;

  // The chart: the engine's series for the category over the selected
  // range (snapshot categoryBreakdown, the vault at spot), with its cost line.
  // Loaded exactly when that default chart renders: no custom chart given
  // (null or undefined)
  const showsDefaultChart = customPerformanceChart == null;
  const [chartRange, setChartRange] = useState<ChartTimeRange>("3M");
  const chart = useCategoryChartData(
    category,
    TIME_RANGE_LABEL_MAP[chartRange],
    { enabled: !isLoading && showsDefaultChart },
  );

  // YTD values for custom cards
  const ytdProfitLoss = categoryYTD.ytdProfitLoss;
  const ytdProfitLossPercent = categoryYTD.ytdProfitLossPercent;

  // P/L loading: only show loading when there ARE holdings and P/L is calculating
  // If there are no holdings, we show "No holdings yet" immediately (not skeleton)
  const hasHoldings = (summary?.totalValue ?? 0) > 0;
  const isPLLoading = isLoading || (hasHoldings && plData.isLoading);

  // Count accounts for cash category. topHoldings is capped per
  // subcategory, so sum the full holdingsCount instead.
  const accountsCount =
    summary?.subcategories.reduce(
      (count, sub) => count + sub.holdingsCount,
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
            title={config.title ?? plTitle}
            note={plNote}
            invertColors={invertColors}
          />
        );

      case "ytd-performance":
        return (
          <YTDPerformanceCard
            key={key}
            ytdProfitLoss={categoryYTD.ytdProfitLoss}
            ytdProfitLossPercent={categoryYTD.ytdProfitLossPercent}
            trackingSince={categoryYTD.trackingSince}
            partial={categoryYTD.partial}
            currency={currency}
            isLoading={isLoading || (hasHoldings && categoryYTD.isLoading)}
            hasHoldings={hasHoldings}
            title={
              config.title ??
              ytdTitle(categoryYTD.flowAdjusted, categoryYTD.flowsEstimated)
            }
            invertColors={invertColors}
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
        {showsDefaultChart ? (
          <CategoryPerformanceChart
            dataPoints={chart.dataPoints}
            timeRange={chartRange}
            onTimeRangeChange={setChartRange}
            partial={chart.partial}
            currency={currency}
            isLoading={isLoading || chart.isLoading}
            title={performanceChartTitle}
            emptyHint={
              hasHoldings
                ? "History appears after the next daily snapshot"
                : undefined
            }
          />
        ) : (
          customPerformanceChart
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
