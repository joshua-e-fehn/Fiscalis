/**
 * Category summary for the investment category pages (equities, bonds,
 * real estate, crypto, commodities): turns a `categories.get*` query result, whose
 * `summary` the server built with services/portfolio/categorySummary.ts,
 * into the `CategorySummary` the dashboard renders.
 *
 * Value counts every position; cost basis and P/L count only the positions
 * that have a cost basis.
 */

import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { CategoryPosition } from "@/convex/categories";
import type {
  CategorySummary,
  Holding,
  SubcategoryData,
} from "@/lib/types/investments";
import {
  makeSubcategoryBase,
  type SubcategoryUIMeta,
} from "@/lib/config/categoryUI";
import {
  holdingProfitLoss,
  positionToHolding,
  topHoldings,
  type CategoryHolding,
  type HoldingsSummary,
} from "@/../services/portfolio/categorySummary";

/**
 * Result of categories.getEquities / getBonds / getCrypto / getRealEstate /
 * getCommodities
 */
export type CategoryPositionsData = FunctionReturnType<
  typeof api.categories.getEquities
>;

const EMPTY: HoldingsSummary = {
  value: 0,
  count: 0,
  costBasis: null,
  coveredValue: 0,
  profitLoss: null,
  profitLossPercent: null,
  coverage: null,
};

/** The `limit` largest holdings (any source) as dashboard holdings. */
export function toTopHoldingRows(
  holdings: CategoryHolding[],
  subcategoryId: string,
  categoryValue: number,
  limit: number,
): Holding[] {
  return topHoldings(holdings, limit).map((h) => ({
    id: h.id,
    name: h.name,
    subcategoryId,
    value: h.value,
    costBasis: h.costBasis ?? null,
    ...holdingProfitLoss(h),
    allocationPercent: categoryValue > 0 ? (h.value / categoryValue) * 100 : 0,
  }));
}

/** The `limit` largest positions as dashboard holdings. */
export function toTopHoldings(
  positions: CategoryPosition[],
  subcategoryId: string,
  categoryValue: number,
  limit: number,
  name: (p: CategoryPosition) => string = (p) =>
    p.symbol ?? p.name ?? "Unknown",
): Holding[] {
  return toTopHoldingRows(
    positions.map((p) => ({ ...positionToHolding(p), name: name(p) })),
    subcategoryId,
    categoryValue,
    limit,
  );
}

/** P/L fields of a SubcategoryData / CategorySummary from a summary. */
export function summaryProfitLoss(s: HoldingsSummary) {
  return {
    costBasis: s.costBasis,
    profitLoss: s.profitLoss,
    profitLossPercent: s.profitLossPercent,
  };
}

/** A CategorySummary with no YTD (filled elsewhere). */
export function toCategorySummary(
  total: HoldingsSummary,
  subcategories: SubcategoryData[],
): CategorySummary {
  return {
    totalValue: total.value,
    totalCost: total.costBasis,
    profitLoss: total.profitLoss,
    profitLossPercent: total.profitLossPercent,
    profitLossCoverage: total.coverage,
    ytdProfitLoss: null,
    ytdProfitLossPercent: null,
    valueAtYearStart: null,
    subcategories,
  };
}

/** Empty subcategory cards for every entry of a category's UI config. */
export function subcategoryCards(
  ui: Record<string, SubcategoryUIMeta>,
): SubcategoryData[] {
  return Object.entries(ui).map(([slug, meta]) =>
    makeSubcategoryBase(slug, meta),
  );
}

/**
 * Category summary with one card per configured subcategory.
 *
 * @param data the category query result (undefined while loading)
 * @param subcategories the category's subcategory cards from
 *   subcategoryCards(); keep the array stable (module-level constant)
 */
export function useCategorySummary(
  data: CategoryPositionsData | undefined,
  subcategories: SubcategoryData[],
  topHoldingsPerSubcategory = 3,
): { summary: CategorySummary | null; isLoading: boolean } {
  const summary = useMemo<CategorySummary | null>(() => {
    if (data === undefined || data === null) return null;
    const { positions, vaultHoldings, summary: total } = data;
    // Provider positions and vault items (commodities) side by side
    const holdings: CategoryHolding[] = [
      ...positions.map(positionToHolding),
      ...vaultHoldings,
    ];

    return toCategorySummary(
      total,
      subcategories.map((base) => {
        const sub = total.bySubcategory[base.id] ?? EMPTY;
        return {
          ...base,
          totalValue: sub.value,
          ...summaryProfitLoss(sub),
          topHoldings: toTopHoldingRows(
            holdings.filter((h) => h.subcategory === base.id),
            base.id,
            total.value,
            topHoldingsPerSubcategory,
          ),
          holdingsCount: sub.count,
          implemented: sub.count > 0 || base.implemented,
        };
      }),
    );
  }, [data, subcategories, topHoldingsPerSubcategory]);

  return { summary, isLoading: data === undefined };
}
