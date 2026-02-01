"use client";

/**
 * Crypto Integrations Layout
 *
 * Provides tab navigation between crypto integration sub-sections:
 * - Overview: Summary of all connected accounts
 * - Exchanges: CEX connections (Coinbase, Binance, etc.)
 * - Wallets: Self-custody wallets and blockchain addresses
 * - DeFi: DeFi protocol connections
 * - NFTs: NFT marketplace connections
 */

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Button } from "@/components/ui/shadcn/button";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import {
  useSyncAllVezgoConnections,
  useVezgoConnections,
} from "@/hooks/convex/crypto";
import {
  LayoutDashboard,
  Building2,
  Wallet,
  Layers,
  Image,
  RefreshCw,
  Loader2,
} from "lucide-react";

const cryptoIntegrationsTabs = [
  { name: "Overview", href: "/integrations/crypto", icon: LayoutDashboard },
  {
    name: "Exchanges",
    href: "/integrations/crypto/exchanges",
    icon: Building2,
  },
  { name: "Wallets", href: "/integrations/crypto/wallets", icon: Wallet },
  { name: "DeFi", href: "/integrations/crypto/defi", icon: Layers },
  { name: "NFTs", href: "/integrations/crypto/nfts", icon: Image },
];

export default function CryptoIntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { syncAll, isLoading: isSyncing } = useSyncAllVezgoConnections();
  const connections = useVezgoConnections();
  const hasConnections = connections && connections.length > 0;

  // Determine active tab
  const activeTab =
    cryptoIntegrationsTabs.find((tab) =>
      tab.href === "/integrations/crypto"
        ? pathname === "/integrations/crypto"
        : pathname.startsWith(tab.href),
    )?.href || "/integrations/crypto";

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Crypto Integrations
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect and manage your cryptocurrency exchanges and wallets
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAll()}
            disabled={isSyncing || !hasConnections}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync All
          </Button>
          <VezgoConnectButton />
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(value) => router.push(value)}>
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          {cryptoIntegrationsTabs.map((tab) => (
            <TabsTrigger
              key={tab.href}
              value={tab.href}
              className="gap-2 text-xs sm:text-sm"
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Page Content */}
      {children}
    </div>
  );
}
