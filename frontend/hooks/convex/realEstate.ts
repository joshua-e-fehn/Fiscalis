import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CategorySummary } from "@/lib/types/investments";
import { realEstateSubcategoryUI } from "@/lib/config/categoryUI";
import { subcategoryCards, useCategorySummary } from "./categorySummary";

const SUBCATEGORIES = subcategoryCards(realEstateSubcategoryUI);

/**
 * Real estate category summary: REITs from provider connections; physical
 * property (residential, commercial, land) is manual entry.
 */
export function useRealEstateSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  return useCategorySummary(
    useQuery(api.categories.getRealEstate),
    SUBCATEGORIES,
  );
}
