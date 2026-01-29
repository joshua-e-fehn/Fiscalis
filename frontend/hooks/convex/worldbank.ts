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
    warningCount: status?.warningCount ?? 0,
    errorCount: status?.errorCount ?? 0,
    syncStatus: status?.syncStatus,
    needsSync: !status?.lastSync || status.indicatorCount === 0,
  };
}

/**
 * Trigger manual sync of World Bank indicators
 */
export function useSyncWorldBankIndicators() {
  // Note: Actions are called differently than mutations
  // This returns a function that can be called to trigger the sync
  return {
    // The sync action needs to be triggered via a different mechanism
    // since Convex actions are HTTP actions, not real-time
    syncAll: async () => {
      // Call the action via fetch to the Convex HTTP endpoint
      const response = await fetch("/api/worldbank/sync", { method: "POST" });
      return response.json();
    },
  };
}

/**
 * Record a timeout for an indicator
 */
export function useRecordIndicatorTimeout() {
  const recordTimeout = useMutation(api.worldbank.recordIndicatorTimeout);
  return recordTimeout;
}

/**
 * Record a successful load for an indicator
 */
export function useRecordIndicatorSuccess() {
  const recordSuccess = useMutation(api.worldbank.recordIndicatorSuccess);
  return recordSuccess;
}

/**
 * Get indicator by code (for checking status)
 */
export function useIndicatorByCode(code: string) {
  const indicator = useQuery(
    api.worldbank.getIndicatorByCode,
    code ? { code } : "skip",
  );

  return {
    data: indicator,
    isLoading: indicator === undefined && !!code,
    status: indicator?.status ?? "ok",
    timeoutCount: indicator?.timeoutCount ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// User Favorites Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Get user's favorite indicators
 */
export function useUserFavorites(userId: string | undefined) {
  const favorites = useQuery(
    api.worldbank.getUserFavorites,
    userId ? { userId } : "skip",
  );

  return {
    data: favorites,
    isLoading: favorites === undefined && !!userId,
    favorites: favorites ?? [],
  };
}

/**
 * Check if an indicator is favorited
 */
export function useIsIndicatorFavorited(
  userId: string | undefined,
  indicatorCode: string,
) {
  const isFavorited = useQuery(
    api.worldbank.isIndicatorFavorited,
    userId && indicatorCode ? { userId, indicatorCode } : "skip",
  );

  return {
    isFavorited: isFavorited ?? false,
    isLoading: isFavorited === undefined && !!userId && !!indicatorCode,
  };
}

/**
 * Toggle favorite status mutation
 */
export function useToggleFavorite() {
  const toggle = useMutation(api.worldbank.toggleFavorite);
  return toggle;
}
