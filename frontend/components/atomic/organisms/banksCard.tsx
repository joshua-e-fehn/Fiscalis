"use client";

import { useAccounts, useItemsNeedingReauth } from "@/hooks/banking";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Building2, CreditCard, Plus } from "lucide-react";

import { BankAccountsCard } from "@/components/atomic/molecules/bankAccountsCard";
import { BankReauthCard } from "@/components/atomic/molecules/bankReauthCard";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";

export function BanksCard() {
  const { data: accounts, isLoading, error } = useAccounts();
  const { data: itemsNeedingReauth } = useItemsNeedingReauth();

  const institutionList = Array.from(
    new Map(
      accounts
        ?.filter((account) => account.institution)
        .map((account) => [account.institution?.itemId, account.institution]),
    ).values(),
  ).sort((a, b) => (a?.name ?? "").localeCompare(b?.name ?? ""));

  // Check if we have any content to show (accounts OR items needing reauth)
  const hasAccounts = accounts && accounts.length > 0;
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
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          View and manage your linked bank accounts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Show items needing re-authentication first */}
        {hasItemsNeedingReauth &&
          itemsNeedingReauth.map((item) => (
            <BankReauthCard key={item.itemId} item={item} />
          ))}

        {/* Show connected accounts */}
        {hasAccounts &&
          institutionList.map((institution) => {
            const institutionAccounts = accounts.filter(
              (account) => account.institution?.itemId === institution?.itemId,
            );
            if (institutionAccounts.length === 0) {
              return null;
            }
            return (
              <BankAccountsCard
                key={institution?.itemId}
                institutionAccounts={institutionAccounts}
              />
            );
          })}
      </CardContent>
    </Card>
  );
}
