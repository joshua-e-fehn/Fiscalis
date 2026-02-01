/**
 * Bonds Category Summary Hook
 *
 * Aggregates data from all bond subcategories (Government, Corporate, Municipal, etc.)
 * to provide a unified summary for the category dashboard.
 *
 * Uses real data from broker positions via the categories.getBonds query.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  categoryColorPalettes,
  Holding,
} from "@/lib/types/investments";
import {
  Landmark,
  Building,
  Building2,
  PiggyBank,
  BarChart3,
} from "lucide-react";
import React from "react";

/**
 * Hook to get the bonds category summary
 *
 * This aggregates data from:
 * - Government Bonds (via broker connections)
 * - Corporate Bonds (via broker connections)
 * - Municipal Bonds (via broker connections)
 * - Savings Bonds (manual entry)
 * - Bond Funds & ETFs (via broker connections)
 */
export function useBondsSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  // Fetch real bond data from Convex
  const bondsData = useQuery(api.categories.getBonds);

  const isLoading = bondsData === undefined;

  // Build category summary from real data
  const summary = useMemo<CategorySummary | null>(() => {
    // Return null if not authenticated or still loading
    if (bondsData === undefined || bondsData === null) return null;

    const { positions, summary: dataSummary } = bondsData;
    const colors = categoryColorPalettes.bonds;

    // Helper to get top holdings for a subcategory
    const getTopHoldingsForSubcategory = (
      subcategory: string,
      limit: number = 3,
    ): Holding[] => {
      return positions
        .filter((p) => p.investmentSubcategory === subcategory)
        .sort((a, b) => {
          const aValue = a.valueInBaseCurrency ?? a.marketValue ?? 0;
          const bValue = b.valueInBaseCurrency ?? b.marketValue ?? 0;
          return bValue - aValue;
        })
        .slice(0, limit)
        .map((p) => {
          const value = p.valueInBaseCurrency ?? p.marketValue ?? 0;
          const costBasis = p.totalCostBasis ?? null;
          const profitLoss = p.unrealizedPL ?? null;
          const profitLossPercent =
            costBasis && profitLoss ? (profitLoss / costBasis) * 100 : null;

          return {
            id: p._id,
            name: p.symbol ?? p.name ?? "Unknown",
            subcategoryId: subcategory,
            value,
            costBasis,
            profitLoss,
            profitLossPercent,
            allocationPercent:
              dataSummary.totalValue > 0
                ? (value / dataSummary.totalValue) * 100
                : 0,
          };
        });
    };

    // Helper to calculate subcategory cost basis
    const getSubcategoryCostBasis = (subcategory: string): number | null => {
      const filtered = positions.filter(
        (p) => p.investmentSubcategory === subcategory,
      );
      if (filtered.length === 0) return null;
      const total = filtered.reduce(
        (sum, p) => sum + (p.totalCostBasis ?? 0),
        0,
      );
      return total > 0 ? total : null;
    };

    // Helper to calculate subcategory P/L
    const getSubcategoryPL = (subcategory: string): number | null => {
      const filtered = positions.filter(
        (p) => p.investmentSubcategory === subcategory,
      );
      if (filtered.length === 0) return null;
      const total = filtered.reduce((sum, p) => sum + (p.unrealizedPL ?? 0), 0);
      return total;
    };

    // Build subcategories array with real data
    const subcategories: SubcategoryData[] = [];
    const bySubcategory = dataSummary.bySubcategory;

    // 1. Government Bonds
    const govData = bySubcategory["government"] ?? { count: 0, total: 0 };
    const govCostBasis = getSubcategoryCostBasis("government");
    const govPL = getSubcategoryPL("government");
    subcategories.push({
      id: "government",
      name: "Government Bonds",
      href: "/bonds/government",
      icon: React.createElement(Landmark, { className: "h-4 w-4" }),
      color: colors.government,
      totalValue: govData.total,
      costBasis: govCostBasis,
      profitLoss: govPL,
      profitLossPercent:
        govCostBasis && govPL ? (govPL / govCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("government"),
      holdingsCount: govData.count,
      implemented: true,
    });

    // 2. Corporate Bonds
    const corpData = bySubcategory["corporate"] ?? { count: 0, total: 0 };
    const corpCostBasis = getSubcategoryCostBasis("corporate");
    const corpPL = getSubcategoryPL("corporate");
    subcategories.push({
      id: "corporate",
      name: "Corporate Bonds",
      href: "/bonds/corporate",
      icon: React.createElement(Building, { className: "h-4 w-4" }),
      color: colors.corporate,
      totalValue: corpData.total,
      costBasis: corpCostBasis,
      profitLoss: corpPL,
      profitLossPercent:
        corpCostBasis && corpPL ? (corpPL / corpCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("corporate"),
      holdingsCount: corpData.count,
      implemented: true,
    });

    // 3. Municipal Bonds
    const muniData = bySubcategory["municipal"] ?? { count: 0, total: 0 };
    const muniCostBasis = getSubcategoryCostBasis("municipal");
    const muniPL = getSubcategoryPL("municipal");
    subcategories.push({
      id: "municipal",
      name: "Municipal Bonds",
      href: "/bonds/municipal",
      icon: React.createElement(Building2, { className: "h-4 w-4" }),
      color: colors.municipal,
      totalValue: muniData.total,
      costBasis: muniCostBasis,
      profitLoss: muniPL,
      profitLossPercent:
        muniCostBasis && muniPL ? (muniPL / muniCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("municipal"),
      holdingsCount: muniData.count,
      implemented: true,
    });

    // 4. Savings Bonds
    const savingsData = bySubcategory["savings"] ?? { count: 0, total: 0 };
    const savingsCostBasis = getSubcategoryCostBasis("savings");
    const savingsPL = getSubcategoryPL("savings");
    subcategories.push({
      id: "savings",
      name: "Savings Bonds",
      href: "/bonds/savings",
      icon: React.createElement(PiggyBank, { className: "h-4 w-4" }),
      color: colors.savings,
      totalValue: savingsData.total,
      costBasis: savingsCostBasis,
      profitLoss: savingsPL,
      profitLossPercent:
        savingsCostBasis && savingsPL
          ? (savingsPL / savingsCostBasis) * 100
          : null,
      topHoldings: getTopHoldingsForSubcategory("savings"),
      holdingsCount: savingsData.count,
      implemented: false, // Manual entry, not via broker integration
    });

    // 5. Bond Funds & ETFs
    const fundsData = bySubcategory["funds"] ?? { count: 0, total: 0 };
    const fundsCostBasis = getSubcategoryCostBasis("funds");
    const fundsPL = getSubcategoryPL("funds");
    subcategories.push({
      id: "funds",
      name: "Bond Funds & ETFs",
      href: "/bonds/funds",
      icon: React.createElement(BarChart3, { className: "h-4 w-4" }),
      color: colors.funds,
      totalValue: fundsData.total,
      costBasis: fundsCostBasis,
      profitLoss: fundsPL,
      profitLossPercent:
        fundsCostBasis && fundsPL ? (fundsPL / fundsCostBasis) * 100 : null,
      topHoldings: getTopHoldingsForSubcategory("funds"),
      holdingsCount: fundsData.count,
      implemented: true,
    });

    // Calculate totals
    const totalValue = dataSummary.totalValue;
    const totalCostBasis = positions.reduce(
      (sum, p) => sum + (p.totalCostBasis ?? 0),
      0,
    );
    const totalCost = totalCostBasis > 0 ? totalCostBasis : null;
    const totalPL = positions.reduce(
      (sum, p) => sum + (p.unrealizedPL ?? 0),
      0,
    );
    const profitLoss = totalPL !== 0 ? totalPL : null;
    const profitLossPercent =
      totalCost && profitLoss ? (profitLoss / totalCost) * 100 : null;

    // TODO: Implement historical data points for chart
    const historyDataPoints: PortfolioDataPoint[] = [];

    return {
      totalValue,
      totalCost,
      profitLoss,
      profitLossPercent,
      ytdProfitLoss: null, // TODO: Calculate from historical data
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
      historyDataPoints,
    };
  }, [bondsData]);

  return {
    summary,
    isLoading,
  };
}
