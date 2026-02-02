"use client";

/**
 * Crypto Assets Overview Page
 *
 * Investment portfolio view for cryptocurrency holdings with:
 * - KPI Cards (Total Value, P/L, YTD)
 * - Allocation chart by subcategory (BTC & ETH, Altcoins, Stablecoins, DeFi)
 * - Performance chart
 * - Largest Holdings card grouped by subcategory
 * - Crypto subcategory cards (BTC & ETH, Altcoins, Stablecoins, DeFi)
 */

import { Bitcoin, Coins, CircleDollarSign, Layers } from "lucide-react";
import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { CryptoAllocationChart } from "@/components/atomic/molecules/crypto";
import { useCryptoSummary } from "@/hooks/convex/crypto";
import { categoryColorPalettes } from "@/lib/types/investments";

// Get crypto color palette
const cryptoColors = categoryColorPalettes.crypto;

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
    color: cryptoColors.bitcoin,
  },
  {
    title: "Altcoins",
    description: "Alternative cryptocurrencies beyond BTC and ETH",
    href: "/assets/crypto/altcoins",
    icon: Coins,
    implemented: false,
    examples: ["SOL", "ADA", "AVAX", "DOT", "MATIC"],
    color: cryptoColors.altcoins,
  },
  {
    title: "Stablecoins",
    description: "Price-stable cryptocurrencies pegged to fiat currencies",
    href: "/assets/crypto/stablecoins",
    icon: CircleDollarSign,
    implemented: false,
    examples: ["USDT", "USDC", "DAI", "FRAX"],
    color: cryptoColors.stablecoins,
  },
  {
    title: "DeFi",
    description:
      "Decentralized finance positions including staking and liquidity",
    href: "/assets/crypto/defi",
    icon: Layers,
    implemented: false,
    examples: ["Staking", "LP Positions", "Yield Farming", "Lending"],
    color: cryptoColors.defi,
  },
];

export default function CryptoAssetsOverviewPage() {
  const { summary, isLoading } = useCryptoSummary();

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <div className="space-y-8">
      {/* Portfolio Dashboard Section */}
      <InvestmentDashboardSection
        category="crypto"
        summary={summary}
        currency="eur"
        isLoading={isLoading}
        showTopHoldings={hasHoldings ?? false}
        customAllocationChart={<CryptoAllocationChart maxPositions={8} />}
      />

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
    </div>
  );
}
