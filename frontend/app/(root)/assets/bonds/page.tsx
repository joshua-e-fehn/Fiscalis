"use client";

import {
  InvestmentDashboardSection,
  SubcategoryCardSection,
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
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <SubcategoryCardSection
        title="Bond Categories"
        cards={bondsCategoryCards}
        actionLabel="View Holdings"
      />
    </div>
  );
}
