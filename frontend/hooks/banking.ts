import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as bankingApi from "@/lib/api/banking";
import { PlaidAccount } from "@/lib/types/banking";

// Query Keys
export const bankingKeys = {
  all: ["banking"] as const,
  accounts: () => [...bankingKeys.all, "accounts"] as const,
  account: (id: string) => [...bankingKeys.accounts(), id] as const,
  auth: (itemId?: string) => [...bankingKeys.all, "auth", itemId] as const,
  identity: (itemId?: string) =>
    [...bankingKeys.all, "identity", itemId] as const,
  transactions: () => [...bankingKeys.all, "transactions"] as const,
  transactionsDb: (limit?: number) =>
    [...bankingKeys.transactions(), "db", limit] as const,
  transactionsDate: (startDate: string, endDate: string, itemId?: string) =>
    [...bankingKeys.transactions(), startDate, endDate, itemId] as const,
  balances: () => [...bankingKeys.all, "balances"] as const,
};

// Link token hook
export function useLinkToken() {
  return useMutation({
    mutationFn: bankingApi.getLinkToken,
    onError: (error) => {
      console.error("Failed to create link token:", error);
    },
  });
}

// Update link token hook (for re-authentication)
export function useUpdateLinkToken() {
  return useMutation({
    mutationFn: (itemId: string) => bankingApi.getUpdateLinkToken(itemId),
    onError: (error) => {
      console.error("Failed to create update link token:", error);
    },
  });
}

// Exchange token hook
export function useExchangeToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      publicToken,
      institutionId,
      institutionName,
    }: {
      publicToken: string;
      institutionId?: string;
      institutionName?: string;
    }) => bankingApi.exchangeToken(publicToken, institutionId, institutionName),
    onSuccess: () => {
      // Invalidate accounts query to refetch with new connected account
      queryClient.invalidateQueries({ queryKey: bankingKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: bankingKeys.balances() });
    },
    onError: (error) => {
      console.error("Failed to exchange token:", error);
    },
  });
}

// Delete item hook
export function useDeleteItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => bankingApi.deleteItem(itemId),
    onSuccess: () => {
      // Invalidate accounts query to refetch without the deleted item
      queryClient.invalidateQueries({ queryKey: bankingKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: bankingKeys.balances() });
      queryClient.invalidateQueries({ queryKey: bankingKeys.transactions() });
    },
    onError: (error) => {
      console.error("Failed to delete item:", error);
    },
  });
}

// Item needing re-authentication type
export interface ItemNeedingReauth {
  itemId: string;
  institutionId: string | null;
  institutionName: string | null;
  errorCode: string;
}

// Get accounts hook
export function useAccounts() {
  return useQuery({
    queryKey: bankingKeys.accounts(),
    queryFn: bankingApi.getAccounts,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.accounts as PlaidAccount[],
  });
}

// Get items needing re-authentication
export function useItemsNeedingReauth() {
  return useQuery({
    queryKey: bankingKeys.accounts(),
    queryFn: bankingApi.getAccounts,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => (data.itemsNeedingReauth || []) as ItemNeedingReauth[],
  });
}

// Get auth data hook
export function useAuth(itemId?: string) {
  return useQuery({
    queryKey: bankingKeys.auth(itemId),
    queryFn: () => bankingApi.getAuth(itemId),
    enabled: false, // Only run when explicitly requested due to sensitive data
    staleTime: 60 * 60 * 1000, // 1 hour - auth data rarely changes
    select: (data) => ({
      accounts: data.accounts as PlaidAccount[],
      numbers: data.numbers,
    }),
  });
}

// Get identity data hook
export function useIdentity(itemId?: string) {
  return useQuery({
    queryKey: bankingKeys.identity(itemId),
    queryFn: () => bankingApi.getIdentity(itemId),
    enabled: false, // Only run when explicitly requested due to sensitive data
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - identity data rarely changes
    select: (data) => ({
      accounts: data.accounts,
      identity: data.identity,
    }),
  });
}

// Get transactions hook
export function useTransactions(
  startDate: Date | string,
  endDate: Date | string,
  itemId?: string,
  enabled = true,
) {
  // Standardize date format for query key
  const formatDate = (date: Date | string): string => {
    if (typeof date === "string") return date;
    return date.toISOString().split("T")[0];
  };

  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);

  return useQuery({
    queryKey: bankingKeys.transactionsDate(
      formattedStartDate,
      formattedEndDate,
      itemId,
    ),
    queryFn: () => bankingApi.getTransactions(startDate, endDate, itemId),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.transactions,
  });
}

// Get transactions from DB hook
export function useTransactionsFromDB(limit?: number) {
  return useQuery({
    queryKey: bankingKeys.transactionsDb(limit),
    queryFn: () => bankingApi.getTransactionsFromDB(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.transactions,
  });
}

// Get balance summary hook
export function useBalanceSummary() {
  return useQuery({
    queryKey: bankingKeys.balances(),
    queryFn: bankingApi.getBalanceSummary,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => ({
      totalBalances: data.totalBalances as Record<string, number>,
      accountTypeTotals: data.accountTypeTotals as Record<
        string,
        Record<string, number>
      >,
    }),
  });
}

// Refresh transactions hook
export function useRefreshTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankingApi.refreshTransactions,
    onSuccess: (data) => {
      // Invalidate all transaction queries
      queryClient.invalidateQueries({ queryKey: bankingKeys.transactions() });

      // Show success notification with count of new transactions
      if (data.newTransactions > 0) {
        // You could integrate with a toast notification system here
        console.log(`Synced ${data.newTransactions} new transactions`);
      }
    },
    onError: (error) => {
      console.error("Failed to refresh transactions:", error);
    },
  });
}

// Account finder helper hook
export function useAccountById(accountId: string | undefined) {
  const { data: accounts } = useAccounts();

  return accounts?.find((account) => account.id === accountId);
}

// Composite hook for dashboard overview data
export function useDashboardData() {
  const accounts = useAccounts();
  const balances = useBalanceSummary();

  // Get last 30 days of transactions by default
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const recentTransactions = useTransactionsFromDB(10);

  const isLoading =
    accounts.isLoading || balances.isLoading || recentTransactions.isLoading;
  const isError =
    accounts.isError || balances.isError || recentTransactions.isError;

  return {
    accounts,
    balances,
    recentTransactions,
    isLoading,
    isError,
    refetchAll: () => {
      accounts.refetch();
      balances.refetch();
      recentTransactions.refetch();
    },
  };
}

// Helper hook for Plaid Link initialization
export function usePlaidLink() {
  const linkToken = useLinkToken();
  const updateLinkToken = useUpdateLinkToken();
  const exchangeToken = useExchangeToken();
  const queryClient = useQueryClient();

  const isLoading =
    linkToken.isPending || updateLinkToken.isPending || exchangeToken.isPending;

  // Function to handle successful re-authentication
  const onUpdateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: bankingKeys.accounts() });
    queryClient.invalidateQueries({ queryKey: bankingKeys.balances() });
  };

  return {
    getLinkToken: linkToken.mutateAsync,
    getUpdateLinkToken: updateLinkToken.mutateAsync,
    exchangeToken: exchangeToken.mutateAsync,
    onUpdateSuccess,
    isLoading,
    error: linkToken.error || updateLinkToken.error || exchangeToken.error,
  };
}
