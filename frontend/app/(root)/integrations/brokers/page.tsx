"use client";

import { useMemo } from "react";
import { BrokersCard } from "@/components/atomic/organisms/brokersCard";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { SnaptradeConnectButton } from "@/components/atomic/atoms/snaptradeConnectButton";
import {
  useBrokerConnections,
  useBrokerAccounts,
  useBrokerPositions,
  useSyncAll,
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
  TrendingUp,
  Briefcase,
  PieChart,
  Coins,
} from "lucide-react";
import { formatCurrency } from "@/lib/types/investments";

export default function BrokersPage() {
  const connections = useBrokerConnections();
  const accounts = useBrokerAccounts();
  const positions = useBrokerPositions();
  const { syncAll, isLoading: isLocalSyncing } = useSyncAll();
  const { isSnaptradeSyncing: isGlobalSyncing } = useSyncContext();

  // Show syncing state if either local or global sync is in progress
  const isSyncing = isLocalSyncing || isGlobalSyncing;

  const isLoading = connections === undefined;
  const hasConnections = connections && connections.length > 0;

  // Calculate stats
  const stats = useMemo(() => {
    if (!connections || connections.length === 0) return null;

    // Calculate total market value from positions
    const totalValue =
      positions?.reduce((sum, pos) => sum + (pos.marketValue ?? 0), 0) ?? 0;

    // Build a set of account IDs that have positions
    const accountsWithPositions = new Set(
      positions?.map((p) => p.accountId) ?? [],
    );

    // Calculate total cash across all accounts
    // Use same logic as cash page: if cash > 0 use it, else if no positions treat balance as cash
    const totalCash =
      accounts?.reduce((sum, acc) => {
        if ((acc.cash ?? 0) > 0) return sum + (acc.cash ?? 0);
        // If no positions and balance > 0, treat balance as cash
        if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0) {
          return sum + (acc.balance ?? 0);
        }
        return sum;
      }, 0) ?? 0;

    return [
      {
        label: "Total Value",
        value: formatCurrency(totalValue, "eur"),
        icon: TrendingUp,
        description: `${positions?.length ?? 0} positions`,
      },
      {
        label: "Brokers",
        value: connections.length,
        icon: Briefcase,
        description: "Connected brokers",
      },
      {
        label: "Accounts",
        value: accounts?.length ?? 0,
        icon: PieChart,
        description: "Trading accounts",
      },
      {
        label: "Cash",
        value: formatCurrency(totalCash, "eur"),
        icon: Coins,
        description: "Available cash",
      },
    ];
  }, [connections, accounts, positions]);

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Broker Accounts"
        subtitle="Manage your brokerage connections and track your investment portfolio."
        actionsLoading={isLoading}
        actions={
          hasConnections
            ? [
                {
                  label: "Refresh",
                  onClick: () => syncAll(),
                  variant: "outline",
                  icon: RefreshCw,
                  isLoading: isSyncing,
                  loadingLabel: "Syncing...",
                  iconOnly: true,
                },
              ]
            : []
        }
        customActions={<SnaptradeConnectButton buttonText="Connect Broker" />}
      />

      {/* KPI Cards - only show if there are connections */}
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

      <BrokersCard />
    </div>
  );
}
