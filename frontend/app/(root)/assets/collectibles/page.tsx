"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { ManualAssetDialog } from "@/components/atomic/molecules/manualAssets";
import { useCollectiblesSummary } from "@/hooks/convex/collectibles";
import {
  collectiblesCategoryCards,
  useCategoryLabels,
} from "@/lib/config/categoryUI";

export default function CollectiblesPage() {
  const { summary, isLoading } = useCollectiblesSummary();
  const t = useTranslations("assets.collectibles");
  const labels = useCategoryLabels();
  const tAction = useTranslations("assets.actions");
  const [adding, setAdding] = useState(false);

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={labels.categoryName("collectibles")}
        subtitle={t("subtitle")}
        actions={[{ label: tAction("addItem"), onClick: () => setAdding(true) }]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="collectibles"
        summary={summary}
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title={t("categories")}
        cards={collectiblesCategoryCards}
        actionLabel={tAction("viewCollection")}
      />

      <ManualAssetDialog
        open={adding}
        onOpenChange={setAdding}
        category="collectibles"
      />
    </div>
  );
}
