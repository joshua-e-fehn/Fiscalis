import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CategorySummary } from "@/lib/types/investments";
import { bondsSubcategoryUI } from "@/lib/config/categoryUI";
import { subcategoryCards, useCategorySummary } from "./categorySummary";

const SUBCATEGORIES = subcategoryCards(bondsSubcategoryUI);

/**
 * Bonds category summary: government, corporate and municipal bonds and bond
 * funds from provider connections, plus savings bonds (manual entry).
 */
export function useBondsSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  return useCategorySummary(useQuery(api.categories.getBonds), SUBCATEGORIES);
}
