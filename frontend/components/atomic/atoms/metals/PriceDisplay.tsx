"use client";

import { cn } from "@/lib/utils";
import { MetalsCurrency } from "@/lib/types/metals-extended";

interface PriceDisplayProps {
  value: number;
  currency?: MetalsCurrency;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showSign?: boolean;
}

const currencySymbols: Record<MetalsCurrency, string> = {
  eur: "€",
  usd: "$",
  chf: "CHF ",
};

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg font-semibold",
  xl: "text-2xl font-bold",
};

export function PriceDisplay({
  value,
  currency = "eur",
  size = "md",
  className,
  showSign = false,
}: PriceDisplayProps) {
  const symbol = currencySymbols[currency];
  const formattedValue = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  const sign = showSign && value > 0 ? "+" : showSign && value < 0 ? "-" : "";

  return (
    <span className={cn(sizeClasses[size], className)}>
      {sign}
      {symbol}
      {formattedValue}
    </span>
  );
}

// Compact price display with currency code
export function PriceWithCurrency({
  value,
  currency = "eur",
  className,
}: {
  value: number;
  currency?: MetalsCurrency;
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
