"use client";

import { cn } from "@/lib/utils";
import { MetalBadge } from "@/components/atomic/atoms/metals";
import { MetalsType, MetalsCurrency } from "@/lib/types/metals-extended";
import { ArrowDownLeft, ArrowUpRight, Gift, GiftIcon } from "lucide-react";

export interface Transaction {
  _id: string;
  transactionType: "buy" | "sell" | "gift_received" | "gift_given";
  quantity: number;
  pricePerUnit: number;
  currency: string;
  transactionDate: string;
  spotPriceAtTransaction?: number;
  notes?: string;
  itemName: string;
  metalType?: string;
}

interface TransactionRowProps {
  transaction: Transaction;
  displayCurrency?: MetalsCurrency;
  className?: string;
}

const transactionIcons = {
  buy: ArrowDownLeft,
  sell: ArrowUpRight,
  gift_received: Gift,
  gift_given: GiftIcon,
};

const transactionColors = {
  buy: "text-profit bg-profit/10",
  sell: "text-loss bg-loss/10",
  gift_received: "text-blue-600 bg-blue-100",
  gift_given: "text-purple-600 bg-purple-100",
};

const transactionLabels = {
  buy: "Buy",
  sell: "Sell",
  gift_received: "Gift Received",
  gift_given: "Gift Given",
};

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function TransactionRow({
  transaction,
  displayCurrency = "eur",
  className,
}: TransactionRowProps) {
  const Icon = transactionIcons[transaction.transactionType];
  const totalValue = transaction.pricePerUnit * transaction.quantity;
  const isIncoming =
    transaction.transactionType === "buy" ||
    transaction.transactionType === "gift_received";

  return (
    <div
      className={cn(
        "flex items-center gap-4 py-3 px-4 hover:bg-muted/50 transition-colors",
        className,
      )}
    >
      {/* Date */}
      <div className="w-16 text-sm text-muted-foreground">
        {formatDate(transaction.transactionDate)}
      </div>

      {/* Type badge */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium w-20",
          transactionColors[transaction.transactionType],
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {transactionLabels[transaction.transactionType]}
      </div>

      {/* Item name + metal badge */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {transaction.metalType && (
          <MetalBadge metal={transaction.metalType as MetalsType} size="sm" />
        )}
        <span className="font-medium truncate">{transaction.itemName}</span>
        {transaction.quantity > 1 && (
          <span className="text-muted-foreground text-sm">
            (x{transaction.quantity})
          </span>
        )}
      </div>

      {/* Price per unit */}
      <div className="w-28 text-right text-sm text-muted-foreground">
        {formatCurrency(transaction.pricePerUnit, transaction.currency)}/unit
      </div>

      {/* Total */}
      <div
        className={cn(
          "w-28 text-right font-medium",
          isIncoming ? "text-foreground" : "text-loss",
        )}
      >
        {isIncoming ? "" : "-"}
        {formatCurrency(totalValue, transaction.currency)}
      </div>
    </div>
  );
}
