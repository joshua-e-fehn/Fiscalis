/**
 * Commodities category summary: vault metals (valued at the Convex spot
 * mirror) plus Bitpanda and broker metals and other commodities, from the
 * server aggregate (categories.getCommodities), so the page covers the
 * same holdings as the dashboard and the snapshots (M-A1). Values in EUR.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCategoryPerformance } from "@/hooks/performance";
import type { CategorySummary, PortfolioDataPoint } from "@/lib/types/investments";
import { commoditiesSubcategoryUI } from "@/lib/config/categoryUI";
import { subcategoryCards, useCategorySummary } from "./categorySummary";

const SUBCATEGORIES = subcategoryCards(commoditiesSubcategoryUI);
const COMMODITIES = { kind: "category", category: "commodities" } as const;

export function useCommoditiesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  const { summary: base, isLoading } = useCategorySummary(
    useQuery(api.categories.getCommodities),
    SUBCATEGORIES,
    5,
  );

  // History from the one performance entry point: the hybrid commodities
  // measure (vault at historical spot, Bitpanda and broker metals from the
  // snapshots). The YTD card reads the same measure (useCategoryYTD).
  const history = useCategoryPerformance(COMMODITIES, "Year", {
    includeDataPoints: true,
  });

  const summary = useMemo<CategorySummary | null>(() => {
    if (!base) return null;
    // The chart's cost line, null (a gap) where unknown
    const historyDataPoints: PortfolioDataPoint[] = history.dataPoints.map(
      (dp) => ({
        date: new Date(dp.timestamp).toLocaleDateString("de-DE"),
        timestamp: dp.timestamp,
        value: dp.value,
        cost: dp.costBasis,
      }),
    );
    return { ...base, historyDataPoints };
  }, [base, history.dataPoints]);

  return { summary, isLoading: isLoading || history.isLoading };
}
