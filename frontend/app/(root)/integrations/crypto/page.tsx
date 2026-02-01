"use client";

/**
 * Crypto Integrations Overview Page
 *
 * Connection management overview showing all connected crypto accounts.
 */

import { CryptoConnectionsCard } from "@/components/atomic/molecules/crypto";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import { useVezgoConnections, useVezgoPositions } from "@/hooks/convex/crypto";
import { Building2, Wallet, Activity, Zap, TrendingUp } from "lucide-react";
import { useMemo } from "react";

export default function CryptoIntegrationsOverviewPage() {
  const connections = useVezgoConnections();
  const positions = useVezgoPositions();

  const exchangeCount =
    connections?.filter((c) => c.providerType === "exchange").length ?? 0;
  const walletCount =
    connections?.filter((c) => c.providerType === "wallet").length ?? 0;

  // Calculate unique tokens count
  const uniqueTokens = useMemo(() => {
    if (!positions) return 0;
    const symbols = new Set(positions.map((p) => p.symbol));
    return symbols.size;
  }, [positions]);

  // Quick stats for the overview
  const stats = [
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
      label: "Positions",
      value: positions?.length ?? 0,
      icon: Activity,
      description: "Total holdings",
    },
    {
      label: "Tokens",
      value: uniqueTokens,
      icon: Zap,
      description: "Unique assets",
    },
  ];

  const hasConnections = connections && connections.length > 0;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
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

      {/* Main Content */}
      <div className="space-y-6">
        {/* Connections Card */}
        <CryptoConnectionsCard />

        {/* Getting Started Card - Show if no connections */}
        {!hasConnections && (
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                Get Started
              </CardTitle>
              <CardDescription>
                Connect your crypto exchanges and wallets to automatically track
                your portfolio.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="shrink-0">
                    1
                  </Badge>
                  <span>Connect your exchange or wallet</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="shrink-0">
                    2
                  </Badge>
                  <span>Your balances sync automatically</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="shrink-0">
                    3
                  </Badge>
                  <span>Track performance in real-time</span>
                </div>
              </div>
              <VezgoConnectButton className="w-full" />
            </CardContent>
          </Card>
        )}

        {/* Bottom Info Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Supported Providers Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Supported Integrations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>Exchanges</span>
                </div>
                <Badge variant="secondary">40+</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span>Wallets</span>
                </div>
                <Badge variant="secondary">30+</Badge>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Including Coinbase, Binance, Kraken, MetaMask, Ledger, and more.
              </p>
            </CardContent>
          </Card>

          {/* Tips Card - Show if has connections */}
          {hasConnections && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Connection Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  • Sync your accounts regularly to keep balances up to date
                </p>
                <p>• Remove unused connections to keep your dashboard clean</p>
                <p>• Check connection status if balances seem outdated</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
