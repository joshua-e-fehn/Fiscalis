"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";
import { InvestmentCurrency } from "@/lib/types/investments";
import { currencySymbols } from "@/lib/utils/currency";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CategoryValueCardProps {
  totalValue: number;
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
}

export function CategoryValueCard({
  totalValue,
  currency = "eur",
  isLoading = false,
  className,
}: CategoryValueCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-9 w-40 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const formattedValue = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(totalValue);

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Total Portfolio Value
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

interface CategoryProfitLossCardProps {
  profitLoss: number | null;
  profitLossPercent: number | null;
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
}

export function CategoryProfitLossCard({
  profitLoss,
  profitLossPercent,
  currency = "eur",
  isLoading = false,
  className,
}: CategoryProfitLossCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Profit / Loss
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-9 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-24 bg-muted animate-pulse rounded mt-2" />
        </CardContent>
      </Card>
    );
  }

  const hasData = profitLoss !== null && profitLossPercent !== null;
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
    <Card className={cn("h-full", className)}>
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
          Total Profit / Loss
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
            Add cost data to track performance
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CategoryYTDCardProps {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
}

export function CategoryYTDCard({
  ytdProfitLoss,
  ytdProfitLossPercent,
  currency = "eur",
  isLoading = false,
  className,
}: CategoryYTDCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            YTD Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-9 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-24 bg-muted animate-pulse rounded mt-2" />
        </CardContent>
      </Card>
    );
  }

  const hasData = ytdProfitLoss !== null && ytdProfitLossPercent !== null;
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

  // Get current year for the label
  const currentYear = new Date().getFullYear();

  return (
    <Card className={cn("h-full", className)}>
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
          YTD Performance
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
            Add holdings to track YTD performance
          </div>
        )}
      </CardContent>
    </Card>
  );
}
