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

import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
} from "@/components/atomic/molecules/investments";
import { CryptoAllocationChart } from "@/components/atomic/molecules/crypto";
import { useCryptoSummary } from "@/hooks/convex/crypto";
import { cryptoCategoryCards } from "@/lib/config/categoryUI";

export default function CryptoAssetsOverviewPage() {
  const { summary, isLoading } = useCryptoSummary();
  const t = useTranslations("assets");

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
        title={t("crypto.categories")}
        cards={cryptoCategoryCards}
        actionLabel={t("actions.viewHoldings")}
        columns={4}
      />
    </div>
  );
}
