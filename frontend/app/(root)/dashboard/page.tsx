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
  usePortfolioOverview,
  AssetCategoryData,
} from "@/hooks/convex/portfolio";
import { CategoryPerformanceChart } from "@/components/atomic/molecules/investments";
import { currencyCodes, InvestmentCurrency } from "@/lib/types/investments";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  CreditCard,
  ArrowRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number, currency: InvestmentCurrency): string {
  const currencyCode = currencyCodes[currency];
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

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
// Net Worth Card (Primary)
// ═══════════════════════════════════════════════════════════════

interface NetWorthCardProps {
  netWorth: number;
  profitLoss: number | null;
  profitLossPercent: number | null;
  currency: InvestmentCurrency;
  isLoading?: boolean;
}

function NetWorthCard({
  netWorth,
  profitLoss,
  profitLossPercent,
  currency,
  isLoading = false,
}: NetWorthCardProps) {
  const isProfit = (profitLoss ?? 0) >= 0;

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
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
                  paddingAngle={2}
                  dataKey="value"
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
  totalBalance: number;
  monthlyPayment: number;
  loansCount: number;
  currency: InvestmentCurrency;
  isLoading?: boolean;
}

function LiabilitiesCard({
  totalBalance,
  monthlyPayment,
  loansCount,
  currency,
  isLoading = false,
}: LiabilitiesCardProps) {
  return (
    <Link href="/liabilities/loans">
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
              {loansCount > 0 && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">
                    {loansCount} active loan{loansCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(monthlyPayment, currency)}/month
                  </p>
                </>
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
  const currency: InvestmentCurrency = "eur";
  const { summary, isLoading } = usePortfolioOverview(currency);

  return (
    <div className="relative min-h-screen">
      <div className="container px-4 py-8 relative z-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Your complete financial overview
          </p>
        </div>

        {/* Row 1: Net Worth + Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Net Worth - spans 2 columns on lg */}
          <div className="lg:col-span-2">
            <NetWorthCard
              netWorth={summary?.netWorth ?? 0}
              profitLoss={summary?.unrealizedProfitLoss ?? null}
              profitLossPercent={summary?.unrealizedProfitLossPercent ?? null}
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
        </div>

        {/* Row 2: Allocation Chart + Performance Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <AllocationChart
            categories={summary?.assetCategories ?? []}
            totalAssets={summary?.totalAssets ?? 0}
            currency={currency}
            isLoading={isLoading}
          />
          <CategoryPerformanceChart
            dataPoints={summary?.historyDataPoints ?? []}
            currentValue={summary?.totalAssets ?? 0}
            totalCost={summary?.totalCostBasis ?? null}
            totalLiabilities={summary?.totalLiabilities ?? 0}
            currency={currency}
            isLoading={isLoading}
            showViewToggle={true}
          />
        </div>

        {/* Row 3: Category Cards + Liabilities */}
        <div className="mb-6">
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
                totalBalance={summary.liabilities.totalBalance}
                monthlyPayment={summary.liabilities.monthlyPayment}
                loansCount={summary.liabilities.loansCount}
                currency={currency}
                isLoading={isLoading}
              />
            )}
          </div>
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
    </div>
  );
}
