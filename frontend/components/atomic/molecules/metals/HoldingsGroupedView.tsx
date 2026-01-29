"use client";

import {
  MetalItemWithValuation,
  MetalsCurrency,
  MetalsType,
} from "@/lib/types/metals-extended";
import { HoldingsCardGrid } from "./HoldingsCardGrid";
import { HoldingsTable } from "./HoldingsTable";
import { MetalIcon } from "@/components/atomic/atoms/metals";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";

interface HoldingsGroupedViewProps {
  items: MetalItemWithValuation[];
  currency?: MetalsCurrency;
  onItemClick?: (item: MetalItemWithValuation) => void;
  isLoading?: boolean;
  className?: string;
}

const metalLabels: Record<MetalsType, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
};

const metalOrder: MetalsType[] = ["gold", "silver", "platinum", "palladium"];

export function HoldingsGroupedView({
  items,
  currency = "eur",
  onItemClick,
  isLoading = false,
  className,
}: HoldingsGroupedViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<MetalsType>>(
    new Set(metalOrder),
  );

  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        {metalOrder.map((metal) => (
          <div key={metal} className="space-y-3">
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-lg border bg-card animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Group items by metal type
  const groupedItems = metalOrder.reduce(
    (acc, metal) => {
      acc[metal] = items.filter((item) => item.metalType === metal);
      return acc;
    },
    {} as Record<MetalsType, MetalItemWithValuation[]>,
  );

  // Filter out empty groups
  const nonEmptyGroups = metalOrder.filter(
    (metal) => groupedItems[metal].length > 0,
  );

  if (nonEmptyGroups.length === 0) {
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

  const toggleGroup = (metal: MetalsType) => {
    const next = new Set(expandedGroups);
    if (next.has(metal)) {
      next.delete(metal);
    } else {
      next.add(metal);
    }
    setExpandedGroups(next);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {nonEmptyGroups.map((metal) => {
        const groupItems = groupedItems[metal];
        const isExpanded = expandedGroups.has(metal);
        const totalValue = groupItems.reduce(
          (sum, item) => sum + (item.marketValue ?? 0),
          0,
        );

        return (
          <div key={metal} className="space-y-3">
            {/* Group Header */}
            <Button
              variant="ghost"
              className="flex items-center gap-2 w-full justify-start p-2 -ml-2"
              onClick={() => toggleGroup(metal)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <MetalIcon metal={metal} />
              <span className="font-semibold">{metalLabels[metal]}</span>
              <span className="text-muted-foreground">
                ({groupItems.length}{" "}
                {groupItems.length === 1 ? "item" : "items"})
              </span>
              <span className="ml-auto text-muted-foreground">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: currency.toUpperCase(),
                }).format(totalValue)}
              </span>
            </Button>

            {/* Group Items */}
            {isExpanded && (
              <div className="pl-6 border-l-2 border-muted ml-2">
                <HoldingsCardGrid
                  items={groupItems}
                  currency={currency}
                  onItemClick={onItemClick}
                  compact
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
