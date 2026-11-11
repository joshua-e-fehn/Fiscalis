/**
 * Vault YTD for the metals pages (vault items only, unlike the commodities
 * category): the continuous strategy over the vault performance input,
 * ending at live spot. Net of purchases made this year (D2): a coin bought
 * in March is a flow at its cost, not a gain. Null without a value at
 * 1 Jan.
 */

import { useMemo } from "react";
import { getContinuousStrategy } from "@/lib/performance";
import type { MetalsCurrency } from "@/lib/types/metals-extended";
import { toPeriodChange } from "./useCategoryPerformance";
import { useVaultPerformanceInput } from "./useContinuousPerformance";

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
  const { input, isLoading } = useVaultPerformanceInput({
    timeRange: "YTD",
    currency,
    enabled: options?.enabled ?? true,
  });

  return useMemo<MetalsYTDResult>(() => {
    const metrics = input
      ? getContinuousStrategy().calculate(input, { timeRange: "YTD" }).metrics
      : null;
    const ytd = toPeriodChange(metrics);
    return {
      ytdProfitLoss: ytd.change,
      ytdProfitLossPercent: ytd.changePercent,
      valueAtStartOfYear: ytd.valueAtStart,
      flowAdjusted: ytd.flowAdjusted,
      flowsEstimated: ytd.flowsEstimated,
      isLoading,
    };
  }, [input, isLoading]);
}
