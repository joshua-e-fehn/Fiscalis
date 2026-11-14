"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MetalsDisplayCurrency } from "@/lib/types/metals";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";

interface ChangeIndicatorProps {
  value: number;
  percentage?: number;
  currency: MetalsDisplayCurrency;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showValue?: boolean;
  showPercentage?: boolean;
  className?: string;
}

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
  currency,
  size = "md",
  showIcon = true,
  showValue = true,
  showPercentage = true,
  className,
}: ChangeIndicatorProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;

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
        <span>{formatCurrency(value, currency, { showSign: true })}</span>
      )}
      {showPercentage && percentage !== undefined && (
        <span className={cn("rounded px-1", bgClass)}>
          ({formatPercent(percentage, true)})
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

  return (
    <span className={cn(colorClass, sizeClasses[size], className)}>
      {formatPercent(value, true)}
    </span>
  );
}
