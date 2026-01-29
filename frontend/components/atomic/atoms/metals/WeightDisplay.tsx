"use client";

import { cn } from "@/lib/utils";
import { gramsToTroyOunces } from "@/convex/lib/priceCalculations";

type WeightUnit = "g" | "oz" | "kg";

interface WeightDisplayProps {
  grams: number;
  unit?: WeightUnit;
  size?: "sm" | "md" | "lg";
  showUnit?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base font-medium",
};

export function WeightDisplay({
  grams,
  unit = "g",
  size = "md",
  showUnit = true,
  className,
}: WeightDisplayProps) {
  let value: number;
  let unitLabel: string;

  switch (unit) {
    case "oz":
      value = gramsToTroyOunces(grams);
      unitLabel = "oz";
      break;
    case "kg":
      value = grams / 1000;
      unitLabel = "kg";
      break;
    default:
      value = grams;
      unitLabel = "g";
  }

  const formattedValue = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: unit === "oz" ? 2 : value < 10 ? 2 : 0,
    maximumFractionDigits: unit === "oz" ? 4 : 2,
  }).format(value);

  return (
    <span className={cn(sizeClasses[size], className)}>
      {formattedValue}
      {showUnit && (
        <span className="text-muted-foreground ml-0.5">{unitLabel}</span>
      )}
    </span>
  );
}

// Dual weight display (grams and ounces)
export function DualWeightDisplay({
  grams,
  size = "md",
  className,
}: {
  grams: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const oz = gramsToTroyOunces(grams);

  const formattedGrams = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: grams < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(grams);

  const formattedOz = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(oz);

  return (
    <span className={cn(sizeClasses[size], className)}>
      {formattedGrams}
      <span className="text-muted-foreground">g</span>
      <span className="text-muted-foreground mx-1">·</span>
      {formattedOz}
      <span className="text-muted-foreground">oz</span>
    </span>
  );
}
