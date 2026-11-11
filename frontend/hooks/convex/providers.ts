"use client";

/**
 * Provider Hooks
 *
 * Unified positions across all financial providers (Plaid, SnapTrade,
 * Bitpanda, manual entries), read through the server's shared net-worth
 * loader (convex/portfolio.ts getUnifiedPositions). Net worth and category
 * totals come from portfolio.getOverview (hooks/convex/portfolio.ts).
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FinancialProvider } from "@/lib/types/portfolio";

/**
 * Hook to get all positions across all providers, sorted by value in EUR
 */
export function useUnifiedPositions(options?: {
  limit?: number;
  provider?: FinancialProvider;
}) {
  const result = useQuery(api.portfolio.getUnifiedPositions, {
    limit: options?.limit,
    provider: options?.provider,
  });

  return {
    positions: result ?? [],
    isLoading: result === undefined,
  };
}
