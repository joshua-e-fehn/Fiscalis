"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// SNAPTRADE USER HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get SnapTrade user registration status
 */
export function useSnaptradeUser() {
  return useQuery(api.brokers.getSnaptradeUser);
}

/**
 * Hook to register user with SnapTrade
 * This must be called before connecting any brokers
 */
export function useRegisterSnaptrade() {
  const registerAction = useAction(api.actions.snaptrade.registerUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const register = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await registerAction({});
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [registerAction]);

  return { register, isLoading, error };
}

/**
 * Hook to delete SnapTrade user and all connections
 */
export function useDeleteSnaptradeUser() {
  const deleteAction = useAction(api.actions.snaptrade.deleteUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await deleteAction({});
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [deleteAction]);

  return { deleteUser, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// SNAPTRADE CONNECTION HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to create SnapTrade Connect URL
 * This URL is used to open the SnapTrade Connect modal
 */
export function useCreateConnectUrl() {
  const createUrlAction = useAction(api.actions.snaptrade.createConnectUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);

  const createUrl = useCallback(
    async (params?: { broker?: string; reconnect?: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createUrlAction(params ?? {});
        setConnectUrl(result.connectUrl);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [createUrlAction],
  );

  const reset = useCallback(() => {
    setConnectUrl(null);
    setError(null);
  }, []);

  return { createUrl, connectUrl, isLoading, error, reset };
}

/**
 * Hook to handle SnapTrade Connect callback
 * Called after successful broker connection
 */
export function useHandleCallback() {
  const handleCallbackAction = useAction(api.actions.snaptrade.handleCallback);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleCallback = useCallback(
    async (authorizationId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await handleCallbackAction({ authorizationId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [handleCallbackAction],
  );

  return { handleCallback, isLoading, error };
}

/**
 * Hook to disconnect a broker
 */
export function useDeleteConnection() {
  const deleteAction = useAction(api.actions.snaptrade.deleteConnection);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteConnection = useCallback(
    async (connectionId: Id<"brokerConnections">) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await deleteAction({ connectionId });
        return result;
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

// ═══════════════════════════════════════════════════════════════
// BROKER CONNECTIONS QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all broker connections (real-time)
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
 * Hook to get connections needing attention (errors/reauth required)
 */
export function useConnectionsNeedingAttention() {
  return useQuery(api.brokers.getConnectionsNeedingAttention);
}

// ═══════════════════════════════════════════════════════════════
// BROKER ACCOUNTS QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all broker accounts (real-time)
 */
export function useBrokerAccounts(connectionId?: Id<"brokerConnections">) {
  return useQuery(api.brokers.getAccounts, { connectionId });
}

// ═══════════════════════════════════════════════════════════════
// BROKER POSITIONS QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all positions (real-time)
 */
export function useBrokerPositions(accountId?: Id<"brokerAccounts">) {
  return useQuery(api.brokers.getPositions, { accountId });
}

/**
 * Hook to get positions by symbol (across all accounts)
 */
export function useBrokerPositionsBySymbol(symbol: string) {
  return useQuery(api.brokers.getPositionsBySymbol, { symbol });
}

/**
 * Hook to get portfolio summary (aggregated totals)
 */
export function usePortfolioSummary() {
  return useQuery(api.brokers.getPortfolioSummary);
}

// ═══════════════════════════════════════════════════════════════
// BROKER TRANSACTIONS QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get transactions
 */
export function useBrokerTransactions(params?: {
  accountId?: Id<"brokerAccounts">;
  limit?: number;
}) {
  return useQuery(api.brokers.getTransactions, params ?? {});
}

// ═══════════════════════════════════════════════════════════════
// SYNC HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to sync a single account's positions
 */
export function useSyncPositions() {
  const syncAction = useAction(api.actions.snaptrade.syncPositions);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sync = useCallback(
    async (accountId: Id<"brokerAccounts">) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await syncAction({ accountId });
        return result;
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

/**
 * Hook to sync all broker data (all connections, accounts, positions)
 */
export function useSyncAll() {
  const syncAction = useAction(api.actions.snaptrade.syncAll);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const syncAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await syncAction({});
      return result;
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

/**
 * Hook to update broker logos for all connections
 */
export function useUpdateAllBrokerLogos() {
  const updateAction = useAction(api.actions.snaptrade.updateAllBrokerLogos);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateLogos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await updateAction({});
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [updateAction]);

  return { updateLogos, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// BROKER DISCOVERY HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to list all available brokers
 */
export function useListBrokers() {
  const listAction = useAction(api.actions.snaptrade.listBrokers);
  const [brokers, setBrokers] = useState<
    Array<{
      id?: string;
      slug?: string;
      name?: string;
      logo?: string | null;
      description?: string;
      url?: string;
      isActive?: boolean;
      openUrl?: string | null;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBrokers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listAction({});
      setBrokers(result.brokers);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [listAction]);

  return { brokers, fetchBrokers, isLoading, error };
}

/**
 * Hook to search brokers by name
 */
export function useSearchBrokers() {
  const searchAction = useAction(api.actions.snaptrade.searchBrokers);
  const [results, setResults] = useState<
    Array<{
      id?: string;
      slug?: string;
      name?: string;
      logo?: string | null;
      description?: string;
      url?: string;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(
    async (query: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await searchAction({ query });
        setResults(result.brokers);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [searchAction],
  );

  const reset = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, search, reset, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// COMBINED HOOKS (Convenience)
// ═══════════════════════════════════════════════════════════════

/**
 * Combined hook for the SnapTrade Connect flow
 * Handles registration, URL creation, and callback in one place
 */
export function useSnaptradeConnect() {
  const snaptradeUser = useSnaptradeUser();
  const {
    register,
    isLoading: isRegistering,
    error: registerError,
  } = useRegisterSnaptrade();
  const {
    createUrl,
    connectUrl,
    isLoading: isCreatingUrl,
    error: urlError,
    reset: resetUrl,
  } = useCreateConnectUrl();
  const {
    handleCallback,
    isLoading: isHandlingCallback,
    error: callbackError,
  } = useHandleCallback();

  const isLoading = isRegistering || isCreatingUrl || isHandlingCallback;
  const error = registerError || urlError || callbackError;

  /**
   * Start the connection flow
   * 1. Register user if not already registered
   * 2. Create connect URL
   */
  const startConnect = useCallback(
    async (params?: { broker?: string; reconnect?: string }) => {
      // Register if not already registered
      if (!snaptradeUser) {
        await register();
      }

      // Create connect URL
      const result = await createUrl(params);
      return result;
    },
    [snaptradeUser, register, createUrl],
  );

  /**
   * Complete the connection flow after OAuth success
   */
  const completeConnect = useCallback(
    async (authorizationId: string) => {
      const result = await handleCallback(authorizationId);
      resetUrl();
      return result;
    },
    [handleCallback, resetUrl],
  );

  return {
    // State
    isRegistered: !!snaptradeUser,
    connectUrl,
    isLoading,
    error,
    // Actions
    startConnect,
    completeConnect,
    reset: resetUrl,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEPRECATED: Legacy hooks for backward compatibility
// These will be removed once components are updated to SnapTrade
// ═══════════════════════════════════════════════════════════════

/**
 * @deprecated Use useSnaptradeConnect().startConnect instead
 * Legacy hook - will be removed in Phase 6
 */
export function useCreateBrokerConnection() {
  console.warn(
    "useCreateBrokerConnection is deprecated. Use useSnaptradeConnect() instead.",
  );
  const { startConnect, isLoading, error } = useSnaptradeConnect();
  return {
    mutate: async (_params: {
      brokerType: string;
      connectionName: string;
      accountId?: string;
      username?: string;
    }) => {
      // This won't work the same way, but prevents crash
      return startConnect({ broker: _params.brokerType });
    },
    isLoading,
    error,
  };
}

/**
 * @deprecated Use useDeleteConnection instead
 */
export function useDeleteBrokerConnection() {
  console.warn(
    "useDeleteBrokerConnection is deprecated. Use useDeleteConnection() instead.",
  );
  const { deleteConnection, isLoading, error } = useDeleteConnection();
  return {
    mutate: deleteConnection,
    isLoading,
    error,
  };
}

/**
 * @deprecated Not needed with SnapTrade - status is managed automatically
 */
export function useUpdateConnectionStatus() {
  console.warn(
    "useUpdateConnectionStatus is deprecated. SnapTrade manages connection status automatically.",
  );
  return {
    mutate: async (_params: unknown) => {
      console.warn("updateConnectionStatus is a no-op with SnapTrade");
    },
    isLoading: false,
    error: null,
  };
}

/**
 * @deprecated Not supported with SnapTrade
 */
export function useRenameBrokerConnection() {
  console.warn(
    "useRenameBrokerConnection is deprecated and not supported with SnapTrade.",
  );
  return {
    mutate: async (_params: unknown) => {
      console.warn("renameConnection is not supported with SnapTrade");
    },
    isLoading: false,
    error: null,
  };
}

/**
 * @deprecated Use useBrokerPositions(accountId) with a connection-to-account lookup
 */
export function useBrokerPositionsByConnection(
  _connectionId: Id<"brokerConnections">,
) {
  console.warn(
    "useBrokerPositionsByConnection is deprecated. Use useBrokerPositions with an accountId instead.",
  );
  // Return all positions as fallback
  return useQuery(api.brokers.getPositions, {});
}
