"use client";

import { useQuery, useAction, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toActionError } from "@/lib/actionError";
import { useState, useCallback } from "react";
import { useLocale } from "next-intl";
import { languageForLocale } from "@/i18n/locales";

// ═══════════════════════════════════════════════════════════════
// PLAID LINK HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to create a Plaid Link token
 */
export function useCreateLinkToken() {
  const createLinkToken = useAction(api.actions.plaid.createLinkToken);
  // The rendered language (not the stored one), so Plaid matches the UI
  const language = languageForLocale(useLocale());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await createLinkToken({ language });
      return result;
    } catch (err) {
      const error = toActionError(err);
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [createLinkToken, language]);

  return { mutate, isLoading, error };
}

/**
 * Hook to create a Plaid update Link token (for re-auth)
 */
export function useCreateUpdateLinkToken() {
  const createUpdateLinkToken = useAction(
    api.actions.plaid.createUpdateLinkToken,
  );
  const language = languageForLocale(useLocale());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (itemId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createUpdateLinkToken({ itemId, language });
        return result;
      } catch (err) {
        const error = toActionError(err);
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [createUpdateLinkToken, language],
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
        const error = toActionError(err);
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
 * Hook to disconnect a Plaid item: revoked at Plaid, then deleted
 */
export function useDeletePlaidItem() {
  const deleteItem = useAction(api.actions.plaid.disconnectItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (itemId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await deleteItem({ itemId });
      } catch (err) {
        const error = toActionError(err);
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
        const error = toActionError(err);
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

/**
 * Hook to update institution logo for a single item
 */
export function useUpdateInstitutionLogo() {
  const updateLogo = useAction(api.actions.plaid.updateInstitutionLogo);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (itemId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await updateLogo({ itemId });
        return result;
      } catch (err) {
        const error = toActionError(err);
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [updateLogo],
  );

  return { mutate, isLoading, error };
}

/**
 * Hook to update institution logos for all items
 */
export function useUpdateAllInstitutionLogos() {
  const updateAllLogos = useAction(api.actions.plaid.updateAllInstitutionLogos);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await updateAllLogos();
      return result;
    } catch (err) {
      const error = toActionError(err);
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [updateAllLogos]);

  return { mutate, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════
// PLAID TRANSACTIONS HOOKS
// ═══════════════════════════════════════════════════════════════

/** Transactions read per page by useTransactions. */
export const TRANSACTIONS_PAGE_SIZE = 50;

/**
 * The signed-in user's bank transactions, newest first and paginated,
 * optionally for one account and an inclusive date range (YYYY-MM-DD).
 * With `search`, matches on the description, best match first.
 */
export function useTransactions(filters?: {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  return usePaginatedQuery(api.banking.listTransactions, filters ?? {}, {
    initialNumItems: TRANSACTIONS_PAGE_SIZE,
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
    async (params?: { itemId?: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await syncTransactions(params ?? {});
        return result;
      } catch (err) {
        const error = toActionError(err);
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
