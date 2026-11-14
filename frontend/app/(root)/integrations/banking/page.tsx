"use client";

import * as React from "react";
import { useMemo } from "react";
import { BanksCard } from "@/components/atomic/organisms/banksCard";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { usePlaidAccounts, useRefreshAccounts } from "@/hooks/convex";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
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
import { bankAccountTotals } from "@/../services/portfolio/categorySummary";

export default function BankingPage() {
  const accounts = usePlaidAccounts();
  // The totals are summed in EUR and shown in the display currency
  const {
    currency,
    fromEur,
    isLoading: isRateLoading,
  } = useDisplayCurrency();
  const { mutate: refreshAll, isLoading: isLocalSyncing } =
    useRefreshAccounts();
  const { isPlaidSyncing: isGlobalSyncing } = useSyncContext();

  // Show syncing state if either local or global sync is in progress
  const isSyncing = isLocalSyncing || isGlobalSyncing;

  const isLoading = accounts === undefined;
  const hasAccounts = accounts && accounts.length > 0;

  // Totals from each account's stored EUR value, in the display currency, with
  // amounts owed (credit cards, loans) subtracted from the net balance, as
  // in net worth
  const stats = useMemo(() => {
    // No figure before the display rate arrives
    if (!accounts || accounts.length === 0 || isRateLoading) return null;

    const totals = bankAccountTotals(accounts);
    const plural = (n: number, word: string) =>
      `${n} ${word}${n === 1 ? "" : "s"}`;
    const unconvertedNote =
      totals.unconverted > 0
        ? ` · ${totals.unconverted} without an exchange rate`
        : "";

    return [
      {
        label: "Net Balance",
        value: formatCurrency(fromEur(totals.net), currency),
        icon: Banknote,
        description: `${plural(totals.counts.all, "account")}, after debts${unconvertedNote}`,
      },
      {
        label: "Checking",
        value: formatCurrency(fromEur(totals.checking), currency),
        icon: Wallet,
        description: plural(totals.counts.checking, "account"),
      },
      {
        label: "Savings",
        value: formatCurrency(fromEur(totals.savings), currency),
        icon: Building2,
        description: plural(totals.counts.savings, "account"),
      },
      {
        label: "Owed",
        value: formatCurrency(fromEur(totals.owed), currency),
        icon: CreditCard,
        description:
          totals.counts.loans > 0
            ? `${plural(totals.counts.cards, "card")}, ${plural(totals.counts.loans, "loan")}`
            : plural(totals.counts.cards, "card"),
      },
    ];
  }, [accounts, currency, fromEur, isRateLoading]);

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
