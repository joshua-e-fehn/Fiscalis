"use client";

import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useBondsSummary } from "@/hooks/convex/bonds";
import { bondsCategoryCards, useCategoryLabels } from "@/lib/config/categoryUI";

export default function BondsPage() {
  const { summary, isLoading } = useBondsSummary();
  const t = useTranslations("assets.bonds");
  const labels = useCategoryLabels();
  const tAction = useTranslations("assets.actions");

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={labels.categoryName("bonds")}
        subtitle={t("subtitle")}
        actions={[
          { label: tAction("connectBroker"), href: "/integrations/brokers" },
        ]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="bonds"
        summary={summary}
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title={t("categories")}
        cards={bondsCategoryCards}
        actionLabel={tAction("viewHoldings")}
      />
    </div>
  );
}
