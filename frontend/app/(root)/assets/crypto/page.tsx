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
} from "@/components/atomic/molecules/investments";
import { SubcategoryCardSection } from "@/components/atomic/molecules/investments/SubcategoryCategoryCard";
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
        isLoading={isLoading}
        showTopHoldings={hasHoldings ?? false}
        customAllocationChart={<CryptoAllocationChart maxPositions={8} />}
      />

      {/* Crypto Subcategory Cards */}
      <SubcategoryCardSection
        title="Crypto Categories"
        cards={cryptoCategoryCards}
        actionLabel="View Holdings"
        columns={4}
      />
    </div>
  );
}
