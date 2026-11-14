"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { Transaction, TransactionRow } from "./TransactionRow";
import {
  TransactionRowSkeleton,
  StaggerContainer,
  StaggerItem,
  FadeIn,
} from "@/components/atomic/atoms/metals";

interface TransactionListProps {
  transactions: Transaction[];
  /**
   * Accepted for callers but unused: each row shows its price as entered,
   * in the transaction's own currency; the totals in the display currency
   * are TransactionSummary's
   */
  displayCurrency?: InvestmentCurrency;
  isLoading?: boolean;
  className?: string;
}

interface TransactionGroup {
  /** "2026-11" (UTC month of the stored date); null: date unknown */
  month: string | null;
  /** A date in the month, for its label */
  date: Date | null;
  transactions: Transaction[];
}

/**
 * The transactions by month, in list order. Stored dates are calendar dates
 * (YYYY-MM-DD, UTC midnight), so the month is read in UTC. Opening balances
 * of unknown date (held since before any range) come last: before any dated
 * transaction in the newest-first list.
 */
function groupTransactionsByMonth(
  transactions: Transaction[],
): TransactionGroup[] {
  const groups = new Map<string, TransactionGroup>();
  const undated: Transaction[] = [];

  for (const tx of transactions) {
    if (tx.transactionDate === null) {
      undated.push(tx);
      continue;
    }
    const date = new Date(tx.transactionDate);
    const month = date.toISOString().slice(0, 7);
    let group = groups.get(month);
    if (!group) {
      group = { month, date, transactions: [] };
      groups.set(month, group);
    }
    group.transactions.push(tx);
  }

  const result = [...groups.values()];
  if (undated.length > 0) {
    result.push({ month: null, date: null, transactions: undated });
  }
  return result;
}

export function TransactionList({
  transactions,
  isLoading = false,
  className,
}: TransactionListProps) {
  const t = useTranslations("metals.transactions");
  const format = useFormatter();
  const groupedTransactions = useMemo(
    () => groupTransactionsByMonth(transactions),
    [transactions],
  );

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="border rounded-lg divide-y">
              <TransactionRowSkeleton />
              <TransactionRowSkeleton />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-48 text-muted-foreground",
          className,
        )}
      >
        {t("empty")}
      </div>
    );
  }

  return (
    <div className={cn("max-h-[500px] overflow-y-auto", className)}>
      <StaggerContainer className="space-y-6">
        {groupedTransactions.map((group, groupIndex) => (
          <StaggerItem key={group.month ?? "unknown"}>
            <FadeIn delay={groupIndex * 0.1}>
              {/* Month header */}
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-4 mb-2">
                {group.date === null
                  ? t("dateUnknown")
                  : format.dateTime(group.date, {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
              </h3>

              {/* Transactions for this month */}
              <div className="border rounded-lg divide-y">
                {group.transactions.map((tx) => (
                  <TransactionRow key={tx._id} transaction={tx} />
                ))}
              </div>
            </FadeIn>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
