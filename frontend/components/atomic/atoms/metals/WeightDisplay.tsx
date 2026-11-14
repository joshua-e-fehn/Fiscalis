"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { gramsToTroyOunces } from "@/../services/finance/metals";

type WeightUnit = "g" | "oz" | "kg";

interface WeightDisplayProps {
  grams: number;
  unit?: WeightUnit;
  size?: "sm" | "md" | "lg";
  showUnit?: boolean;
  className?: string;
}

/**
 * Weights follow the house number style of lib/utils/currency.ts (de-CH:
 * 1'234.56) in every UI language, like amounts.
 */
const HOUSE_NUMBER_LOCALE = "de-CH";

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
  const t = useTranslations("metals.badges.weightUnit");
  const value =
    unit === "oz"
      ? gramsToTroyOunces(grams)
      : unit === "kg"
        ? grams / 1000
        : grams;

  const formattedValue = new Intl.NumberFormat(HOUSE_NUMBER_LOCALE, {
    minimumFractionDigits: unit === "oz" ? 2 : value < 10 ? 2 : 0,
    maximumFractionDigits: unit === "oz" ? 4 : 2,
  }).format(value);

  return (
    <span className={cn(sizeClasses[size], className)}>
      {formattedValue}
      {showUnit && (
        <span className="text-muted-foreground ml-0.5">{t(unit)}</span>
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
  const t = useTranslations("metals.badges.weightUnit");
  const oz = gramsToTroyOunces(grams);

  const formattedGrams = new Intl.NumberFormat(HOUSE_NUMBER_LOCALE, {
    minimumFractionDigits: grams < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(grams);

  const formattedOz = new Intl.NumberFormat(HOUSE_NUMBER_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(oz);

  return (
    <span className={cn(sizeClasses[size], className)}>
      {formattedGrams}
      <span className="text-muted-foreground">{t("g")}</span>
      <span className="text-muted-foreground mx-1">·</span>
      {formattedOz}
      <span className="text-muted-foreground">{t("oz")}</span>
    </span>
  );
}
