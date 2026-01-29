"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { MetalsCurrency } from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TotalProfitLossCardProps {
  profitLoss: number | null;
  profitLossPercent: number | null;
  bestPerformer?: {
    metal: string;
    percentage: number;
  };
  currency?: MetalsCurrency;
  isLoading?: boolean;
  className?: string;
}

const currencySymbols: Record<MetalsCurrency, string> = {
  eur: "€",
  usd: "$",
  chf: "CHF ",
};

export function TotalProfitLossCard({
  profitLoss,
  profitLossPercent,
  bestPerformer,
  currency = "eur",
  isLoading = false,
  className,
}: TotalProfitLossCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total P/L
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
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
          {isProfit ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
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
            Add purchase prices to track P/L
          </div>
        )}
      </CardContent>
    </Card>
  );
}
