"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { ManualAssetDialog } from "@/components/atomic/molecules/manualAssets";
import { useCommoditiesSummary } from "@/hooks/convex/commodities";
import {
  commoditiesCategoryCards,
  useCategoryLabels,
} from "@/lib/config/categoryUI";

export default function CommoditiesPage() {
  const { summary, isLoading } = useCommoditiesSummary();
  const t = useTranslations("assets.commodities");
  const labels = useCategoryLabels();
  const tAction = useTranslations("assets.actions");
  const [adding, setAdding] = useState(false);

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6">
      <PageHeader
        title={labels.categoryName("commodities")}
        subtitle={t("subtitle")}
        actions={[
          {
            label: tAction("addItem"),
            onClick: () => setAdding(true),
            variant: "outline",
          },
          { label: tAction("connectBroker"), href: "/integrations/brokers" },
        ]}
      />

      {/* Portfolio Dashboard Section */}
      <div className="w-full">
        <InvestmentDashboardSection
          category="commodities"
          summary={summary}
          isLoading={isLoading}
          showTopHoldings={hasHoldings ?? false}
        />
      </div>

      {/* Category Grid */}
      <SubcategoryCardSection
        title={t("categories")}
        cards={commoditiesCategoryCards}
        actionLabel={tAction("viewPortfolio")}
        className="w-full"
      />

      <ManualAssetDialog
        open={adding}
        onOpenChange={setAdding}
        category="commodities"
      />
    </main>
  );
}
