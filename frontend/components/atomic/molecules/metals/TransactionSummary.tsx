"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Transaction } from "./TransactionRow";
import { transactionTotals } from "@/../services/finance/metalsLedger";
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
  displayCurrency?: "eur" | "usd" | "chf";
  /** The rates the spot prices are served with: other currencies convert at them */
  exchangeRates?: SpotExchangeRates | null;
  /**
   * P/L of the whole vault, independent of the list's filters: realized
   * per item from its unfiltered ledger at average cost (MetalsSummary)
   */
  realizedPL?: number | null;
  unrealizedPL?: number | null;
  totalPL?: number | null;
  className?: string;
}

export function TransactionSummary({
  transactions,
  displayCurrency = "eur",
  exchangeRates,
  realizedPL = null,
  unrealizedPL = null,
  totalPL = null,
  className,
}: TransactionSummaryProps) {
  const summary = useMemo(() => {
    const totals = transactionTotals(transactions, displayCurrency, exchangeRates);
    return {
      ...totals,
      cashFlow: totals.totalBought - totals.totalSold,
      // Left out of the totals: no rate into the display currency, or no price
      leftOut: totals.notConverted + totals.unknownCost,
      realizedPL,
    };
  }, [transactions, displayCurrency, exchangeRates, realizedPL]);

  const isNetOutflow = summary.cashFlow >= 0;
  const hasUnrealizedPL = unrealizedPL !== null;

  return (
    <Card className={cn(className)}>
      <CardContent className="py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Total Bought */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowDownLeft className="h-3.5 w-3.5 text-profit" />
              Total Bought
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(summary.totalBought, displayCurrency)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.buyCount} transaction{summary.buyCount !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Total Sold */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowUpRight className="h-3.5 w-3.5 text-loss" />
              Total Sold
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(summary.totalSold, displayCurrency)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.sellCount} transaction
              {summary.sellCount !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Cash Flow */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              Net Cash Flow
            </div>
            <div
              className={cn(
                "text-lg font-semibold",
                isNetOutflow ? "text-loss" : "text-profit",
              )}
            >
              {isNetOutflow ? "-" : "+"}
              {formatCurrency(Math.abs(summary.cashFlow), displayCurrency)}
            </div>
            <div className="text-xs text-muted-foreground">
              {isNetOutflow ? "Net spent" : "Net received"}
              {summary.leftOut > 0 &&
                ` · ${summary.leftOut} not included (${[
                  summary.notConverted > 0 &&
                    `${summary.notConverted} not converted`,
                  summary.unknownCost > 0 && `${summary.unknownCost} cost unknown`,
                ]
                  .filter(Boolean)
                  .join(", ")})`}
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
              Realized P/L
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
                  {formatCurrency(summary.realizedPL, displayCurrency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  From sales (avg. cost per item)
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-muted-foreground">
                  --
                </div>
                <div className="text-xs text-muted-foreground">No data</div>
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
              Unrealized P/L
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
                  {formatCurrency(unrealizedPL, displayCurrency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  If sold at spot
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-muted-foreground">
                  --
                </div>
                <div className="text-xs text-muted-foreground">No holdings</div>
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
              Total P/L
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
                  {formatCurrency(totalPL, displayCurrency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Realized + Unrealized
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-muted-foreground">
                  --
                </div>
                <div className="text-xs text-muted-foreground">No data</div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
