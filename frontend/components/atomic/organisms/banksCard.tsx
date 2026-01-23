"use client";

import { useAccounts } from "@/hooks/banking";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";

import { BankAccountsCard } from "@/components/atomic/molecules/bankAccountsCard";

export function BanksCard() {
  const { data: accounts, isLoading, error } = useAccounts();

  const institutionList = Array.from(
    new Map(
      accounts
        ?.filter((account) => account.institution)
        .map((account) => [account.institution?.itemId, account.institution])
    ).values()
  ).sort((a, b) => (a?.name ?? "").localeCompare(b?.name ?? ""));

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
    return <div className="text-red-500">Failed to load accounts</div>;
  }

  if (!accounts || accounts.length === 0) {
    return <div className="text-muted-foreground">No linked accounts</div>;
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
        {!accounts ||
          (accounts.length === 0 && (
            <div className="text-muted-foreground">No linked accounts</div>
          ))}
        {accounts &&
          accounts.length > 0 &&
          institutionList.map((institution) => {
            const institutionAccounts = accounts.filter(
              (account) => account.institution?.itemId === institution?.itemId
            );
            if (institutionAccounts.length === 0) {
              return null; // Skip if no accounts for this institution
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
