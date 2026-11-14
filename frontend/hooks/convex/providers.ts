"use client";

/**
 * Provider Hooks
 *
 * Unified positions across all financial providers (Plaid, SnapTrade,
 * Bitpanda, manual entries), read through the server's shared net-worth
 * loader (convex/portfolio.ts getUnifiedPositions). Net worth and category
 * totals come from portfolio.getOverview (hooks/convex/portfolio.ts).
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FinancialProvider } from "@/lib/types/portfolio";
import { scaleMoney } from "@/../services/finance/displayCurrency";
import { useDisplayCurrency } from "./displayCurrency";

/** The EUR fields of a unified position (convex/portfolio.ts UnifiedPosition) */
const POSITION_BASE_FIELDS = [
  "valueInBaseCurrency",
  "costBasis",
  "unrealizedPL",
] as const;

/**
 * Hook to get all positions across all providers, sorted by value. The
 * server values them in EUR; valueInBaseCurrency, costBasis and
 * unrealizedPL come back in the display currency (`currency`) at the
 * latest rate. marketValue and currentPrice stay in the position's own
 * currency.
 */
export function useUnifiedPositions(options?: {
  limit?: number;
  provider?: FinancialProvider;
}) {
  const result = useQuery(api.portfolio.getUnifiedPositions, {
    limit: options?.limit,
    provider: options?.provider,
  });
  const display = useDisplayCurrency();
  const { unitsPerEur } = display;

  // No positions until the rate is known
  const positions = useMemo(
    () =>
      display.isLoading
        ? []
        : (result ?? []).map((p) =>
            scaleMoney(p, POSITION_BASE_FIELDS, unitsPerEur),
          ),
    [result, display.isLoading, unitsPerEur],
  );

  return {
    positions,
    currency: display.currency,
    isLoading: result === undefined || display.isLoading,
  };
}
