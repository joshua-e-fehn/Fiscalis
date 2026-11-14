"use client";

import {
  InvestmentDashboardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { SubcategoryCardSection } from "@/components/atomic/molecules/investments/SubcategoryCategoryCard";
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
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title="Property Categories"
        cards={realEstateCategoryCards}
        actionLabel="View Properties"
      />
    </div>
  );
}
