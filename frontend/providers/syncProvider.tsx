"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { toActionError } from "@/lib/actionError";
import {
  summarizeSyncResult,
  type SyncOutcome,
} from "@/../services/portfolio/syncOutcome";
import {
  parseRateLimitedError,
  retryAfterMinutes,
} from "@/../services/security/rateLimit";

export type { SyncOutcome } from "@/../services/portfolio/syncOutcome";

// ═══════════════════════════════════════════════════════════════
// SYNC CONTEXT TYPES
// ═══════════════════════════════════════════════════════════════

export type SyncStatus = "idle" | "syncing" | "success" | "partial" | "error";

export interface SyncResult {
  success: boolean;
  plaid: {
    success: boolean;
    itemsSynced: number;
    error?: string;
  };
  snaptrade: {
    success: boolean;
    connectionsProcessed: number;
    accountsProcessed: number;
    positionsProcessed: number;
    error?: string;
  };
  bitpanda: {
    success: boolean;
    connectionsSynced: number;
    error?: string;
  };
  snapshot: {
    success: boolean;
    totalAssets?: number;
    totalLiabilities?: number;
    netWorth?: number;
    error?: string;
  };
}

export interface SyncContextValue {
  // Global sync state
  isGlobalSyncing: boolean;
  globalSyncStatus: SyncStatus;
  /** What the last run did, worded by the sync button; null when idle or syncing */
  globalSyncOutcome: SyncOutcome | null;
  lastSyncResult: SyncResult | null;

  // Per-provider sync state (for granular UI updates)
  isPlaidSyncing: boolean;
  isSnaptradeSyncing: boolean;
  isBitpandaSyncing: boolean;

  // Actions
  syncAll: () => Promise<SyncResult>;
  resetStatus: () => void;
}

// ═══════════════════════════════════════════════════════════════
// SYNC CONTEXT
// ═══════════════════════════════════════════════════════════════

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSyncContext must be used within a SyncProvider");
  }
  return context;
}

// Optional hook that returns undefined if not in provider (safe for components that may be outside)
export function useSyncContextSafe() {
  return useContext(SyncContext);
}

// ═══════════════════════════════════════════════════════════════
// SYNC PROVIDER
// ═══════════════════════════════════════════════════════════════

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const syncAllAction = useAction(api.actions.syncAll.syncAllProviders);
  const tErrors = useTranslations("common.errors");

  // Global state
  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);
  const [globalSyncStatus, setGlobalSyncStatus] = useState<SyncStatus>("idle");
  const [globalSyncOutcome, setGlobalSyncOutcome] =
    useState<SyncOutcome | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Per-provider state
  const [isPlaidSyncing, setIsPlaidSyncing] = useState(false);
  const [isSnaptradeSyncing, setIsSnaptradeSyncing] = useState(false);
  const [isBitpandaSyncing, setIsBitpandaSyncing] = useState(false);

  const resetStatus = useCallback(() => {
    setGlobalSyncStatus("idle");
    setGlobalSyncOutcome(null);
  }, []);

  const syncAll = useCallback(async (): Promise<SyncResult> => {
    setIsGlobalSyncing(true);
    setGlobalSyncStatus("syncing");
    setGlobalSyncOutcome(null);

    // Set all providers to syncing
    setIsPlaidSyncing(true);
    setIsSnaptradeSyncing(true);
    setIsBitpandaSyncing(true);

    try {
      const result = await syncAllAction();
      setLastSyncResult(result);

      const outcome = summarizeSyncResult(result);
      setGlobalSyncStatus(outcome.status);
      setGlobalSyncOutcome(outcome);

      // Reset status after delay
      setTimeout(() => {
        resetStatus();
      }, 3000);

      return result;
    } catch (err) {
      // A rate-limited sync is shown as "try again in N min" (lib/actionError.ts)
      const error = toActionError(err, (minutes) =>
        tErrors("rateLimited", { minutes }),
      );
      console.error("Sync all error:", error);
      const limited =
        err instanceof ConvexError ? parseRateLimitedError(err.data) : null;
      setGlobalSyncStatus("error");
      setGlobalSyncOutcome({
        status: "error",
        failed: [],
        ...(limited && {
          retryAfterMinutes: retryAfterMinutes(limited.retryAfter),
        }),
      });

      const errorResult: SyncResult = {
        success: false,
        plaid: { success: false, itemsSynced: 0, error: "Sync failed" },
        snaptrade: {
          success: false,
          connectionsProcessed: 0,
          accountsProcessed: 0,
          positionsProcessed: 0,
          error: "Sync failed",
        },
        bitpanda: { success: false, connectionsSynced: 0, error: "Sync failed" },
        snapshot: { success: false, error: "Sync failed" },
      };
      setLastSyncResult(errorResult);

      setTimeout(() => {
        resetStatus();
      }, 3000);

      return errorResult;
    } finally {
      setIsGlobalSyncing(false);
      setIsPlaidSyncing(false);
      setIsSnaptradeSyncing(false);
      setIsBitpandaSyncing(false);
    }
  }, [syncAllAction, resetStatus, tErrors]);

  const value = useMemo<SyncContextValue>(
    () => ({
      isGlobalSyncing,
      globalSyncStatus,
      globalSyncOutcome,
      lastSyncResult,
      isPlaidSyncing,
      isSnaptradeSyncing,
      isBitpandaSyncing,
      syncAll,
      resetStatus,
    }),
    [
      isGlobalSyncing,
      globalSyncStatus,
      globalSyncOutcome,
      lastSyncResult,
      isPlaidSyncing,
      isSnaptradeSyncing,
      isBitpandaSyncing,
      syncAll,
      resetStatus,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
