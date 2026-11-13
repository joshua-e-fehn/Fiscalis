/**
 * Category Profit/Loss Hook
 *
 * The P/L a category page shows, resolved once by
 * `resolveCategoryProfitLoss` (services/portfolio/categorySummary.ts) for the
 * P/L KPI card:
 * 1. the holdings' own cost basis (coverage-based, from the category summary);
 * 2. otherwise, for an investment category, its performance since tracking
 *    started from the one performance entry point: net of purchases and
 *    deposits where the snapshots show them (D2), else labelled a change.
 *    The first snapshot is never taken as a cost basis.
 *
 * The chart's cost line is the engine series' own (useCategoryChartData).
 */

import { useMemo } from "react";
import {
  resolveCategoryProfitLoss,
  type ResolvedProfitLoss,
} from "@/../services/portfolio/categorySummary";
import { isFlowAdjustedCategory } from "@/../services/portfolio/aggregate";
import { toPeriodChange, useCategoryPerformance } from "./useCategoryPerformance";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CategoryProfitLossResult extends ResolvedProfitLoss {
  /** Loading state (history, only needed without a holdings cost basis) */
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
 * const { profitLoss, profitLossPercent, source, flowAdjusted } =
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

  // History is only needed when the holdings carry no cost basis, and only
  // investment categories report performance (cash is a plain balance)
  const needsHistory =
    enabled &&
    isFlowAdjustedCategory(category) &&
    (holdings?.costBasis == null || holdings.profitLoss == null);

  const measure = useMemo(
    () => ({ kind: "category" as const, category }),
    [category],
  );
  const { metrics, isLoading } = useCategoryPerformance(measure, "ALL", {
    baseline: "firstPoint",
    enabled: needsHistory,
  });

  const sinceTracking = useMemo(() => {
    const p = toPeriodChange(metrics);
    return p.change !== null && metrics?.firstPointTimestamp != null
      ? {
          change: p.change,
          changePercent: p.changePercent,
          since: metrics.firstPointTimestamp,
          flowAdjusted: p.flowAdjusted,
          flowsEstimated: p.flowsEstimated,
        }
      : null;
  }, [metrics]);

  const resolved = useMemo(
    () => resolveCategoryProfitLoss({ currentValue, holdings, sinceTracking }),
    [currentValue, holdings, sinceTracking],
  );

  return { ...resolved, isLoading: needsHistory && isLoading };
}
