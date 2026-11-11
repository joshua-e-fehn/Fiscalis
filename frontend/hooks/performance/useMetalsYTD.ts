/**
 * Vault YTD for the metals pages (vault items only, unlike the commodities
 * category): the continuous strategy over the vault performance input,
 * ending at live spot. A plain change in value; null without a value at
 * 1 Jan.
 */

import { useMemo } from "react";
import { getContinuousStrategy } from "@/lib/performance";
import type { MetalsCurrency } from "@/lib/types/metals-extended";
import { useVaultPerformanceInput } from "./useContinuousPerformance";

export interface MetalsYTDResult {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtStartOfYear: number | null;
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
    return {
      ytdProfitLoss: metrics?.absoluteChange ?? null,
      ytdProfitLossPercent: metrics?.percentChange ?? null,
      valueAtStartOfYear: metrics?.startValue ?? null,
      isLoading,
    };
  }, [input, isLoading]);
}
