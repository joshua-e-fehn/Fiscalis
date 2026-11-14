"use client";

import { useTranslations } from "next-intl";
import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  CASH_KPI_CARDS,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useCashSummary } from "@/hooks/convex/cash";
import { usePortfolioOverview } from "@/hooks/convex/portfolio";
import { cashCategoryCards } from "@/lib/config/categoryUI";

export default function CashPage() {
  const { summary, currency, isLoading } = useCashSummary();
  const { summary: portfolioSummary } = usePortfolioOverview();
  const t = useTranslations("assets.cash");
  const tAction = useTranslations("assets.actions");

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={[
          {
            label: tAction("connectBroker"),
            href: "/integrations/brokers",
            variant: "outline",
          },
          { label: tAction("connectBank"), href: "/integrations/banking" },
        ]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="cash"
        summary={summary}
        currency={currency}
        isLoading={isLoading}
        kpiCards={CASH_KPI_CARDS}
        totalPortfolioAssets={portfolioSummary?.totalAssets ?? 0}
        performanceChartTitle={t("balanceHistory")}
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title={t("categories")}
        cards={cashCategoryCards}
        actionLabel={tAction("viewAccounts")}
      />
    </div>
  );
}
