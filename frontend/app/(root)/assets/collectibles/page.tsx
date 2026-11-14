"use client";

import {
  InvestmentDashboardSection,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { SubcategoryCardSection } from "@/components/atomic/molecules/investments/SubcategoryCategoryCard";
import { useCollectiblesSummary } from "@/hooks/convex/collectibles";
import { collectiblesCategoryCards } from "@/lib/config/categoryUI";

export default function CollectiblesPage() {
  const { summary, isLoading } = useCollectiblesSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Collectibles"
        subtitle="Track your collectible investments - art, wine, watches, classic cars, and more."
        actions={[{ label: "Add Item", disabled: true }]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="collectibles"
        summary={summary}
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title="Collectible Categories"
        cards={collectiblesCategoryCards}
        actionLabel="View Collection"
      />
    </div>
  );
}
