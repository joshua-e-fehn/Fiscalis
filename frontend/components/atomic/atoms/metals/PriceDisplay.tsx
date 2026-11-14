"use client";

import { cn } from "@/lib/utils";
import type { MetalsDisplayCurrency } from "@/lib/types/metals";
import { currencySuffixes } from "@/lib/utils/currency";

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

export function PriceDisplay({
  value,
  currency,
  size = "md",
  className,
  showSign = false,
}: PriceDisplayProps) {
  const suffix = currencySuffixes[currency];
  const formattedValue = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  const sign = showSign && value > 0 ? "+" : showSign && value < 0 ? "-" : "";

  return (
    <span className={cn(sizeClasses[size], className)}>
      {sign}
      {formattedValue}
      {suffix}
    </span>
  );
}

// Compact price display with currency code
export function PriceWithCurrency({
  value,
  currency,
  className,
}: {
  value: number;
  currency: MetalsDisplayCurrency;
  className?: string;
}) {
  const formattedValue = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="font-medium">{formattedValue}</span>
      <span className="text-xs text-muted-foreground uppercase">
        {currency}
      </span>
    </span>
  );
}
