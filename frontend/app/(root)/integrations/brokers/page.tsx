"use client";

import { useMemo } from "react";
import { BrokersCard } from "@/components/atomic/organisms/brokersCard";
import { BitpandaConnectionsCard } from "@/components/atomic/molecules/BitpandaConnectionsCard";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { SnaptradeConnectButton } from "@/components/atomic/atoms/snaptradeConnectButton";
import { BitpandaConnectButton } from "@/components/atomic/atoms/BitpandaConnectButton";
import {
  useBrokerConnections,
  useBrokerAccounts,
  useBrokerPositions,
  useSyncAll,
  useBitpandaConnections,
  useBitpandaHoldings,
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
import { formatCurrency } from "@/lib/utils/currency";

export default function BrokersPage() {
  const connections = useBrokerConnections();
  const accounts = useBrokerAccounts();
  const positions = useBrokerPositions();
  const bitpandaConnections = useBitpandaConnections();
  const bitpandaHoldings = useBitpandaHoldings();
  const { syncAll, isLoading: isLocalSyncing } = useSyncAll();
  const { isSnaptradeSyncing: isGlobalSyncing } = useSyncContext();

  // Show syncing state if either local or global sync is in progress
  const isSyncing = isLocalSyncing || isGlobalSyncing;

  const isLoading = connections === undefined;
  const snaptradeCount = connections?.length ?? 0;
  const bitpandaCount = bitpandaConnections?.length ?? 0;
  const hasSnaptrade = snaptradeCount > 0;
  const hasAnyConnection = snaptradeCount + bitpandaCount > 0;

  // Calculate stats across all broker providers (SnapTrade + Bitpanda)
  const stats = useMemo(() => {
    if (!hasAnyConnection) return null;

    // SnapTrade market value
    const snaptradeValue =
      positions?.reduce((sum, pos) => sum + (pos.marketValue ?? 0), 0) ?? 0;

    // Bitpanda value (already in EUR base)
    const bitpandaValue =
      bitpandaHoldings?.reduce(
        (sum, h) => sum + (h.valueInBaseCurrency ?? h.marketValue ?? 0),
        0,
      ) ?? 0;

    const totalValue = snaptradeValue + bitpandaValue;

    // Build a set of account IDs that have positions
    const accountsWithPositions = new Set(
      positions?.map((p) => p.accountId) ?? [],
    );

    // Calculate total cash across all SnapTrade accounts
    const totalCash =
      accounts?.reduce((sum, acc) => {
        if ((acc.cash ?? 0) > 0) return sum + (acc.cash ?? 0);
        if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0) {
          return sum + (acc.balance ?? 0);
        }
        return sum;
      }, 0) ?? 0;

    const positionsCount =
      (positions?.length ?? 0) + (bitpandaHoldings?.length ?? 0);

    return [
      {
        label: "Total Value",
        value: formatCurrency(totalValue, "eur"),
        icon: TrendingUp,
        description: `${positionsCount} positions`,
      },
      {
        label: "Brokers",
        value: snaptradeCount + bitpandaCount,
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
  }, [
    hasAnyConnection,
    snaptradeCount,
    bitpandaCount,
    accounts,
    positions,
    bitpandaHoldings,
  ]);

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Brokers"
        subtitle="Connect your brokers and exchanges. Today: SnapTrade brokers and Bitpanda — more coming."
        actionsLoading={isLoading}
        actions={
          hasSnaptrade
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
        customActions={
          <div className="flex items-center gap-2">
            <SnaptradeConnectButton buttonText="Connect Broker" />
            <BitpandaConnectButton buttonVariant="outline" />
          </div>
        }
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

      <BitpandaConnectionsCard />
    </div>
  );
}
