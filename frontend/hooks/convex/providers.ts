"use client";

/**
 * Provider Hooks
 *
 * Hooks for aggregating data across all financial providers
 * (Plaid, SnapTrade, Bitpanda) for unified portfolio views.
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  FinancialProvider,
  ProviderAllocation,
  NetWorthByProvider,
} from "@/lib/types/portfolio";

// ═══════════════════════════════════════════════════════════════
// NET WORTH HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get total net worth across all providers
 * Returns detailed breakdown by provider and category
 */
export function useNetWorthByProvider(): {
  data: NetWorthByProvider | null;
  isLoading: boolean;
} {
  const result = useQuery(api.portfolio.getTotalNetWorth);

  if (result === undefined) {
    return { data: null, isLoading: true };
  }

  if (result === null) {
    return { data: null, isLoading: false };
  }

  return {
    data: {
      total: result.total,
      providers: {
        plaid: {
          total: result.providers.plaid.total,
          cash: result.providers.plaid.cash,
          investments: result.providers.plaid.investments,
          accountsCount: result.providers.plaid.accountsCount,
        },
        snaptrade: {
          total: result.providers.snaptrade.total,
          equities: result.providers.snaptrade.equities,
          bonds: result.providers.snaptrade.bonds,
          cash: result.providers.snaptrade.cash,
          other: result.providers.snaptrade.other,
          positionsCount: result.providers.snaptrade.positionsCount,
          accountsCount: result.providers.snaptrade.accountsCount,
        },
        bitpanda: {
          total: result.providers.bitpanda.total,
          crypto: result.providers.bitpanda.crypto,
          equities: result.providers.bitpanda.equities,
          commodities: result.providers.bitpanda.commodities,
          cash: result.providers.bitpanda.cash,
          other: result.providers.bitpanda.other,
          holdingsCount: result.providers.bitpanda.holdingsCount,
          connectionsCount: result.providers.bitpanda.connectionsCount,
        },
      },
      lastUpdated: result.lastUpdated,
    },
    isLoading: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER ALLOCATION HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get allocation breakdown by provider for charts
 */
export function useProviderAllocation(): {
  allocations: ProviderAllocation[];
  totalValue: number;
  isLoading: boolean;
} {
  const result = useQuery(api.portfolio.getProviderAllocation);

  if (result === undefined) {
    return { allocations: [], totalValue: 0, isLoading: true };
  }

  if (result === null) {
    return { allocations: [], totalValue: 0, isLoading: false };
  }

  return {
    allocations: result.allocations as ProviderAllocation[],
    totalValue: result.totalValue,
    isLoading: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED POSITIONS HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all positions across all providers
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

/**
 * Hook to get top positions by value
 */
export function useTopPositions(limit: number = 10) {
  return useUnifiedPositions({ limit });
}

/**
 * Hook to get positions filtered by provider
 */
export function usePositionsByProvider(provider: FinancialProvider) {
  return useUnifiedPositions({ provider });
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY BREAKDOWN HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get category breakdown across all providers
 */
export function useCategoryBreakdown(): {
  categories: Array<{
    category: string;
    name: string;
    value: number;
    percentage: number;
    positionsCount: number;
    providers: string[];
  }>;
  totalValue: number;
  isLoading: boolean;
} {
  const result = useQuery(api.portfolio.getCategoryBreakdown);

  if (result === undefined) {
    return { categories: [], totalValue: 0, isLoading: true };
  }

  if (result === null) {
    return { categories: [], totalValue: 0, isLoading: false };
  }

  return {
    categories: result.categories,
    totalValue: result.totalValue,
    isLoading: false,
  };
}
