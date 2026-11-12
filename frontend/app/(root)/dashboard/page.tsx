"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
  useBaseCurrency,
  usePortfolioOverview,
  AssetCategoryData,
  LiabilitiesSummaryData,
} from "@/hooks/convex/portfolio";
import {
  CategoryPerformanceChart,
  UnifiedPositionsTable,
  PageHeader,
  type ChartViewMode,
} from "@/components/atomic/molecules/investments";
import type { ChartTimeRange } from "@/components/atomic/molecules/metals";
import { RetirementTeaserCard } from "@/components/atomic/molecules/retirement";
import { InvestmentCurrency } from "@/lib/types/investments";
import { formatCurrency } from "@/lib/utils/currency";
import { liabilityCountsLabel } from "@/../services/portfolio/aggregate";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  CreditCard,
  ArrowRight,
  Minus,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useNetWorthYTD, usePortfolioChartData } from "@/hooks/performance";
import { TIME_RANGE_LABEL_MAP } from "@/lib/performance";
import { partialCoveragePercent } from "@/../services/portfolio/unrealizedProfitLoss";

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════
// Hero KPI Cards
// ═══════════════════════════════════════════════════════════════

interface HeroKPICardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  currency: InvestmentCurrency;
  isLoading?: boolean;
  variant?: "default" | "profit" | "loss" | "neutral";
  className?: string;
}

function HeroKPICard({
  title,
  value,
  subtitle,
  icon,
  currency,
  isLoading = false,
  variant = "default",
  className,
}: HeroKPICardProps) {
  const variantStyles = {
    default: "",
    profit: "border-profit/30 bg-profit/5",
    loss: "border-loss/30 bg-loss/5",
    neutral: "",
  };

  return (
    <Card className={cn(variantStyles[variant], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <>
            <div
              className={cn(
                "text-2xl font-bold",
                variant === "profit" && "text-profit",
                variant === "loss" && "text-loss",
              )}
            >
              {formatCurrency(value, currency)}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// YTD Net Worth Change Card
// ═══════════════════════════════════════════════════════════════

interface YTDNetWorthCardProps {
  ytdChange: number | null;
  ytdChangePercent: number | null;
  /** First snapshot time when there is no snapshot at or before Jan 1 */
  trackingSince: number | null;
  currency: InvestmentCurrency;
  isLoading?: boolean;
}

function YTDNetWorthCard({
  ytdChange,
  ytdChangePercent,
  trackingSince,
  currency,
  isLoading = false,
}: YTDNetWorthCardProps) {
  const isPositive = (ytdChange ?? 0) >= 0;
  const hasData = ytdChange !== null;

  return (
    <Card
      className={cn(
        hasData && isPositive && "border-profit/30 bg-profit/5",
        hasData && !isPositive && "border-loss/30 bg-loss/5",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          YTD Net Worth
        </CardTitle>
        <div className="text-muted-foreground">
          <Calendar className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-32" />
        ) : hasData ? (
          <>
            <div
              className={cn(
                "text-2xl font-bold flex items-center gap-1",
                isPositive ? "text-profit" : "text-loss",
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
              {isPositive ? "+" : ""}
              {formatCurrency(ytdChange, currency)}
            </div>
            {ytdChangePercent !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatPercent(ytdChangePercent)} change since Jan 1
              </p>
            )}
          </>
        ) : (
          <div className="text-muted-foreground">
            <div className="text-2xl font-bold flex items-center gap-1">
              <Minus className="h-4 w-4" />
            </div>
            <p className="text-xs mt-1">
              {trackingSince !== null
                ? `Not enough history (tracking since ${new Date(
                    trackingSince,
                  ).toLocaleDateString("de-DE")})`
                : "No data for this year"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Net Worth Card (Primary)
// ═══════════════════════════════════════════════════════════════

interface NetWorthCardProps {
  netWorth: number;
  profitLoss: number | null;
  profitLossPercent: number | null;
  /** Share of assets (0..1) the unrealised P/L is computed over */
  profitLossCoverage: number | null;
  currency: InvestmentCurrency;
  isLoading?: boolean;
}

function NetWorthCard({
  netWorth,
  profitLoss,
  profitLossPercent,
  profitLossCoverage,
  currency,
  isLoading = false,
}: NetWorthCardProps) {
  const isProfit = (profitLoss ?? 0) >= 0;
  // Only call out coverage when part of the assets has no cost basis.
  const coveredPercent = partialCoveragePercent(profitLossCoverage);
  const coverageLabel =
    coveredPercent !== null ? ` on ${coveredPercent}% of assets` : "";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Total Net Worth
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-48" />
        ) : (
          <>
            <div className="text-4xl font-bold tracking-tight">
              {formatCurrency(netWorth, currency)}
            </div>
            {profitLoss !== null && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2 text-sm",
                  isProfit ? "text-profit" : "text-loss",
                )}
              >
                {isProfit ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="font-medium">
                  {formatCurrency(Math.abs(profitLoss), currency)}
                </span>
                <span className="text-muted-foreground">
                  ({formatPercent(profitLossPercent)}) unrealized
                  {coverageLabel}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Asset Allocation Chart
// ═══════════════════════════════════════════════════════════════

interface AllocationChartProps {
  categories: AssetCategoryData[];
  totalAssets: number;
  currency: InvestmentCurrency;
  isLoading?: boolean;
}

function AllocationChart({
  categories,
  totalAssets,
  currency,
  isLoading = false,
}: AllocationChartProps) {
  // Filter to only categories with value
  const activeCategories = categories.filter((cat) => cat.totalValue > 0);

  // Calculate percentages
  const chartData = activeCategories.map((cat) => ({
    name: cat.name,
    value: cat.totalValue,
    color: cat.color,
    percent: totalAssets > 0 ? (cat.totalValue / totalAssets) * 100 : 0,
    href: cat.href,
  }));

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Asset Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px]">
            <Skeleton className="h-[200px] w-[200px] rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activeCategories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Asset Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
            <PiggyBank className="h-12 w-12 mb-2 opacity-50" />
            <p>No assets to display</p>
            <p className="text-sm">Add investments to see your allocation</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Asset Allocation</CardTitle>
        <CardDescription>
          Distribution across investment categories
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Chart */}
          <div className="h-[200px] w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={0}
                  dataKey="value"
                  minAngle={3}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0)
                      return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-card border rounded-lg p-2 shadow-lg">
                        <p className="font-medium">{data.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(data.value, currency)} (
                          {data.percent.toFixed(1)}%)
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2">
            {chartData.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm font-medium">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {cat.percent.toFixed(1)}%
                  </span>
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Category Cards Grid
// ═══════════════════════════════════════════════════════════════

interface CategoryCardProps {
  category: AssetCategoryData;
  currency: InvestmentCurrency;
}

function CategoryCard({ category, currency }: CategoryCardProps) {
  const hasValue = category.totalValue > 0;
  const isProfit = (category.profitLoss ?? 0) >= 0;

  return (
    <Link href={category.href}>
      <Card className="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-md"
                style={{ backgroundColor: `${category.color}20` }}
              >
                {category.icon}
              </div>
              <CardTitle className="text-sm font-medium">
                {category.name}
              </CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {hasValue ? (
            <>
              <div className="text-xl font-semibold">
                {formatCurrency(category.totalValue, currency)}
              </div>
              {category.profitLoss !== null && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs mt-1",
                    isProfit ? "text-profit" : "text-loss",
                  )}
                >
                  {isProfit ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{formatPercent(category.profitLossPercent)}</span>
                </div>
              )}
              {category.holdingsCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {category.holdingsCount} holding
                  {category.holdingsCount !== 1 ? "s" : ""}
                </p>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">
              <div className="text-xl font-semibold flex items-center gap-1">
                <Minus className="h-4 w-4" />
              </div>
              <p className="text-xs mt-1">
                {category.implemented ? "No holdings" : "Coming soon"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════
// Liabilities Summary Card
// ═══════════════════════════════════════════════════════════════

interface LiabilitiesCardProps {
  liabilities: LiabilitiesSummaryData;
  currency: InvestmentCurrency;
  isLoading?: boolean;
}

function LiabilitiesCard({
  liabilities,
  currency,
  isLoading = false,
}: LiabilitiesCardProps) {
  const { totalBalance, monthlyPayment, loansCount, accountsCount } =
    liabilities;
  const countsLabel = liabilityCountsLabel(accountsCount, loansCount);
  return (
    <Link href="/liabilities">
      <Card className="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer border-loss/20 bg-loss/5 h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Liabilities
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <>
              <div className="text-xl font-semibold text-loss">
                {formatCurrency(totalBalance, currency)}
              </div>
              {countsLabel && (
                <p className="text-xs text-muted-foreground mt-1">
                  {countsLabel}
                </p>
              )}
              {monthlyPayment > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(monthlyPayment, currency)}/month in loan
                  payments
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Dashboard Page
// ═══════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const currency = useBaseCurrency();
  const { summary, isLoading } = usePortfolioOverview();
  // The live totals the headline cards show: the YTD card and the chart end
  // there (PF-05). Without any holdings or debt there is nothing to plot.
  const live =
    summary && (summary.totalAssets !== 0 || summary.totalLiabilities !== 0)
      ? summary
      : undefined;
  const netWorthYTD = useNetWorthYTD({ live, enabled: !isLoading });

  // Portfolio chart: the engine's series for the selected range and view,
  // nothing before tracking started
  const [chartRange, setChartRange] = React.useState<ChartTimeRange>("3M");
  const [chartView, setChartView] =
    React.useState<ChartViewMode>("portfolio");
  const portfolioChart = usePortfolioChartData({
    timeRange: TIME_RANGE_LABEL_MAP[chartRange],
    metric: chartView === "networth" ? "netWorth" : "totalAssets",
    live,
    enabled: !isLoading,
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle="Your complete financial overview"
      />

      {/* Row 1: Net Worth + Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Net Worth - spans 2 columns on lg */}
        <div className="lg:col-span-2">
          <NetWorthCard
            netWorth={summary?.netWorth ?? 0}
            profitLoss={summary?.unrealizedProfitLoss ?? null}
            profitLossPercent={summary?.unrealizedProfitLossPercent ?? null}
            profitLossCoverage={summary?.unrealizedProfitLossCoverage ?? null}
            currency={currency}
            isLoading={isLoading}
          />
        </div>

        {/* Total Assets */}
        <HeroKPICard
          title="Total Assets"
          value={summary?.totalAssets ?? 0}
          icon={<PiggyBank className="h-4 w-4" />}
          currency={currency}
          isLoading={isLoading}
          variant="profit"
        />

        {/* Total Liabilities */}
        <HeroKPICard
          title="Total Liabilities"
          value={summary?.totalLiabilities ?? 0}
          icon={<CreditCard className="h-4 w-4" />}
          currency={currency}
          isLoading={isLoading}
          variant={(summary?.totalLiabilities ?? 0) > 0 ? "loss" : "neutral"}
        />

        {/* YTD Net Worth Change */}
        <YTDNetWorthCard
          ytdChange={netWorthYTD.ytdChange}
          ytdChangePercent={netWorthYTD.ytdChangePercent}
          trackingSince={netWorthYTD.trackingSince}
          currency={currency}
          isLoading={netWorthYTD.isLoading}
        />
      </div>

      {/* Row 2: Allocation Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AllocationChart
          categories={summary?.assetCategories ?? []}
          totalAssets={summary?.totalAssets ?? 0}
          currency={currency}
          isLoading={isLoading}
        />
        <CategoryPerformanceChart
          dataPoints={portfolioChart.dataPoints}
          timeRange={chartRange}
          onTimeRangeChange={setChartRange}
          viewMode={chartView}
          onViewModeChange={setChartView}
          currency={currency}
          isLoading={isLoading || portfolioChart.isLoading}
          title="Portfolio Development"
        />
      </div>

      {/* Retirement planner teaser */}
      <RetirementTeaserCard />

      {/* Row 3: Category Cards + Liabilities */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Investment Categories</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {summary?.assetCategories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              currency={currency}
            />
          ))}

          {/* Liabilities Card */}
          {summary?.liabilities && (
            <LiabilitiesCard
              liabilities={summary.liabilities}
              currency={currency}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>

      {/* Row 4: Unified Positions Table */}
      <div className="mb-6">
        <UnifiedPositionsTable
          currency={currency}
          maxRows={10}
          showFilters={true}
        />
      </div>

      {/* Loading skeletons for categories */}
      {isLoading && !summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-20 mb-2" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
