"use client";

import * as React from "react";
import { useMemo } from "react";
import { BanksCard } from "@/components/atomic/organisms/banksCard";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";
import { PageHeader } from "@/components/atomic/molecules/investments";
import {
  usePlaidAccounts,
  useRefreshAccounts,
  usePlaidItems,
} from "@/hooks/convex";
import { useSyncContext } from "@/providers/syncProvider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  RefreshCw,
  Building2,
  Wallet,
  CreditCard,
  Banknote,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";

export default function BankingPage() {
  const accounts = usePlaidAccounts();
  const items = usePlaidItems();
  const { mutate: refreshAll, isLoading: isLocalSyncing } =
    useRefreshAccounts();
  const { isPlaidSyncing: isGlobalSyncing } = useSyncContext();

  // Show syncing state if either local or global sync is in progress
  const isSyncing = isLocalSyncing || isGlobalSyncing;

  const isLoading = accounts === undefined;
  const hasAccounts = accounts && accounts.length > 0;

  // Calculate stats
  const stats = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;

    const totalBalance = accounts.reduce(
      (sum, acc) => sum + (acc.currentBalance ?? 0),
      0,
    );

    const checkingAccounts = accounts.filter(
      (acc) => acc.subtype === "checking",
    );
    const savingsAccounts = accounts.filter((acc) => acc.subtype === "savings");
    const creditAccounts = accounts.filter((acc) => acc.type === "credit");

    const checkingBalance = checkingAccounts.reduce(
      (sum, acc) => sum + (acc.currentBalance ?? 0),
      0,
    );
    const savingsBalance = savingsAccounts.reduce(
      (sum, acc) => sum + (acc.currentBalance ?? 0),
      0,
    );
    const creditBalance = creditAccounts.reduce(
      (sum, acc) => sum + (acc.currentBalance ?? 0),
      0,
    );

    return [
      {
        label: "Total Balance",
        value: formatCurrency(totalBalance, "eur"),
        icon: Banknote,
        description: `${accounts.length} accounts`,
      },
      {
        label: "Checking",
        value: formatCurrency(checkingBalance, "eur"),
        icon: Wallet,
        description: `${checkingAccounts.length} accounts`,
      },
      {
        label: "Savings",
        value: formatCurrency(savingsBalance, "eur"),
        icon: Building2,
        description: `${savingsAccounts.length} accounts`,
      },
      {
        label: "Credit",
        value: formatCurrency(Math.abs(creditBalance), "eur"),
        icon: CreditCard,
        description: `${creditAccounts.length} cards`,
      },
    ];
  }, [accounts]);

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Bank Accounts"
        subtitle="Connect your bank accounts to automatically track balances and transactions."
        actionsLoading={isLoading}
        actions={
          hasAccounts
            ? [
                {
                  label: "Sync",
                  onClick: () => refreshAll(),
                  variant: "outline",
                  icon: RefreshCw,
                  isLoading: isSyncing,
                  loadingLabel: "Syncing...",
                  iconOnly: true,
                },
              ]
            : []
        }
        customActions={<PlaidLinkButton buttonText="Connect Bank" />}
      />

      {/* KPI Cards - only show if there are accounts */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.label}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BanksCard isSyncing={isSyncing} />
    </div>
  );
}
