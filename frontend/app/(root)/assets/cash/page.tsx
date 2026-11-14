"use client";

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

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Cash & Money Market"
        subtitle="Track your liquid assets - savings accounts, money market funds, CDs, and foreign currency holdings."
        actions={[
          {
            label: "Connect Broker",
            href: "/integrations/brokers",
            variant: "outline",
          },
          { label: "Connect Bank", href: "/integrations/banking" },
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
        performanceChartTitle="Cash Balance History"
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title="Cash Categories"
        cards={cashCategoryCards}
        actionLabel="View Accounts"
      />
    </div>
  );
}
