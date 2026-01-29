"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Transaction } from "./TransactionRow";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  Target,
} from "lucide-react";

interface TransactionSummaryProps {
  transactions: Transaction[];
  displayCurrency?: "eur" | "usd" | "chf";
  unrealizedPL?: number | null;
  className?: string;
}

function formatCurrency(value: number, currency: string): string {
  const currencyMap: Record<string, string> = {
    eur: "EUR",
    usd: "USD",
    chf: "CHF",
    EUR: "EUR",
    USD: "USD",
    CHF: "CHF",
  };
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyMap[currency] || "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

export function TransactionSummary({
  transactions,
  displayCurrency = "eur",
  unrealizedPL = null,
  className,
}: TransactionSummaryProps) {
  const summary = useMemo(() => {
    let totalBought = 0;
    let totalSold = 0;
    let buyCount = 0;
    let sellCount = 0;
    let totalUnitsBought = 0;
    let totalUnitsSold = 0;

    for (const tx of transactions) {
      const total = tx.pricePerUnit * tx.quantity;
      if (
        tx.transactionType === "buy" ||
        tx.transactionType === "gift_received"
      ) {
        totalBought += total;
        totalUnitsBought += tx.quantity;
        buyCount++;
      } else {
        totalSold += total;
        totalUnitsSold += tx.quantity;
        sellCount++;
      }
    }

    // Calculate Realized P/L using average cost basis method
    // Average cost = Total spent on buys / Total units bought
    // Realized P/L = Sales proceeds - (Average cost × units sold)
    let realizedPL: number | null = null;
    if (totalUnitsBought > 0 && totalUnitsSold > 0) {
      const averageCostPerUnit = totalBought / totalUnitsBought;
      const costBasisOfSoldItems = averageCostPerUnit * totalUnitsSold;
      realizedPL = totalSold - costBasisOfSoldItems;
    } else if (totalUnitsSold === 0) {
      // No sales yet, so realized P/L is 0
      realizedPL = 0;
    }

    return {
      totalBought,
      totalSold,
      cashFlow: totalBought - totalSold,
      buyCount,
      sellCount,
      totalCount: buyCount + sellCount,
      realizedPL,
    };
  }, [transactions]);

  const isNetOutflow = summary.cashFlow >= 0;
  const hasUnrealizedPL = unrealizedPL !== null;
  const totalPL =
    summary.realizedPL !== null && hasUnrealizedPL
      ? summary.realizedPL + unrealizedPL
      : null;

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
            </div>
          </div>

          {/* Realized P/L */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
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
                  From sales (avg. cost)
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
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
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
              <Target className="h-3.5 w-3.5 text-primary" />
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
