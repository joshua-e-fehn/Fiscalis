/**
 * YTD card adapters over the one performance entry point
 * (useCategoryPerformance). They only shape its metrics for the existing
 * cards: the baseline, the 'insufficient history' rule and the percent
 * convention all come from services/performance.
 */

import { useMemo } from "react";
import { toPeriodChange, useCategoryPerformance } from "./useCategoryPerformance";

export interface PortfolioYTDResult {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtYearStart: number | null;
  /** Some held assets had no price series and are missing from the values */
  partial: boolean;
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
 * when there is no value at 1 Jan.
 */
export function useNetWorthYTD(options?: {
  enabled?: boolean;
}): NetWorthYTDResult {
  const { metrics, isLoading } = useCategoryPerformance(NET_WORTH, "YTD", {
    enabled: options?.enabled ?? true,
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

/** YTD change of one category (vault metals valued at market prices). */
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
      partial: ytd.partial,
      isLoading,
    };
  }, [metrics, isLoading]);
}
