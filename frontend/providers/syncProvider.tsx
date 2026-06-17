"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

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
  globalSyncMessage: string;
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

  // Global state
  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);
  const [globalSyncStatus, setGlobalSyncStatus] = useState<SyncStatus>("idle");
  const [globalSyncMessage, setGlobalSyncMessage] = useState("");
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Per-provider state
  const [isPlaidSyncing, setIsPlaidSyncing] = useState(false);
  const [isSnaptradeSyncing, setIsSnaptradeSyncing] = useState(false);
  const [isBitpandaSyncing, setIsBitpandaSyncing] = useState(false);

  const resetStatus = useCallback(() => {
    setGlobalSyncStatus("idle");
    setGlobalSyncMessage("");
  }, []);

  const syncAll = useCallback(async (): Promise<SyncResult> => {
    setIsGlobalSyncing(true);
    setGlobalSyncStatus("syncing");
    setGlobalSyncMessage("Syncing all accounts...");

    // Set all providers to syncing
    setIsPlaidSyncing(true);
    setIsSnaptradeSyncing(true);
    setIsBitpandaSyncing(true);

    try {
      const result = await syncAllAction();
      setLastSyncResult(result);

      // Build status message
      const successes: string[] = [];
      const failures: string[] = [];

      if (result.plaid.success && result.plaid.itemsSynced > 0) {
        successes.push(`Banking (${result.plaid.itemsSynced})`);
      } else if (result.plaid.error) {
        failures.push("Banking");
      }

      if (result.snaptrade.success && result.snaptrade.positionsProcessed > 0) {
        successes.push(`Brokers (${result.snaptrade.positionsProcessed})`);
      } else if (result.snaptrade.error) {
        failures.push("Brokers");
      }

      if (result.bitpanda.success && result.bitpanda.connectionsSynced > 0) {
        successes.push(`Bitpanda (${result.bitpanda.connectionsSynced})`);
      } else if (result.bitpanda.error) {
        failures.push("Bitpanda");
      }

      if (result.success) {
        setGlobalSyncStatus("success");
        setGlobalSyncMessage(
          successes.length > 0
            ? `Synced: ${successes.join(", ")}`
            : "Sync complete",
        );
      } else if (successes.length > 0) {
        setGlobalSyncStatus("partial");
        setGlobalSyncMessage(
          `Synced: ${successes.join(", ")}. Failed: ${failures.join(", ")}`,
        );
      } else {
        setGlobalSyncStatus("error");
        setGlobalSyncMessage(
          failures.length > 0
            ? `Failed: ${failures.join(", ")}`
            : "Sync failed",
        );
      }

      // Reset status after delay
      setTimeout(() => {
        resetStatus();
      }, 3000);

      return result;
    } catch (error) {
      console.error("Sync all error:", error);
      setGlobalSyncStatus("error");
      setGlobalSyncMessage(
        error instanceof Error ? error.message : "Sync failed",
      );

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
  }, [syncAllAction, resetStatus]);

  const value = useMemo<SyncContextValue>(
    () => ({
      isGlobalSyncing,
      globalSyncStatus,
      globalSyncMessage,
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
      globalSyncMessage,
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
