"use client";

import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useCollectiblesSummary } from "@/hooks/convex/collectibles";
import { collectiblesCategoryCards } from "@/lib/config/categoryUI";

export default function CollectiblesPage() {
  const { summary, isLoading } = useCollectiblesSummary();
  const t = useTranslations("assets.collectibles");
  const tAction = useTranslations("assets.actions");

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={[{ label: tAction("addItem"), disabled: true }]}
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
    </div>
  );
}
