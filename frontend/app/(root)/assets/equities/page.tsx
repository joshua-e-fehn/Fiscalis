"use client";

import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
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
        currency="eur"
        isLoading={isLoading}
        showTopHoldings={hasHoldings ?? false}
      />

      {/* Public Equities Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Public Markets
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {equitiesPublicCards.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Holdings"
            />
          ))}
        </div>
      </div>

      {/* Private Equities Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Private Markets
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {equitiesPrivateCards.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Holdings"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
