"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MetalsCurrency } from "@/lib/types/metals-extended";

interface ChangeIndicatorProps {
  value: number;
  percentage?: number;
  currency?: MetalsCurrency;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showValue?: boolean;
  showPercentage?: boolean;
  className?: string;
}

const currencySymbols: Record<MetalsCurrency, string> = {
  eur: "€",
  usd: "$",
  chf: "CHF ",
};

const sizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

export function ChangeIndicator({
  value,
  percentage,
  currency = "eur",
  size = "md",
  showIcon = true,
  showValue = true,
  showPercentage = true,
  className,
}: ChangeIndicatorProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isNeutral = value === 0;

  const colorClass = isPositive
    ? "text-profit"
    : isNegative
      ? "text-loss"
      : "text-muted-foreground";

  const bgClass = isPositive
    ? "bg-profit-light"
    : isNegative
      ? "bg-loss-light"
      : "bg-muted";

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  const formattedValue = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  const formattedPercent =
    percentage !== undefined
      ? new Intl.NumberFormat("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Math.abs(percentage))
      : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        colorClass,
        sizeClasses[size],
        className,
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {showValue && (
        <span>
          {isPositive ? "+" : isNegative ? "-" : ""}
          {currencySymbols[currency]}
          {formattedValue}
        </span>
      )}
      {showPercentage && formattedPercent && (
        <span className={cn("rounded px-1", bgClass)}>
          ({isPositive ? "+" : isNegative ? "-" : ""}
          {formattedPercent}%)
        </span>
      )}
    </span>
  );
}

// Simplified percentage-only change indicator
export function PercentageChange({
  value,
  size = "md",
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  const colorClass = isPositive
    ? "text-profit"
    : isNegative
      ? "text-loss"
      : "text-muted-foreground";

  const formattedPercent = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  return (
    <span className={cn(colorClass, sizeClasses[size], className)}>
      {isPositive ? "+" : isNegative ? "-" : ""}
      {formattedPercent}%
    </span>
  );
}
