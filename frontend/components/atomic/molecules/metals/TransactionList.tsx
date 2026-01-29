"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Transaction, TransactionRow } from "./TransactionRow";
import {
  TransactionRowSkeleton,
  StaggerContainer,
  StaggerItem,
  FadeIn,
} from "@/components/atomic/atoms/metals";

interface TransactionListProps {
  transactions: Transaction[];
  displayCurrency?: "eur" | "usd" | "chf";
  isLoading?: boolean;
  className?: string;
}

function groupTransactionsByMonth(
  transactions: Transaction[],
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};

  for (const tx of transactions) {
    const date = new Date(tx.transactionDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(date);

    if (!groups[monthLabel]) {
      groups[monthLabel] = [];
    }
    groups[monthLabel].push(tx);
  }

  return groups;
}

export function TransactionList({
  transactions,
  displayCurrency = "eur",
  isLoading = false,
  className,
}: TransactionListProps) {
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
        No transactions yet
      </div>
    );
  }

  return (
    <div className={cn("max-h-[500px] overflow-y-auto", className)}>
      <StaggerContainer className="space-y-6">
        {Object.entries(groupedTransactions).map(([month, txs], groupIndex) => (
          <StaggerItem key={month}>
            <FadeIn delay={groupIndex * 0.1}>
              {/* Month header */}
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-4 mb-2">
                {month}
              </h3>

              {/* Transactions for this month */}
              <div className="border rounded-lg divide-y">
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx._id}
                    transaction={tx}
                    displayCurrency={displayCurrency}
                  />
                ))}
              </div>
            </FadeIn>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
