import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CategorySummary } from "@/lib/types/investments";
import { collectiblesSubcategoryUI } from "@/lib/config/categoryUI";
import { subcategoryCards, useCategorySummary } from "./categorySummary";

const SUBCATEGORIES = subcategoryCards(collectiblesSubcategoryUI);

/**
 * Collectibles category summary: the manual assets recorded as art,
 * watches, wine, cars and the rest, from the server aggregate
 * (categories.getCollectibles), so the page agrees with the dashboard and
 * the snapshots. Values in the display currency.
 */
export function useCollectiblesSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  return useCategorySummary(
    useQuery(api.categories.getCollectibles),
    SUBCATEGORIES,
  );
}
