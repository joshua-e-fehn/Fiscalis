"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Transaction } from "./TransactionRow";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import {
  transactionTotals,
  ledgerUnitsPerEur,
} from "@/../services/finance/metalsLedger";
import type { SpotExchangeRates } from "@/../services/finance/metals";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface TransactionSummaryProps {
  /** The listed transactions: the bought / sold / cash-flow totals */
  transactions: Transaction[];
  /**
   * The currency of the totals and of the P/L props; defaults to the
   * display currency (useDisplayCurrency)
   */
  displayCurrency?: InvestmentCurrency;
  /**
   * The rates the spot prices are served with: older rows without an EUR
   * price convert from USD/CHF at them. The display currency converts at
   * its own latest rate.
   */
  exchangeRates?: SpotExchangeRates | null;
  /**
   * P/L of the whole vault, independent of the list's filters, already in
   * `displayCurrency`: realized per item from its unfiltered ledger at
   * average cost (MetalsSummary)
   */
  realizedPL?: number | null;
  unrealizedPL?: number | null;
  totalPL?: number | null;
  className?: string;
}

export function TransactionSummary({
  transactions,
  displayCurrency,
  exchangeRates,
  realizedPL = null,
  unrealizedPL = null,
  totalPL = null,
  className,
}: TransactionSummaryProps) {
  const t = useTranslations("metals.transactions.summary");
  const display = useDisplayCurrency();
  const currency = displayCurrency ?? display.currency;
  const rateCode = display.code;
  const rateUnitsPerEur = display.unitsPerEur;

  const summary = useMemo(() => {
    const rates = ledgerUnitsPerEur(exchangeRates, {
      code: rateCode,
      unitsPerEur: rateUnitsPerEur,
    });
    const totals = transactionTotals(transactions, currency, rates);
    return {
      ...totals,
      cashFlow: totals.totalBought - totals.totalSold,
      // Left out of the totals: no rate into the display currency, or no price
      leftOut: totals.notConverted + totals.unknownCost,
      realizedPL,
    };
  }, [
    transactions,
    currency,
    exchangeRates,
    rateCode,
    rateUnitsPerEur,
    realizedPL,
  ]);

  const isNetOutflow = summary.cashFlow >= 0;
  const cashFlowLabel = isNetOutflow ? t("netSpent") : t("netReceived");
  // Left out of the totals, and why
  const leftOutCounts = {
    count: summary.leftOut,
    notConverted: summary.notConverted,
    unknownCost: summary.unknownCost,
  };
  const leftOutNote =
    summary.leftOut === 0
      ? null
      : summary.notConverted > 0 && summary.unknownCost > 0
        ? t("leftOutBoth", leftOutCounts)
        : summary.notConverted > 0
          ? t("leftOutNotConverted", leftOutCounts)
          : t("leftOutUnknownCost", leftOutCounts);
  const hasUnrealizedPL = unrealizedPL !== null;

  // No figure before the display rate arrives
  if (display.isLoading) {
    return <Skeleton className={cn("h-[88px] w-full rounded-xl", className)} />;
  }

  return (
    <Card className={cn(className)}>
      <CardContent className="py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Total Bought */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowDownLeft className="h-3.5 w-3.5 text-profit" />
              {t("totalBought")}
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(summary.totalBought, currency)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("count", { count: summary.buyCount })}
            </div>
          </div>

          {/* Total Sold */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowUpRight className="h-3.5 w-3.5 text-loss" />
              {t("totalSold")}
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(summary.totalSold, currency)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("count", { count: summary.sellCount })}
            </div>
          </div>

          {/* Cash Flow */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              {t("netCashFlow")}
            </div>
            <div
              className={cn(
                "text-lg font-semibold",
                isNetOutflow ? "text-loss" : "text-profit",
              )}
            >
              {isNetOutflow ? "-" : "+"}
              {formatCurrency(Math.abs(summary.cashFlow), currency)}
            </div>
            <div className="text-xs text-muted-foreground">
              {leftOutNote === null
                ? cashFlowLabel
                : t("withNote", { label: cashFlowLabel, note: leftOutNote })}
            </div>
          </div>

          {/* Realized P/L */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {summary.realizedPL !== null && summary.realizedPL >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-profit" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-loss" />
              )}
              {t("realizedPL")}
            </div>
            {summary.realizedPL !== null ? (
              <>
                <div
                  className={cn(
                    "text-lg font-semibold",
                    summary.realizedPL >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {summary.realizedPL >= 0 ? "+" : ""}
                  {formatCurrency(summary.realizedPL, currency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("realizedNote")}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-muted-foreground">
                  --
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("noData")}
                </div>
              </>
            )}
          </div>

          {/* Unrealized P/L */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {hasUnrealizedPL && unrealizedPL >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-profit" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-loss" />
              )}
              {t("unrealizedPL")}
            </div>
            {hasUnrealizedPL ? (
              <>
                <div
                  className={cn(
                    "text-lg font-semibold",
                    unrealizedPL >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {unrealizedPL >= 0 ? "+" : ""}
                  {formatCurrency(unrealizedPL, currency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("unrealizedNote")}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-muted-foreground">
                  --
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("noHoldings")}
                </div>
              </>
            )}
          </div>

          {/* Total P/L */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {totalPL !== null && totalPL >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-profit" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-loss" />
              )}
              {t("totalPL")}
            </div>
            {totalPL !== null ? (
              <>
                <div
                  className={cn(
                    "text-lg font-semibold",
                    totalPL >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {totalPL >= 0 ? "+" : ""}
                  {formatCurrency(totalPL, currency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("totalNote")}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-muted-foreground">
                  --
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("noData")}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
