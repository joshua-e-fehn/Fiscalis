// ═══════════════════════════════════════════════════════════════
// Convex World Bank Indicator Hooks
// Uses Convex for instant indicator search with full coverage
// ═══════════════════════════════════════════════════════════════

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Search World Bank indicators using Convex
 * Returns instant results from synced indicator database
 */
export function useConvexIndicatorSearch(
  query: string,
  enabled: boolean = true,
) {
  const results = useQuery(
    api.worldbank.searchIndicators,
    enabled && query.length >= 2 ? { query, limit: 50 } : "skip",
  );

  return {
    data: results,
    isLoading: results === undefined && enabled && query.length >= 2,
    indicators: results?.indicators ?? [],
    totalInDb: results?.totalInDb ?? 0,
  };
}

/**
 * Get sync status for World Bank indicators
 */
export function useWorldBankSyncStatus() {
  const status = useQuery(api.worldbank.getSyncStatus);

  return {
    data: status,
    isLoading: status === undefined,
    lastSync: status?.lastSync,
    indicatorCount: status?.indicatorCount ?? 0,
    syncStatus: status?.syncStatus,
    needsSync: !status?.lastSync || status.indicatorCount === 0,
  };
}

/**
 * Ask the server to re-check an indicator the map could not load, so search
 * stops offering it if the World Bank no longer serves it.
 */
export function useRequestIndicatorCheck() {
  return useMutation(api.worldbank.requestIndicatorCheck);
}

// ═══════════════════════════════════════════════════════════════
// User Favorites Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Get user's favorite indicators
 */
export function useUserFavorites() {
  const favorites = useQuery(api.worldbank.getUserFavorites);

  return {
    data: favorites,
    isLoading: favorites === undefined,
    favorites: favorites ?? [],
  };
}

/**
 * Check if an indicator is favorited
 */
export function useIsIndicatorFavorited(indicatorCode: string) {
  const isFavorited = useQuery(
    api.worldbank.isIndicatorFavorited,
    indicatorCode ? { indicatorCode } : "skip",
  );

  return {
    isFavorited: isFavorited ?? false,
    isLoading: isFavorited === undefined && !!indicatorCode,
  };
}

/**
 * Toggle favorite status mutation
 */
export function useToggleFavorite() {
  const toggle = useMutation(api.worldbank.toggleFavorite);
  return toggle;
}
