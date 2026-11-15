"use client";

import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { MetalBadge } from "@/components/atomic/atoms/metals";
import { MetalsType } from "@/lib/types/metals-extended";
import { Button } from "@/components/ui/shadcn/button";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  GiftIcon,
  Trash2,
} from "lucide-react";

export interface Transaction {
  _id: string;
  transactionType: "buy" | "sell" | "gift_received" | "gift_given";
  quantity: number;
  /** Null: unknown (an opening balance entered without a price) */
  pricePerUnit: number | null;
  currency: string;
  /** EUR per unit at the rate of its date; absent on older rows */
  pricePerUnitBase?: number;
  /** Null: unknown (an opening balance held since before any range) */
  transactionDate: string | null;
  /** The item's opening balance */
  isOpening?: boolean;
  spotPriceAtTransaction?: number;
  notes?: string;
  itemName: string;
  metalType?: string;
}

interface TransactionRowProps {
  transaction: Transaction;
  /** Shows a delete action for the entry (ENG-200) */
  onDelete?: (transaction: Transaction) => void;
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

export function TransactionRow({
  transaction,
  onDelete,
  className,
}: TransactionRowProps) {
  const t = useTranslations("metals.transactions");
  const format = useFormatter();
  const tDelete = useTranslations("metals.deleteTransaction");
  const Icon = transactionIcons[transaction.transactionType];
  // The purchase or sale currency as entered, an ISO code ("EUR", "GBP");
  // formatCurrency writes any code after the amount
  const currency = transaction.currency;
  const totalValue =
    transaction.pricePerUnit === null
      ? null
      : transaction.pricePerUnit * transaction.quantity;
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
        {transaction.transactionDate === null
          ? t("unknownDate")
          : // A calendar date (UTC midnight): read in UTC, never shifted a day
            format.dateTime(new Date(transaction.transactionDate), {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            })}
      </div>

      {/* Type badge */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium w-20",
          transactionColors[transaction.transactionType],
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {t(`type.${transaction.transactionType}`)}
      </div>

      {/* Item name + metal badge */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {transaction.metalType && (
          <MetalBadge metal={transaction.metalType as MetalsType} size="sm" />
        )}
        <span className="font-medium truncate">{transaction.itemName}</span>
        {transaction.isOpening && (
          <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">
            {t("openingBalance")}
          </span>
        )}
        {transaction.quantity > 1 && (
          <span className="text-muted-foreground text-sm">
            {t("quantity", { count: transaction.quantity })}
          </span>
        )}
      </div>

      {/* Price per unit */}
      <div className="w-28 text-end text-sm text-muted-foreground">
        {transaction.pricePerUnit === null
          ? t("costUnknown")
          : t("perUnit", {
              price: formatCurrency(transaction.pricePerUnit, currency),
            })}
      </div>

      {/* Total */}
      <div
        className={cn(
          "w-28 text-end font-medium",
          isIncoming ? "text-foreground" : "text-loss",
        )}
      >
        {totalValue === null ? (
          <span className="text-muted-foreground">--</span>
        ) : (
          <>
            {isIncoming ? "" : "-"}
            {formatCurrency(totalValue, currency)}
          </>
        )}
      </div>

      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          aria-label={tDelete("action")}
          title={tDelete("action")}
          onClick={() => onDelete(transaction)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
