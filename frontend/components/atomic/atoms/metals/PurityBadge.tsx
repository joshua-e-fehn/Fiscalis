"use client";

import { cn } from "@/lib/utils";

interface PurityBadgeProps {
  purity: number; // In per-mille (e.g., 999.9, 916.7, 750)
  size?: "sm" | "md" | "lg";
  showKarat?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

// Convert purity to karat (for gold)
function purityToKarat(purity: number): number | null {
  // Common karat values
  const karatMap: Record<number, number> = {
    999.9: 24,
    999: 24,
    916.7: 22,
    916: 22,
    900: 21.6,
    833: 20,
    750: 18,
    585: 14,
    375: 9,
    333: 8,
  };

  // Round to nearest known purity
  const roundedPurity = Math.round(purity);
  return karatMap[roundedPurity] ?? null;
}

export function PurityBadge({
  purity,
  size = "md",
  showKarat = false,
  className,
}: PurityBadgeProps) {
  const karat = showKarat ? purityToKarat(purity) : null;

  const formattedPurity =
    purity % 1 === 0 ? purity.toFixed(0) : purity.toFixed(1);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium",
        "bg-muted text-muted-foreground border border-border",
        sizeClasses[size],
        className,
      )}
    >
      {formattedPurity}
      {karat && <span className="ml-1 opacity-70">({karat}k)</span>}
    </span>
  );
}

// Category badge (coin, bar, jewelry, scrap)
export function CategoryBadge({
  category,
  size = "md",
  className,
}: {
  category: "coin" | "bar" | "jewelry" | "scrap";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const labels: Record<typeof category, string> = {
    coin: "Coin",
    bar: "Bar",
    jewelry: "Jewelry",
    scrap: "Scrap",
  };

  const icons: Record<typeof category, string> = {
    coin: "🪙",
    bar: "📦",
    jewelry: "💍",
    scrap: "♻️",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium",
        "bg-muted text-muted-foreground",
        sizeClasses[size],
        className,
      )}
    >
      <span>{icons[category]}</span>
      <span>{labels[category]}</span>
    </span>
  );
}
