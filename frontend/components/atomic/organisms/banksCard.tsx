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
import { Building2, CreditCard, Plus, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";

import { BankAccountsCard } from "@/components/atomic/molecules/bankAccountsCard";
import { BankReauthCard } from "@/components/atomic/molecules/bankReauthCard";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";

interface BanksCardProps {
  /** External sync state passed from parent (e.g., from PageHeader sync button) */
  isSyncing?: boolean;
}

export function BanksCard({ isSyncing: externalIsSyncing }: BanksCardProps) {
  const accounts = usePlaidAccounts();
  const itemsNeedingReauth = useItemsNeedingReauth();
  const items = usePlaidItems();
  const refreshAccounts = useRefreshAccounts();

  // Combine external syncing state with internal
  const isSyncing = externalIsSyncing || refreshAccounts.isLoading;

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
      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-2/4" />
          <Skeleton className="h-3 w-1/4" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-2 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-8 border-destructive/50">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-destructive/10 p-3 mb-4">
              <CreditCard className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold text-destructive mb-2">
              Failed to Load Accounts
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              We couldn&apos;t load your bank accounts. Please try refreshing
              the page.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state - no accounts and no items needing reauth
  if (!hasAnyContent) {
    // If we have items but no accounts, offer to sync
    if (needsSync) {
      return (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-4 mb-4">
                <RefreshCw className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Sync Your Accounts</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                You have {items?.length} bank connection
                {items?.length !== 1 ? "s" : ""} but no accounts synced yet.
                Click below to fetch your account data.
              </p>
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
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Building2 className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Linked Accounts</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Connect your bank accounts to track your finances, view balances,
              and monitor transactions all in one place.
            </p>
            <PlaidLinkButton />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>
              View and manage your linked bank accounts
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshAccounts.mutate()}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">
                {isSyncing ? "Syncing..." : "Refresh All"}
              </span>
            </Button>
            <PlaidLinkButton variant="outline" buttonText="Add Bank" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
