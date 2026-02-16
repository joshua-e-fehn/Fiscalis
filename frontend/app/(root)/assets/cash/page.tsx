"use client";

import {
  InvestmentDashboardSection,
  CASH_KPI_CARDS,
  SubcategoryCategoryCard,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useCashSummary } from "@/hooks/convex/cash";
import { usePortfolioOverview } from "@/hooks/convex/portfolio";
import { cashCategoryCards } from "@/lib/config/categoryUI";

export default function CashPage() {
  const { summary, isLoading } = useCashSummary();
  const { summary: portfolioSummary } = usePortfolioOverview("eur");

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
        currency="eur"
        isLoading={isLoading}
        kpiCards={CASH_KPI_CARDS}
        totalPortfolioAssets={portfolioSummary?.totalAssets ?? 0}
        performanceChartTitle="Cash Balance History"
      />

      {/* Category Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Cash Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cashCategoryCards.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Accounts"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
