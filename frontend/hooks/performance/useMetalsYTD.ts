/**
 * Vault YTD for the metals pages (vault items only, unlike the commodities
 * category): the one entry point (useCategoryPerformance) measuring the
 * vault source alone, which the continuous strategy values, ending at live
 * spot. Net of purchases made this year (D2): a coin bought in March is a
 * flow at its cost, not a gain. Null without a value at 1 Jan.
 */

import type { MetalsCurrency } from "@/lib/types/metals-extended";
import { toPeriodChange, useCategoryPerformance } from "./useCategoryPerformance";

const VAULT = { kind: "source", source: "vault" } as const;

export interface MetalsYTDResult {
  /** P/L since 1 Jan net of this year's purchases */
  ytdProfitLoss: number | null;
  /** Time-weighted return since 1 Jan */
  ytdProfitLossPercent: number | null;
  valueAtStartOfYear: number | null;
  /** Purchases are separated from the gain (false without vault data) */
  flowAdjusted: boolean;
  /** A purchase without a price had no spot on its date */
  flowsEstimated: boolean;
  isLoading: boolean;
}

export function useMetalsYTD(
  currency: MetalsCurrency = "eur",
  options?: { enabled?: boolean },
): MetalsYTDResult {
  const { metrics, isLoading } = useCategoryPerformance(VAULT, "YTD", {
    currency,
    enabled: options?.enabled ?? true,
  });
  const ytd = toPeriodChange(metrics);
  return {
    ytdProfitLoss: ytd.change,
    ytdProfitLossPercent: ytd.changePercent,
    valueAtStartOfYear: ytd.valueAtStart,
    flowAdjusted: ytd.flowAdjusted,
    flowsEstimated: ytd.flowsEstimated,
    isLoading,
  };
}
