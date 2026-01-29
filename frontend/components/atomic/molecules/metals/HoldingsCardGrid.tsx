"use client";

import { HoldingCard, HoldingCardCompact } from "./HoldingCard";
import {
  HoldingCardSkeleton,
  AnimatedList,
} from "@/components/atomic/atoms/metals";
import {
  MetalItemWithValuation,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";

interface HoldingsCardGridProps {
  items: MetalItemWithValuation[];
  currency?: MetalsCurrency;
  onItemClick?: (item: MetalItemWithValuation) => void;
  onEdit?: (item: MetalItemWithValuation) => void;
  onDelete?: (item: MetalItemWithValuation) => void;
  isLoading?: boolean;
  compact?: boolean;
  className?: string;
}

export function HoldingsCardGrid({
  items,
  currency = "eur",
  onItemClick,
  onEdit,
  onDelete,
  isLoading = false,
  compact = false,
  className,
}: HoldingsCardGridProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
          className,
        )}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <HoldingCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-48 text-muted-foreground",
          className,
        )}
      >
        No items found
      </div>
    );
  }

  if (compact) {
    return (
      <AnimatedList className={cn("space-y-2", className)}>
        {items.map((item) => (
          <HoldingCardCompact
            key={item._id}
            item={item}
            currency={currency}
            onClick={() => onItemClick?.(item)}
          />
        ))}
      </AnimatedList>
    );
  }

  return (
    <AnimatedList
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
        className,
      )}
    >
      {items.map((item) => (
        <HoldingCard
          key={item._id}
          item={item}
          currency={currency}
          onClick={() => onItemClick?.(item)}
          onEdit={onEdit ? () => onEdit(item) : undefined}
          onDelete={onDelete ? () => onDelete(item) : undefined}
        />
      ))}
    </AnimatedList>
  );
}
