"use client";

import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useRealEstateSummary } from "@/hooks/convex/realEstate";
import { realEstateCategoryCards } from "@/lib/config/categoryUI";

export default function RealEstatePage() {
  const { summary, isLoading } = useRealEstateSummary();
  const t = useTranslations("assets.realEstate");
  const tAction = useTranslations("assets.actions");

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={[{ label: tAction("addProperty"), disabled: true }]}
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
    </div>
  );
}
