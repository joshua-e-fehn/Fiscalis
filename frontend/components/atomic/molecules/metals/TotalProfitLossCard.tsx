"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import type { MetalsDisplayCurrency } from "@/lib/types/metals";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";

interface TotalProfitLossCardProps {
  profitLoss: number | null;
  profitLossPercent: number | null;
  bestPerformer?: {
    metal: string;
    percentage: number;
  };
  currency: MetalsDisplayCurrency;
  isLoading?: boolean;
  className?: string;
}

export function TotalProfitLossCard({
  profitLoss,
  profitLossPercent,
  currency,
  isLoading = false,
  className,
}: TotalProfitLossCardProps) {
  const t = useTranslations("metals.performance");
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("totalProfitLossTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-24 bg-muted animate-pulse rounded mt-2" />
        </CardContent>
      </Card>
    );
  }

  const isProfit = (profitLoss ?? 0) >= 0;

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {isProfit ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          {t("totalProfitLossTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {profitLoss !== null && profitLossPercent !== null ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={cn(
                "text-3xl font-bold",
                isProfit ? "text-profit" : "text-loss",
              )}
            >
              {formatCurrency(profitLoss, currency, { showSign: true })}
            </span>
            <span
              className={cn(
                "text-xl font-semibold",
                isProfit ? "text-profit" : "text-loss",
              )}
            >
              ({formatPercent(profitLossPercent, true)})
            </span>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">
            {t("totalProfitLossEmpty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
