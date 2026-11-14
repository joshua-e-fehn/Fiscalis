"use client";

import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useEquitiesSummary } from "@/hooks/convex/equities";
import {
  equitiesPublicCards,
  equitiesPrivateCards,
  useCategoryLabels,
} from "@/lib/config/categoryUI";

export default function EquitiesPage() {
  const { summary, isLoading } = useEquitiesSummary();
  const t = useTranslations("assets.equities");
  const labels = useCategoryLabels();
  const tAction = useTranslations("assets.actions");

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={labels.categoryName("equities")}
        subtitle={t("subtitle")}
        actions={[
          { label: tAction("connectBroker"), href: "/integrations/brokers" },
        ]}
      />

      {/* Portfolio Dashboard Section */}
      <InvestmentDashboardSection
        category="equities"
        summary={summary}
        isLoading={isLoading}
        showTopHoldings={hasHoldings ?? false}
      />

      {/* Public Equities Section */}
      <SubcategoryCardSection
        title={t("publicMarkets")}
        cards={equitiesPublicCards}
        actionLabel={tAction("viewHoldings")}
        columns={4}
      />

      {/* Private Equities Section */}
      <SubcategoryCardSection
        title={t("privateMarkets")}
        cards={equitiesPrivateCards}
        actionLabel={tAction("viewHoldings")}
      />
    </div>
  );
}
