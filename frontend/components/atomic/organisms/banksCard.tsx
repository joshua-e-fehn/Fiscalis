"use client";

import {
  usePlaidAccounts,
  useItemsNeedingReauth,
  usePlaidItems,
  useRefreshAccounts,
} from "@/hooks/convex";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Building2, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";

import { BankAccountsCard } from "@/components/atomic/molecules/bankAccountsCard";
import { BankReauthCard } from "@/components/atomic/molecules/bankReauthCard";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";
import { useSyncContextSafe } from "@/providers/syncProvider";
import { IntegrationEmptyState } from "@/components/atomic/molecules/integrations";

interface BanksCardProps {
  /** External sync state passed from parent (e.g., from PageHeader sync button) */
  isSyncing?: boolean;
}

export function BanksCard({ isSyncing: externalIsSyncing }: BanksCardProps) {
  const accounts = usePlaidAccounts();
  const itemsNeedingReauth = useItemsNeedingReauth();
  const items = usePlaidItems();
  const refreshAccounts = useRefreshAccounts();

  // Get global sync state (may be undefined if outside SyncProvider)
  const syncContext = useSyncContextSafe();
  const isGlobalPlaidSyncing = syncContext?.isPlaidSyncing ?? false;

  // Combine external syncing state with internal and global
  const isSyncing =
    externalIsSyncing || refreshAccounts.isLoading || isGlobalPlaidSyncing;

  // Loading state - Convex returns undefined while loading
  const isLoading = accounts === undefined || items === undefined;
  const error = null; // Convex throws on error, no error state

  // Check if we have items but no accounts (need to sync)
  const hasItems = items && items.length > 0;
  const hasAccounts = accounts && accounts.length > 0;
  const needsSync = hasItems && !hasAccounts;

  // Group accounts by item (institution)
  const accountsByItem = new Map<string, typeof accounts>();
  if (accounts) {
    for (const account of accounts) {
      const itemId = account.itemId;
      if (!accountsByItem.has(itemId)) {
        accountsByItem.set(itemId, []);
      }
      accountsByItem.get(itemId)!.push(account);
    }
  }

  // Check if we have any content to show (accounts OR items needing reauth)
  const hasItemsNeedingReauth =
    itemsNeedingReauth && itemsNeedingReauth.length > 0;
  const hasAnyContent = hasAccounts || hasItemsNeedingReauth;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-16 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <IntegrationEmptyState
        icon={Building2}
        title="Failed to Load Accounts"
        description="We couldn't load your bank accounts. Please try refreshing the page."
        className="border-destructive/50"
      >
        <Button onClick={() => window.location.reload()} variant="outline">
          Refresh Page
        </Button>
      </IntegrationEmptyState>
    );
  }

  // Empty state - no accounts and no items needing reauth
  if (!hasAnyContent) {
    // If we have items but no accounts, offer to sync
    if (needsSync) {
      return (
        <IntegrationEmptyState
          icon={RefreshCw}
          title="Sync Your Accounts"
          description={`You have ${items?.length} bank connection${items?.length !== 1 ? "s" : ""} but no accounts synced yet. Click below to fetch your account data.`}
        >
          <Button
            onClick={() => refreshAccounts.mutate()}
            disabled={refreshAccounts.isLoading}
            size="lg"
          >
            {refreshAccounts.isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Accounts
              </>
            )}
          </Button>
        </IntegrationEmptyState>
      );
    }

    return (
      <IntegrationEmptyState
        icon={Building2}
        title="No Linked Accounts"
        description="Connect your bank accounts to track your finances, view balances, and monitor transactions all in one place."
      >
        <PlaidLinkButton />
      </IntegrationEmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {/* Show items needing re-authentication first */}
      {hasItemsNeedingReauth &&
        itemsNeedingReauth.map((item) => (
          <BankReauthCard key={item.itemId} item={item} />
        ))}

      {/* Show connected accounts */}
      {hasAccounts &&
        items &&
        items.map((item) => {
          const itemAccounts = accountsByItem.get(item.itemId) || [];
          if (itemAccounts.length === 0) {
            return null;
          }
          return (
            <BankAccountsCard
              key={item.itemId}
              itemId={item.itemId}
              institutionName={item.institutionName || "Unknown Bank"}
              institutionLogo={item.institutionLogo}
              institutionPrimaryColor={item.institutionPrimaryColor}
              accounts={itemAccounts}
            />
          );
        })}
    </div>
  );
}
