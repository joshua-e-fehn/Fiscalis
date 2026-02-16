"use client";

import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
  PageHeader,
} from "@/components/atomic/molecules/investments";
import { useBondsSummary } from "@/hooks/convex/bonds";
import { bondsCategoryCards } from "@/lib/config/categoryUI";

export default function BondsPage() {
  const { summary, isLoading } = useBondsSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Bonds"
        subtitle="Track your fixed income investments - government bonds, corporate bonds, and bond funds."
        actions={[{ label: "Connect Broker", href: "/integrations/brokers" }]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="bonds"
        summary={summary}
        currency="eur"
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Bond Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {bondsCategoryCards.map((category) => (
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
