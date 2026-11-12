/**
 * Commodities category summary: vault metals (valued at the Convex spot
 * mirror) plus Bitpanda and broker metals and other commodities, from the
 * server aggregate (categories.getCommodities), so the page covers the
 * same holdings as the dashboard and the snapshots (M-A1). Values in EUR.
 * A vault item valued at cost (no fresh spot) counts in the value but not
 * in the P/L or its coverage (aggregate.ts profitLossCostBase).
 * The chart's history comes from the one performance entry point
 * (InvestmentDashboardSection, useCategoryChartData).
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CategorySummary } from "@/lib/types/investments";
import { commoditiesSubcategoryUI } from "@/lib/config/categoryUI";
import { subcategoryCards, useCategorySummary } from "./categorySummary";

const SUBCATEGORIES = subcategoryCards(commoditiesSubcategoryUI);

export function useCommoditiesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  return useCategorySummary(
    useQuery(api.categories.getCommodities),
    SUBCATEGORIES,
    5,
  );
}
