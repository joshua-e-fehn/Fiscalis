"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { ManualAssetDialog } from "@/components/atomic/molecules/manualAssets";
import { useRealEstateSummary } from "@/hooks/convex/realEstate";
import {
  realEstateCategoryCards,
  useCategoryLabels,
} from "@/lib/config/categoryUI";

export default function RealEstatePage() {
  const { summary, isLoading } = useRealEstateSummary();
  const t = useTranslations("assets.realEstate");
  const labels = useCategoryLabels();
  const tAction = useTranslations("assets.actions");
  const [adding, setAdding] = useState(false);

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={labels.categoryName("real-estate")}
        subtitle={t("subtitle")}
        actions={[
          { label: tAction("addProperty"), onClick: () => setAdding(true) },
        ]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="real-estate"
        summary={summary}
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title={t("categories")}
        cards={realEstateCategoryCards}
        actionLabel={tAction("viewProperties")}
      />

      <ManualAssetDialog
        open={adding}
        onOpenChange={setAdding}
        category="real-estate"
      />
    </div>
  );
}
