"use client";

import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useCommoditiesSummary } from "@/hooks/convex/commodities";
import { commoditiesCategoryCards } from "@/lib/config/categoryUI";

export default function CommoditiesPage() {
  const { summary, isLoading } = useCommoditiesSummary();

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6">
      <PageHeader
        title="Commodities"
        subtitle="Track real-time prices and manage your holdings across different commodity types"
        actions={[
          {
            label: "Add Item",
            href: "/assets/commodities/metals",
            variant: "outline",
          },
          { label: "Connect Broker", href: "/integrations/brokers" },
        ]}
      />

      {/* Portfolio Dashboard Section */}
      <div className="w-full">
        <InvestmentDashboardSection
          category="commodities"
          summary={summary}
          isLoading={isLoading}
          showTopHoldings={hasHoldings ?? false}
        />
      </div>

      {/* Category Grid */}
      <SubcategoryCardSection
        title="Commodity Categories"
        cards={commoditiesCategoryCards}
        actionLabel="View Portfolio"
        className="w-full"
      />
    </main>
  );
}
