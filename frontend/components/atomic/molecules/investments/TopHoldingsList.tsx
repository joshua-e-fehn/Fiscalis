"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useCategoryLabels } from "@/lib/config/categoryUI";
import { SubcategoryData, InvestmentCurrency } from "@/lib/types/investments";
import { currencySuffixes } from "@/lib/utils/currency";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TopHoldingsListProps {
  subcategories: SubcategoryData[];
  /** The currency of the holdings' values (the summary hook's `currency`) */
  currency: InvestmentCurrency;
  maxHoldingsPerSubcategory?: number;
  isLoading?: boolean;
  className?: string;
}

export function TopHoldingsList({
  subcategories,
  currency,
  maxHoldingsPerSubcategory = 3,
  isLoading = false,
  className,
}: TopHoldingsListProps) {
  const t = useTranslations("dashboard.topHoldings");
  const labels = useCategoryLabels();

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("title")}
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
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <span className="text-sm text-muted-foreground">
            {t("empty")}
          </span>
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
          {t("title")}
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
              <span className="text-sm font-medium">
                {labels.name(subcategory.label)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("count", { count: subcategory.holdingsCount })}
              </span>
            </div>

            {/* Holdings list */}
            <div className="space-y-1 ps-5">
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
                      <span>
                        {holding.institutionName ? (
                          <>
                            {holding.institutionName}
                            <span className="text-muted-foreground mx-1">
                              •
                            </span>
                            {holding.name}
                          </>
                        ) : (
                          holding.name
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {formatValue(holding.value)}
                        {currencySuffixes[currency]}
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
