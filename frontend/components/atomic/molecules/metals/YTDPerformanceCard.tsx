"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { MetalsCurrency } from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { CalendarDays, TrendingUp, TrendingDown } from "lucide-react";

interface YTDPerformanceCardProps {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  currency?: MetalsCurrency;
  isLoading?: boolean;
  className?: string;
}

const currencySymbols: Record<MetalsCurrency, string> = {
  eur: "€",
  usd: "$",
  chf: "CHF ",
};

export function YTDPerformanceCard({
  ytdProfitLoss,
  ytdProfitLossPercent,
  currency = "eur",
  isLoading = false,
  className,
}: YTDPerformanceCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            YTD Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
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

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          YTD Performance
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
            Add purchase prices to track YTD
          </div>
        )}
      </CardContent>
    </Card>
  );
}
