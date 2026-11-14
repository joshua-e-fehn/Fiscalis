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
import { CalendarDays } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";

interface YTDPerformanceCardProps {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  /** The currency of the amounts (useMetalsYTD's `currency`) */
  currency: MetalsDisplayCurrency;
  isLoading?: boolean;
  className?: string;
}

export function YTDPerformanceCard({
  ytdProfitLoss,
  ytdProfitLossPercent,
  currency,
  isLoading = false,
  className,
}: YTDPerformanceCardProps) {
  const t = useTranslations("metals.performance");
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("ytdTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-24 bg-muted animate-pulse rounded mt-2" />
        </CardContent>
      </Card>
    );
  }

  const isProfit = (ytdProfitLoss ?? 0) >= 0;

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {t("ytdTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ytdProfitLoss !== null && ytdProfitLossPercent !== null ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={cn(
                "text-3xl font-bold",
                isProfit ? "text-profit" : "text-loss",
              )}
            >
              {formatCurrency(ytdProfitLoss, currency, { showSign: true })}
            </span>
            <span
              className={cn(
                "text-xl font-semibold",
                isProfit ? "text-profit" : "text-loss",
              )}
            >
              ({formatPercent(ytdProfitLossPercent, true)})
            </span>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">{t("ytdEmpty")}</div>
        )}
      </CardContent>
    </Card>
  );
}
