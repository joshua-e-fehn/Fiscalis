"use client";

/**
 * Crypto Assets Overview Page
 *
 * Investment portfolio view for cryptocurrency holdings with:
 * - KPI Cards (Total Value, P/L, YTD)
 * - Allocation chart by position (BTC, ETH, SOL, etc.)
 * - Performance chart
 * - Largest Holdings card
 * - Crypto subcategory cards (BTC & ETH, Altcoins, Stablecoins, DeFi)
 */

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import {
  ArrowRight,
  Bitcoin,
  Coins,
  CircleDollarSign,
  Layers,
} from "lucide-react";
import {
  CategoryValueCard,
  CategoryProfitLossCard,
  CategoryYTDCard,
  CategoryPerformanceChart,
  SubcategoryCategoryCard,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import {
  CryptoAllocationChart,
  CryptoLargestHoldingsCard,
} from "@/components/atomic/molecules/crypto";
import { useCryptoSummary, useVezgoConnections } from "@/hooks/convex/crypto";
import { calculateYTDPerformance } from "@/lib/types/investments";

/**
 * Crypto subcategory definitions
 * Bitcoin & Ethereum merged into one, others remain separate
 */
const cryptoCategories: SubcategoryCardData[] = [
  {
    title: "Bitcoin & Ethereum",
    description: "The two largest cryptocurrencies and their ecosystem tokens",
    href: "/assets/crypto/btc-eth",
    icon: Bitcoin,
    implemented: false,
    examples: ["BTC", "WBTC", "ETH", "stETH", "rETH", "WETH"],
  },
  {
    title: "Altcoins",
    description: "Alternative cryptocurrencies beyond BTC and ETH",
    href: "/assets/crypto/altcoins",
    icon: Coins,
    implemented: false,
    examples: ["SOL", "ADA", "AVAX", "DOT", "MATIC"],
  },
  {
    title: "Stablecoins",
    description: "Price-stable cryptocurrencies pegged to fiat currencies",
    href: "/assets/crypto/stablecoins",
    icon: CircleDollarSign,
    implemented: false,
    examples: ["USDT", "USDC", "DAI", "FRAX"],
  },
  {
    title: "DeFi",
    description:
      "Decentralized finance positions including staking and liquidity",
    href: "/assets/crypto/defi",
    icon: Layers,
    implemented: false,
    examples: ["Staking", "LP Positions", "Yield Farming", "Lending"],
  },
];

export default function CryptoAssetsOverviewPage() {
  const { summary, isLoading } = useCryptoSummary();
  const connections = useVezgoConnections();

  const hasConnections = connections && connections.length > 0;

  // Calculate YTD if not already provided
  const ytdData = summary
    ? calculateYTDPerformance(
        summary.totalValue,
        summary.totalCost,
        summary.historyDataPoints,
      )
    : { ytdProfitLoss: null, ytdProfitLossPercent: null };

  const ytdProfitLoss = summary?.ytdProfitLoss ?? ytdData.ytdProfitLoss;
  const ytdProfitLossPercent =
    summary?.ytdProfitLossPercent ?? ytdData.ytdProfitLossPercent;

  return (
    <div className="space-y-8">
      {/* Portfolio Dashboard Section */}
      <div className="space-y-4">
        {/* Row 1: KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CategoryValueCard
            totalValue={summary?.totalValue ?? 0}
            currency="eur"
            isLoading={isLoading}
          />
          <CategoryProfitLossCard
            profitLoss={summary?.profitLoss ?? null}
            profitLossPercent={summary?.profitLossPercent ?? null}
            currency="eur"
            isLoading={isLoading}
          />
          <CategoryYTDCard
            ytdProfitLoss={ytdProfitLoss}
            ytdProfitLossPercent={ytdProfitLossPercent}
            currency="eur"
            isLoading={isLoading}
          />
        </div>

        {/* Row 2: Charts - Allocation by Position + Performance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CryptoAllocationChart maxPositions={8} />
          <CategoryPerformanceChart
            dataPoints={summary?.historyDataPoints ?? []}
            currentValue={summary?.totalValue ?? 0}
            totalCost={summary?.totalCost ?? null}
            currency="eur"
            isLoading={isLoading}
          />
        </div>

        {/* Row 3: Largest Holdings by Category */}
        <CryptoLargestHoldingsCard maxHoldingsPerCategory={3} />
      </div>

      {/* Crypto Subcategory Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Crypto Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {cryptoCategories.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Holdings"
            />
          ))}
        </div>
      </div>

      {/* Connect CTA - Show if no connections */}
      {!hasConnections && (
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bitcoin className="h-5 w-5" />
              Connect Your Crypto
            </CardTitle>
            <CardDescription>
              Connect your crypto exchanges and wallets to automatically track
              your portfolio performance in one place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/integrations/crypto">
                Connect Accounts
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
