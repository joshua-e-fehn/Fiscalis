"use client";

import { cn } from "@/lib/utils";
import type { MetalsDisplayCurrency } from "@/lib/types/metals";
import { formatCurrency } from "@/lib/utils/currency";

interface PriceDisplayProps {
  value: number;
  currency: MetalsDisplayCurrency;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showSign?: boolean;
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg font-semibold",
  xl: "text-2xl font-bold",
};

/** An amount in the house style of lib/utils/currency.ts: "1'234.56€" */
export function PriceDisplay({
  value,
  currency,
  size = "md",
  className,
  showSign = false,
}: PriceDisplayProps) {
  return (
    <span className={cn(sizeClasses[size], className)}>
      {formatCurrency(value, currency, { showSign })}
    </span>
  );
}
