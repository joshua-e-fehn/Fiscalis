"use client";

/**
 * Metals Largest Holdings Card
 *
 * Displays the largest precious metal holdings grouped by metal type
 * (Gold, Silver, Platinum, Palladium).
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";
import {
  MetalItemWithValuation,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { TrendingUp, TrendingDown } from "lucide-react";

const currencySymbols: Record<MetalsCurrency, string> = {
  eur: "€",
  usd: "$",
  chf: "CHF ",
};

interface MetalsLargestHoldingsCardProps {
  items: MetalItemWithValuation[] | undefined;
  currency: MetalsCurrency;
  maxHoldingsPerMetal?: number;
  isLoading?: boolean;
  className?: string;
}

const metalColors: Record<string, string> = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  platinum: "#E5E4E2",
  palladium: "#CED0DD",
};

const metalNames: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
};

export function MetalsLargestHoldingsCard({
  items,
  currency,
  maxHoldingsPerMetal = 3,
  isLoading = false,
  className,
}: MetalsLargestHoldingsCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Largest Holdings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-6 w-full bg-muted animate-pulse rounded" />
                <div className="h-6 w-full bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Largest Holdings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <span className="text-sm text-muted-foreground">No holdings yet</span>
        </CardContent>
      </Card>
    );
  }

  // Group items by metal type
  const metalTypes = ["gold", "silver", "platinum", "palladium"] as const;
  const groupedItems: Record<string, MetalItemWithValuation[]> = {};

  for (const metal of metalTypes) {
    const metalItems = items
      .filter((item) => item.metalType === metal)
      .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
    if (metalItems.length > 0) {
      groupedItems[metal] = metalItems;
    }
  }

  if (Object.keys(groupedItems).length === 0) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Largest Holdings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <span className="text-sm text-muted-foreground">No holdings yet</span>
        </CardContent>
      </Card>
    );
  }

  const formatValue = (value: number) =>
    new Intl.NumberFormat("de-CH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Largest Holdings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {metalTypes.map((metal) => {
          const metalItems = groupedItems[metal];
          if (!metalItems || metalItems.length === 0) return null;

          const totalItems = items.filter((i) => i.metalType === metal).length;

          return (
            <div key={metal}>
              {/* Metal header */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: metalColors[metal] }}
                />
                <span className="text-sm font-medium">{metalNames[metal]}</span>
                <span className="text-xs text-muted-foreground">
                  ({totalItems} item{totalItems !== 1 ? "s" : ""})
                </span>
              </div>

              {/* Holdings list */}
              <div className="space-y-1 pl-5">
                {metalItems.slice(0, maxHoldingsPerMetal).map((item, index) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">
                        {index + 1}.
                      </span>
                      <span className="truncate max-w-[200px]">
                        {item.displayName}
                        {item.quantity > 1 && (
                          <span className="text-muted-foreground ml-1">
                            ×{item.quantity}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {currencySymbols[currency]}
                        {formatValue(item.marketValue ?? 0)}
                      </span>
                      {item.profitLossPercent !== null && (
                        <span
                          className={cn(
                            "text-xs flex items-center gap-0.5",
                            item.profitLossPercent >= 0
                              ? "text-profit"
                              : "text-loss",
                          )}
                        >
                          {item.profitLossPercent >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {item.profitLossPercent >= 0 ? "+" : ""}
                          {item.profitLossPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
