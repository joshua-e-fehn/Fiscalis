"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// PLAID LINK HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to create a Plaid Link token
 */
export function useCreateLinkToken() {
  const createLinkToken = useAction(api.actions.plaid.createLinkToken);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await createLinkToken();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [createLinkToken]);

  return { mutate, isLoading, error };
}

/**
 * Hook to create a Plaid update Link token (for re-auth)
 */
export function useCreateUpdateLinkToken() {
  const createUpdateLinkToken = useAction(
    api.actions.plaid.createUpdateLinkToken,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (itemId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createUpdateLinkToken({ itemId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [createUpdateLinkToken],
  );

  return { mutate, isLoading, error };
}

/**
 * Hook to exchange public token for access token
 */
export function useExchangeToken() {
  const exchangeToken = useAction(api.actions.plaid.exchangeToken);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (params: {
      publicToken: string;
      institutionId?: string;
      institutionName?: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await exchangeToken(params);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [exchangeToken],
  );

  return { mutate, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// PLAID ITEMS HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all Plaid items
 */
export function usePlaidItems() {
  return useQuery(api.banking.getItems);
}

/**
 * Hook to get items needing re-authentication
 */
export function useItemsNeedingReauth() {
  return useQuery(api.banking.getItemsNeedingReauth);
}

/**
 * Hook to delete a Plaid item
 */
export function useDeletePlaidItem() {
  const deleteItem = useMutation(api.banking.deleteItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (itemId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await deleteItem({ itemId });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [deleteItem],
  );

  return { mutate, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// PLAID ACCOUNTS HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get all accounts across all items
 */
export function usePlaidAccounts() {
  return useQuery(api.banking.getAccounts);
}

/**
 * Hook to get accounts for a specific item
 */
export function usePlaidAccountsByItem(itemId: string) {
  return useQuery(api.banking.getAccountsByItem, { itemId });
}

/**
 * Hook to get balances summary
 */
export function useBalancesSummary() {
  return useQuery(api.banking.getBalancesSummary);
}

/**
 * Hook to refresh accounts from Plaid
 */
export function useRefreshAccounts() {
  const refreshAccounts = useAction(api.actions.plaid.refreshAccounts);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (itemId?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await refreshAccounts({ itemId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [refreshAccounts],
  );

  return { mutate, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// PLAID TRANSACTIONS HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get transactions from the database
 */
export function useTransactions(options?: { limit?: number }) {
  return useQuery(api.banking.getTransactionsDb, options ?? {});
}

/**
 * Hook to get transactions with date filter
 */
export function useTransactionsByDate(
  startDate?: string,
  endDate?: string,
  accountId?: string,
) {
  return useQuery(api.banking.getTransactions, {
    startDate,
    endDate,
    accountId,
  });
}

/**
 * Hook to sync transactions from Plaid
 */
export function useSyncTransactions() {
  const syncTransactions = useAction(api.actions.plaid.syncTransactions);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (params?: {
      itemId?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await syncTransactions(params ?? {});
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [syncTransactions],
  );

  return { mutate, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// PLAID AUTH & IDENTITY HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to get auth data (account/routing numbers)
 */
export function useAuth() {
  const getAuth = useAction(api.actions.plaid.getAuth);
  const [data, setData] = useState<Awaited<ReturnType<typeof getAuth>> | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(
    async (itemId?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getAuth({ itemId });
        setData(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [getAuth],
  );

  return { data, fetch, isLoading, error };
}

/**
 * Hook to get identity data
 */
export function useIdentity() {
  const getIdentity = useAction(api.actions.plaid.getIdentity);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getIdentity>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(
    async (itemId?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getIdentity({ itemId });
        setData(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [getIdentity],
  );

  return { data, fetch, isLoading, error };
}
