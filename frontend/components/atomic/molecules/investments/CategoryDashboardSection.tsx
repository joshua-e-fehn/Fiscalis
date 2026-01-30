"use client";

import { cn } from "@/lib/utils";
import {
  CategorySummary,
  InvestmentCurrency,
  calculateYTDPerformance,
} from "@/lib/types/investments";
import {
  CategoryValueCard,
  CategoryProfitLossCard,
  CategoryYTDCard,
} from "./CategoryKPICards";
import { CategoryAllocationChart } from "./CategoryAllocationChart";
import { CategoryPerformanceChart } from "./CategoryPerformanceChart";
import { TopHoldingsList } from "./TopHoldingsList";

interface CategoryDashboardSectionProps {
  summary: CategorySummary | null;
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  showTopHoldings?: boolean;
  className?: string;
}

/**
 * Category Dashboard Section
 *
 * A complete dashboard section for investment category pages that displays:
 * - 3 KPI cards (Total Value, P/L, YTD Performance)
 * - Allocation donut chart (by subcategory)
 * - Performance line chart
 * - Optionally: Top holdings list grouped by subcategory
 *
 * Handles all empty states gracefully.
 */
export function CategoryDashboardSection({
  summary,
  currency = "eur",
  isLoading = false,
  showTopHoldings = true,
  className,
}: CategoryDashboardSectionProps) {
  // Calculate YTD if not already provided
  const ytdData = summary
    ? calculateYTDPerformance(
        summary.totalValue,
        summary.totalCost,
        summary.historyDataPoints,
      )
    : { ytdProfitLoss: null, ytdProfitLossPercent: null };

  // Use summary's YTD if available, otherwise use calculated
  const ytdProfitLoss = summary?.ytdProfitLoss ?? ytdData.ytdProfitLoss;
  const ytdProfitLossPercent =
    summary?.ytdProfitLossPercent ?? ytdData.ytdProfitLossPercent;

  // Check if there are any holdings with top holdings to show
  const hasTopHoldings =
    summary?.subcategories.some((s) => s.topHoldings.length > 0) ?? false;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CategoryValueCard
          totalValue={summary?.totalValue ?? 0}
          currency={currency}
          isLoading={isLoading}
        />
        <CategoryProfitLossCard
          profitLoss={summary?.profitLoss ?? null}
          profitLossPercent={summary?.profitLossPercent ?? null}
          currency={currency}
          isLoading={isLoading}
        />
        <CategoryYTDCard
          ytdProfitLoss={ytdProfitLoss}
          ytdProfitLossPercent={ytdProfitLossPercent}
          currency={currency}
          isLoading={isLoading}
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryAllocationChart
          subcategories={summary?.subcategories ?? []}
          isLoading={isLoading}
        />
        <CategoryPerformanceChart
          dataPoints={summary?.historyDataPoints ?? []}
          currentValue={summary?.totalValue ?? 0}
          totalCost={summary?.totalCost ?? null}
          currency={currency}
          isLoading={isLoading}
        />
      </div>

      {/* Row 3: Top Holdings (optional) */}
      {showTopHoldings && hasTopHoldings && (
        <TopHoldingsList
          subcategories={summary?.subcategories ?? []}
          currency={currency}
          maxHoldingsPerSubcategory={3}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
