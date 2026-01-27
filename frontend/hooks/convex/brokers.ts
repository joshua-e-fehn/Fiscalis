"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// BROKER CONNECTIONS HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all broker connections
 */
export function useBrokerConnections() {
  return useQuery(api.brokers.getConnections);
}

/**
 * Hook to get a single broker connection
 */
export function useBrokerConnection(connectionId: Id<"brokerConnections">) {
  return useQuery(api.brokers.getConnection, { connectionId });
}

/**
 * Hook to get connections needing attention (errors/disconnected)
 */
export function useConnectionsNeedingAttention() {
  return useQuery(api.brokers.getConnectionsNeedingAttention);
}

/**
 * Hook to create a broker connection
 */
export function useCreateBrokerConnection() {
  const createConnection = useMutation(api.brokers.createConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (params: {
      brokerType: string;
      connectionName: string;
      accountId?: string;
      username?: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createConnection(params);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [createConnection],
  );

  return { mutate, isLoading, error };
}

/**
 * Hook to update connection status
 */
export function useUpdateConnectionStatus() {
  const updateStatus = useMutation(api.brokers.updateConnectionStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (params: {
      connectionId: Id<"brokerConnections">;
      status: "connected" | "disconnected" | "error" | "pending";
      errorMessage?: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        await updateStatus(params);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [updateStatus],
  );

  return { mutate, isLoading, error };
}

/**
 * Hook to delete a broker connection
 */
export function useDeleteBrokerConnection() {
  const deleteConnection = useMutation(api.brokers.deleteConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (connectionId: Id<"brokerConnections">) => {
      setIsLoading(true);
      setError(null);
      try {
        await deleteConnection({ connectionId });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [deleteConnection],
  );

  return { mutate, isLoading, error };
}

/**
 * Hook to rename a broker connection
 */
export function useRenameBrokerConnection() {
  const renameConnection = useMutation(api.brokers.renameConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (params: {
      connectionId: Id<"brokerConnections">;
      connectionName: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        await renameConnection(params);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [renameConnection],
  );

  return { mutate, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// BROKER POSITIONS HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all positions
 */
export function useBrokerPositions() {
  return useQuery(api.brokers.getPositions);
}

/**
 * Hook to get positions for a specific connection
 */
export function useBrokerPositionsByConnection(
  connectionId: Id<"brokerConnections">,
) {
  return useQuery(api.brokers.getPositionsByConnection, { connectionId });
}

/**
 * Hook to get positions by symbol
 */
export function useBrokerPositionsBySymbol(symbol: string) {
  return useQuery(api.brokers.getPositionsBySymbol, { symbol });
}

/**
 * Hook to get portfolio summary
 */
export function usePortfolioSummary() {
  return useQuery(api.brokers.getPortfolioSummary);
}
