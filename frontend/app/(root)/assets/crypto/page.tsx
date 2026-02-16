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

import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
} from "@/components/atomic/molecules/investments";
import { CryptoAllocationChart } from "@/components/atomic/molecules/crypto";
import { useCryptoSummary } from "@/hooks/convex/crypto";
import { cryptoCategoryCards } from "@/lib/config/categoryUI";

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
          {cryptoCategoryCards.map((category) => (
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
