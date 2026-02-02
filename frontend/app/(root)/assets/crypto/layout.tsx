"use client";

/**
 * Crypto Assets Layout
 *
 * Provides tab navigation between crypto asset sub-sections:
 * - Overview: Investment portfolio summary with dashboard and categories
 * - Holdings: Complete list of all cryptocurrency positions
 * - Transactions: Complete transaction history across all crypto accounts
 */

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { LayoutDashboard, History, Wallet } from "lucide-react";
import { PageHeader } from "@/components/atomic/molecules/investments";

const cryptoAssetsTabs = [
  { name: "Overview", href: "/assets/crypto", icon: LayoutDashboard },
  { name: "Holdings", href: "/assets/crypto/holdings", icon: Wallet },
  { name: "Transactions", href: "/assets/crypto/transactions", icon: History },
];

export default function CryptoAssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Determine active tab
  const activeTab =
    cryptoAssetsTabs.find((tab) =>
      tab.href === "/assets/crypto"
        ? pathname === "/assets/crypto"
        : pathname.startsWith(tab.href),
    )?.href || "/assets/crypto";

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Crypto Assets"
        subtitle="Track your cryptocurrency investments and portfolio performance"
        actions={[{ label: "Connect Crypto", href: "/integrations/crypto" }]}
      />

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(value) => router.push(value)}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          {cryptoAssetsTabs.map((tab) => (
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
