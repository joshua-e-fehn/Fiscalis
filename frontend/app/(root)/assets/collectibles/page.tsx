"use client";

import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
  PageHeader,
} from "@/components/atomic/molecules/investments";
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
        currency="eur"
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Collectible Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {collectiblesCategoryCards.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Collection"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
