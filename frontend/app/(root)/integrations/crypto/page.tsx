"use client";

/**
 * Crypto Integrations Page
 *
 * Connection management showing all connected crypto accounts.
 * Connections can have multiple categories (exchange, wallet, blockchain).
 */

import { CryptoConnectionsCard } from "@/components/atomic/molecules/crypto";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  useVezgoConnections,
  useVezgoPositions,
  useVezgoTotalValue,
} from "@/hooks/convex/crypto";
import { Building2, Wallet, Link2, Coins } from "lucide-react";
import { useMemo } from "react";
import { formatCurrency } from "@/lib/types/investments";

export default function CryptoIntegrationsPage() {
  const connections = useVezgoConnections();
  const positions = useVezgoPositions();
  const totalValue = useVezgoTotalValue();

  // Count connections by category (a connection can be in multiple categories)
  const exchangeCount = useMemo(
    () =>
      connections?.filter((c) => c.categories?.includes("exchange")).length ??
      0,
    [connections],
  );
  const walletCount = useMemo(
    () =>
      connections?.filter((c) => c.categories?.includes("wallet")).length ?? 0,
    [connections],
  );
  const blockchainCount = useMemo(
    () =>
      connections?.filter((c) => c.categories?.includes("blockchain")).length ??
      0,
    [connections],
  );

  // Calculate unique tokens count
  const uniqueTokens = useMemo(() => {
    if (!positions) return 0;
    const symbols = new Set(positions.map((p) => p.symbol));
    return symbols.size;
  }, [positions]);

  // Quick stats for the overview
  const stats = [
    {
      label: "Total Value",
      value: formatCurrency(totalValue?.totalValue ?? 0, "usd"),
      icon: Coins,
      description: `${positions?.length ?? 0} positions`,
    },
    {
      label: "Exchanges",
      value: exchangeCount,
      icon: Building2,
      description: "Connected exchanges",
    },
    {
      label: "Wallets",
      value: walletCount,
      icon: Wallet,
      description: "Connected wallets",
    },
    {
      label: "Blockchain",
      value: blockchainCount,
      icon: Link2,
      description: "Direct addresses",
    },
  ];

  const hasConnections = connections && connections.length > 0;

  return (
    <div className="space-y-6">
      {/* Quick Stats - only show if there are connections */}
      {hasConnections && (
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

      {/* All Connections */}
      <CryptoConnectionsCard />
    </div>
  );
}
