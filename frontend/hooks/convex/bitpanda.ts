"use client";

/**
 * Bitpanda Hooks
 *
 * Hooks for the Bitpanda integration. Unlike the OAuth providers, Bitpanda
 * connects via a per-user read-only API key (no popup/OAuth flow).
 */

import { useState, useCallback } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// ═══════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════

/** All Bitpanda connections for the current user (API key never exposed). */
export function useBitpandaConnections() {
  return useQuery(api.bitpanda.getConnections);
}

/** Bitpanda connections in an error state (e.g. revoked key). */
export function useBitpandaConnectionsNeedingAttention() {
  return useQuery(api.bitpanda.getConnectionsNeedingAttention);
}

/** Bitpanda holdings, optionally scoped to one connection. */
export function useBitpandaHoldings(connectionId?: Id<"bitpandaConnections">) {
  return useQuery(api.bitpanda.getHoldings, { connectionId });
}

/** Bitpanda holdings filtered by investment category. */
export function useBitpandaHoldingsByCategory(category: string) {
  return useQuery(api.bitpanda.getHoldingsByCategory, { category });
}

/** Bitpanda transactions, optionally scoped to one connection. */
export function useBitpandaTransactions(
  connectionId?: Id<"bitpandaConnections">,
) {
  return useQuery(api.bitpanda.getTransactions, { connectionId });
}

// ═══════════════════════════════════════════════════════════════
// ACTION / MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════

/** Connect a Bitpanda account by validating and storing a read-only API key. */
export function useConnectBitpanda() {
  const connectAction = useAction(api.actions.bitpanda.connect);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(
    async (params: { apiKey: string; label?: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        return await connectAction(params);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [connectAction],
  );

  return { connect, isLoading, error };
}

/** Re-sync a single Bitpanda connection. */
export function useSyncBitpandaConnection() {
  const syncAction = useAction(api.actions.bitpanda.syncConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sync = useCallback(
    async (connectionId: Id<"bitpandaConnections">) => {
      setIsLoading(true);
      setError(null);
      try {
        return await syncAction({ connectionId });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [syncAction],
  );

  return { sync, isLoading, error };
}

/** Re-sync all of the current user's Bitpanda connections. */
export function useSyncAllBitpandaConnections() {
  const syncAction = useAction(api.actions.bitpanda.syncAllConnections);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const syncAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      return await syncAction({});
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [syncAction]);

  return { syncAll, isLoading, error };
}

/** Disconnect a Bitpanda account and remove its data. */
export function useDeleteBitpandaConnection() {
  const deleteAction = useAction(api.actions.bitpanda.deleteConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteConnection = useCallback(
    async (connectionId: Id<"bitpandaConnections">) => {
      setIsLoading(true);
      setError(null);
      try {
        return await deleteAction({ connectionId });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [deleteAction],
  );

  return { deleteConnection, isLoading, error };
}

/** Set or clear a user's manual category override for a Bitpanda holding. */
export function useSetBitpandaOverride() {
  const setOverride = useMutation(api.bitpanda.setUserOverride);
  return useCallback(
    (params: {
      holdingId: Id<"bitpandaHoldings">;
      category?: string;
      subcategory?: string;
    }) => setOverride(params),
    [setOverride],
  );
}
