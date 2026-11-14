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
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { LayoutDashboard, History, Wallet } from "lucide-react";
import { PageHeader } from "@/components/atomic/molecules/investments";

const cryptoAssetsTabs = [
  { id: "overview", href: "/assets/crypto", icon: LayoutDashboard },
  { id: "holdings", href: "/assets/crypto/holdings", icon: Wallet },
  { id: "transactions", href: "/assets/crypto/transactions", icon: History },
] as const;

export default function CryptoAssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("assets");

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
        title={t("crypto.title")}
        subtitle={t("crypto.subtitle")}
        actions={[
          { label: t("actions.connectCrypto"), href: "/integrations/brokers" },
        ]}
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
              <span className="hidden sm:inline">
                {t(`crypto.tabs.${tab.id}`)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Page Content */}
      {children}
    </div>
  );
}
