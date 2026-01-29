"use client";

import { cn } from "@/lib/utils";
import { MetalsType } from "@/lib/types/metals-extended";

interface MetalBadgeProps {
  metal: MetalsType;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const metalConfig: Record<
  MetalsType,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  gold: {
    label: "Gold",
    bgClass: "bg-metal-gold/10",
    textClass: "text-metal-gold-muted",
    borderClass: "border-metal-gold/30",
  },
  silver: {
    label: "Silver",
    bgClass: "bg-metal-silver/10",
    textClass: "text-metal-silver-muted",
    borderClass: "border-metal-silver/30",
  },
  platinum: {
    label: "Platinum",
    bgClass: "bg-metal-platinum/10",
    textClass: "text-metal-platinum-muted",
    borderClass: "border-metal-platinum/30",
  },
  palladium: {
    label: "Palladium",
    bgClass: "bg-metal-palladium/10",
    textClass: "text-metal-palladium-muted",
    borderClass: "border-metal-palladium/30",
  },
};

const sizeClasses = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-sm",
};

export function MetalBadge({ metal, size = "md", className }: MetalBadgeProps) {
  const config = metalConfig[metal];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        config.bgClass,
        config.textClass,
        config.borderClass,
        sizeClasses[size],
        className,
      )}
    >
      {config.label}
    </span>
  );
}

// Metal icon component (emoji-based for simplicity)
export function MetalIcon({
  metal,
  className,
}: {
  metal: MetalsType;
  className?: string;
}) {
  const icons: Record<MetalsType, string> = {
    gold: "🥇",
    silver: "🥈",
    platinum: "⚪",
    palladium: "⚫",
  };

  return <span className={cn("text-lg", className)}>{icons[metal]}</span>;
}
