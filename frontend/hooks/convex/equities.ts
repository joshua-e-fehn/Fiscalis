import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CategorySummary } from "@/lib/types/investments";
import { equitiesSubcategoryUI } from "@/lib/config/categoryUI";
import { subcategoryCards, useCategorySummary } from "./categorySummary";

const SUBCATEGORIES = subcategoryCards(equitiesSubcategoryUI);

/**
 * Equities category summary: stocks, ETFs, funds and options from broker
 * connections and Bitpanda, plus private equity (manual entry).
 */
export function useEquitiesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  return useCategorySummary(
    useQuery(api.categories.getEquities),
    SUBCATEGORIES,
  );
}
