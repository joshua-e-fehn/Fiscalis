"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";
import {
  SubcategoryData,
  InvestmentCurrency,
  currencySymbols,
} from "@/lib/types/investments";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TopHoldingsListProps {
  subcategories: SubcategoryData[];
  currency?: InvestmentCurrency;
  maxHoldingsPerSubcategory?: number;
  isLoading?: boolean;
  className?: string;
}

export function TopHoldingsList({
  subcategories,
  currency = "eur",
  maxHoldingsPerSubcategory = 3,
  isLoading = false,
  className,
}: TopHoldingsListProps) {
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

  // Filter subcategories with holdings
  const subcategoriesWithHoldings = subcategories.filter(
    (s) => s.topHoldings.length > 0,
  );

  if (subcategoriesWithHoldings.length === 0) {
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
        {subcategoriesWithHoldings.map((subcategory) => (
          <div key={subcategory.id}>
            {/* Subcategory header */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: subcategory.color }}
              />
              <span className="text-sm font-medium">{subcategory.name}</span>
              <span className="text-xs text-muted-foreground">
                ({subcategory.holdingsCount} holding
                {subcategory.holdingsCount !== 1 ? "s" : ""})
              </span>
            </div>

            {/* Holdings list */}
            <div className="space-y-1 pl-5">
              {subcategory.topHoldings
                .slice(0, maxHoldingsPerSubcategory)
                .map((holding, index) => (
                  <div
                    key={holding.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">
                        {index + 1}.
                      </span>
                      <span className="truncate max-w-[180px]">
                        {holding.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {currencySymbols[currency]}
                        {formatValue(holding.value)}
                      </span>
                      {holding.profitLossPercent !== null && (
                        <span
                          className={cn(
                            "text-xs flex items-center gap-0.5",
                            holding.profitLossPercent >= 0
                              ? "text-profit"
                              : "text-loss",
                          )}
                        >
                          {holding.profitLossPercent >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {holding.profitLossPercent >= 0 ? "+" : ""}
                          {holding.profitLossPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
