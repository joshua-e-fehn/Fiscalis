"use client";

import {
  InvestmentDashboardSection,
  COMMODITIES_KPI_CARDS,
  SubcategoryCategoryCard,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useCommoditiesSummary } from "@/hooks/convex/commodities";
import { commoditiesCategoryCards } from "@/lib/config/categoryUI";

export default function CommoditiesPage() {
  const { summary, isLoading } = useCommoditiesSummary("eur");

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
          currency="eur"
          isLoading={isLoading}
          kpiCards={COMMODITIES_KPI_CARDS}
          showTopHoldings={hasHoldings ?? false}
        />
      </div>

      {/* Category Grid */}
      <div className="w-full space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Commodity Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {commoditiesCategoryCards.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Portfolio"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
