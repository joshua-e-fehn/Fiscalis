/**
 * Category Profit/Loss Hook
 *
 * The P/L a category page shows, resolved once by
 * `resolveCategoryProfitLoss` (services/portfolio/categorySummary.ts) so the
 * KPI card and the chart's cost line always agree:
 * 1. the holdings' own cost basis (coverage-based, from the category summary);
 * 2. otherwise the category's first non-zero snapshot value as an inferred
 *    cost basis, for providers that report no cost basis at all.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  resolveCategoryProfitLoss,
  type ResolvedProfitLoss,
} from "@/../services/portfolio/categorySummary";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CategoryProfitLossResult extends ResolvedProfitLoss {
  /** Loading state (snapshots, only needed without a holdings cost basis) */
  isLoading: boolean;
}

export interface UseCategoryProfitLossOptions {
  /** The category to calculate P/L for */
  category: string;
  /** Current value of the category (from live data) */
  currentValue: number;
  /** Cost basis and P/L of the holdings, from the category summary */
  holdings: {
    costBasis: number | null;
    profitLoss: number | null;
    profitLossPercent: number | null;
  } | null;
  /** Whether to enable the query */
  enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a category's P/L (see the module comment for the precedence).
 *
 * @example
 * ```tsx
 * const { profitLoss, profitLossPercent, costBasis, source } =
 *   useCategoryProfitLoss({
 *     category: "crypto",
 *     currentValue: summary.totalValue,
 *     holdings: { costBasis: summary.totalCost, profitLoss: summary.profitLoss,
 *                 profitLossPercent: summary.profitLossPercent },
 *   });
 * ```
 */
export function useCategoryProfitLoss(
  options: UseCategoryProfitLossOptions,
): CategoryProfitLossResult {
  const { category, currentValue, holdings, enabled = true } = options;

  // Snapshots are only needed when the holdings carry no cost basis
  const needsSnapshots =
    enabled && (holdings?.costBasis == null || holdings.profitLoss == null);

  const rawSnapshots = useQuery(
    api.portfolioSnapshots.getSnapshots,
    needsSnapshots ? { limit: 730 } : "skip",
  );

  const firstSnapshotValue = useMemo(() => {
    if (!rawSnapshots) return null;
    const sorted = [...rawSnapshots].sort((a, b) => a.timestamp - b.timestamp);
    for (const snapshot of sorted) {
      const value = snapshot.categoryBreakdown?.find(
        (c) => c.category === category,
      )?.value;
      if (value !== undefined && value > 0) return value;
    }
    return null;
  }, [category, rawSnapshots]);

  const resolved = useMemo(
    () =>
      resolveCategoryProfitLoss({ currentValue, holdings, firstSnapshotValue }),
    [currentValue, holdings, firstSnapshotValue],
  );

  return {
    ...resolved,
    isLoading: needsSnapshots && rawSnapshots === undefined,
  };
}
