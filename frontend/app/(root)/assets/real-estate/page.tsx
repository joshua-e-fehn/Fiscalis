"use client";

import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useRealEstateSummary } from "@/hooks/convex/realEstate";
import { realEstateCategoryCards } from "@/lib/config/categoryUI";

export default function RealEstatePage() {
  const { summary, isLoading } = useRealEstateSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Real Estate"
        subtitle="Track your real estate investments - residential properties, commercial holdings, REITs, and more."
        actions={[{ label: "Add Property", disabled: true }]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="real-estate"
        summary={summary}
        currency="eur"
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Property Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {realEstateCategoryCards.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Properties"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
