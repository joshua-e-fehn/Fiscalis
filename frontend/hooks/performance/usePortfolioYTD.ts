/**
 * YTD card adapters over the one performance entry point
 * (useCategoryPerformance). They only shape its metrics for the existing
 * cards: the baseline, the 'insufficient history' rule and the percent
 * convention all come from services/performance.
 */

import { useMemo } from "react";
import {
  portfolioLiveEnd,
  toPeriodChange,
  useCategoryPerformance,
  type LivePortfolioTotals,
} from "./useCategoryPerformance";

export interface PortfolioYTDResult {
  /** P/L net of flows for an investment category, else the change in value */
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtYearStart: number | null;
  /** First known point when there is no value at 1 Jan; null otherwise */
  trackingSince: number | null;
  /** Some held assets had no price series and are missing from the values */
  partial: boolean;
  /** Net of purchases, deposits and sales (D2): a return, not a change */
  flowAdjusted: boolean;
  /** Some flows were assumed (holdings without a cost basis) */
  flowsEstimated: boolean;
  isLoading: boolean;
}

export interface NetWorthYTDResult {
  ytdChange: number | null;
  ytdChangePercent: number | null;
  valueAtYearStart: number | null;
  currentValue: number | null;
  /** First known point when there is no value at 1 Jan; null otherwise */
  trackingSince: number | null;
  /** Some held assets had no price series and are missing from the values */
  partial: boolean;
  isLoading: boolean;
}

const NET_WORTH = { kind: "netWorth" } as const;

/**
 * YTD change in net worth: a plain change in value, not a return (savings
 * and newly connected accounts raise it). Null figures and `trackingSince`
 * when there is no value at 1 Jan. Given the overview's live totals, it
 * ends at the live net worth, the figure NetWorthCard shows (PF-05).
 */
export function useNetWorthYTD(options?: {
  live?: LivePortfolioTotals;
  enabled?: boolean;
}): NetWorthYTDResult {
  const live = options?.live;
  const { metrics, isLoading } = useCategoryPerformance(NET_WORTH, "YTD", {
    enabled: options?.enabled ?? true,
    liveEnd: live && portfolioLiveEnd("netWorth", live),
  });
  return useMemo(() => {
    const ytd = toPeriodChange(metrics);
    return {
      ytdChange: ytd.change,
      ytdChangePercent: ytd.changePercent,
      valueAtYearStart: ytd.valueAtStart,
      currentValue: metrics?.endValue ?? null,
      trackingSince: ytd.trackingSince,
      partial: ytd.partial,
      isLoading,
    };
  }, [metrics, isLoading]);
}

/**
 * YTD performance of one category (vault metals valued at market prices):
 * flow-adjusted for the investment categories, a plain change otherwise.
 */
export function useCategoryYTD(
  category: string,
  options?: { enabled?: boolean },
): PortfolioYTDResult {
  const measure = useMemo(
    () => ({ kind: "category" as const, category }),
    [category],
  );
  const { metrics, isLoading } = useCategoryPerformance(measure, "YTD", {
    enabled: options?.enabled ?? true,
  });
  return useMemo(() => {
    const ytd = toPeriodChange(metrics);
    return {
      ytdProfitLoss: ytd.change,
      ytdProfitLossPercent: ytd.changePercent,
      valueAtYearStart: ytd.valueAtStart,
      trackingSince: ytd.trackingSince,
      partial: ytd.partial,
      flowAdjusted: ytd.flowAdjusted,
      flowsEstimated: ytd.flowsEstimated,
      isLoading,
    };
  }, [metrics, isLoading]);
}
