"use client";

import { useTranslations } from "next-intl";
import {
  usePlaidAccounts,
  useItemsNeedingReauth,
  usePlaidItems,
  useRefreshAccounts,
} from "@/hooks/convex";
import { Card, CardContent, CardHeader } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Building2, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";

import { BankAccountsCard } from "@/components/atomic/molecules/bankAccountsCard";
import { BankReauthCard } from "@/components/atomic/molecules/bankReauthCard";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";
import { IntegrationEmptyState } from "@/components/atomic/molecules/integrations";

interface BanksCardProps {
  /** External sync state passed from parent (e.g., from PageHeader sync button) */
  isSyncing?: boolean;
}

// `isSyncing` is still accepted from callers but no longer read here; the
// empty pattern keeps the prop contract without an unused binding.
export function BanksCard({}: BanksCardProps) {
  const t = useTranslations("integrations.banking");
  const tConnection = useTranslations("integrations.connection");
  const accounts = usePlaidAccounts();
  const itemsNeedingReauth = useItemsNeedingReauth();
  const items = usePlaidItems();
  const refreshAccounts = useRefreshAccounts();

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
        title={t("empty.loadFailedTitle")}
        description={t("empty.loadFailedDescription")}
        className="border-destructive/50"
      >
        <Button onClick={() => window.location.reload()} variant="outline">
          {t("empty.refreshPage")}
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
          title={t("empty.syncTitle")}
          description={t("empty.syncDescription", {
            count: items?.length ?? 0,
          })}
        >
          <Button
            onClick={() => refreshAccounts.mutate()}
            disabled={refreshAccounts.isLoading}
            size="lg"
          >
            {refreshAccounts.isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tConnection("syncing")}
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("empty.syncAccounts")}
              </>
            )}
          </Button>
        </IntegrationEmptyState>
      );
    }

    return (
      <IntegrationEmptyState
        icon={Building2}
        title={t("empty.noAccountsTitle")}
        description={t("empty.noAccountsDescription")}
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
              institutionName={item.institutionName || t("unknownBank")}
              institutionLogo={item.institutionLogo}
              institutionPrimaryColor={item.institutionPrimaryColor}
              accounts={itemAccounts}
            />
          );
        })}
    </div>
  );
}
