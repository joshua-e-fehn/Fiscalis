"use client";

import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useEquitiesSummary } from "@/hooks/convex/equities";
import {
  equitiesPublicCards,
  equitiesPrivateCards,
} from "@/lib/config/categoryUI";

export default function EquitiesPage() {
  const { summary, isLoading } = useEquitiesSummary();

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Equities"
        subtitle="Track your stock portfolio, ETFs, mutual funds, and private equity investments."
        actions={[{ label: "Connect Broker", href: "/integrations/brokers" }]}
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
        title="Public Markets"
        cards={equitiesPublicCards}
        actionLabel="View Holdings"
        columns={4}
      />

      {/* Private Equities Section */}
      <SubcategoryCardSection
        title="Private Markets"
        cards={equitiesPrivateCards}
        actionLabel="View Holdings"
      />
    </div>
  );
}
