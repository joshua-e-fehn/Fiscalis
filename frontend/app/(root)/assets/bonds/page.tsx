"use client";

import {
  Landmark,
  Building,
  Building2,
  PiggyBank,
  BarChart3,
} from "lucide-react";
import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
  PageHeader,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useBondsSummary } from "@/hooks/convex/bonds";
import { categoryColorPalettes } from "@/lib/types/investments";

// Get bonds color palette
const bondsColors = categoryColorPalettes.bonds;

/**
 * Bonds Overview Page
 *
 * Hub for all fixed income investment types: Government Bonds, Corporate Bonds,
 * Municipal Bonds, Savings Bonds, Bond Funds/ETFs.
 */

const bondCategories: SubcategoryCardData[] = [
  {
    title: "Government Bonds",
    description:
      "Treasury bills, notes, and bonds issued by national governments including inflation-protected securities",
    href: "/bonds/government",
    icon: Landmark,
    implemented: false,
    examples: ["US Treasuries", "German Bunds", "UK Gilts", "TIPS/I-Bonds"],
    color: bondsColors.government,
  },
  {
    title: "Corporate Bonds",
    description: "Investment-grade and high-yield bonds issued by corporations",
    href: "/bonds/corporate",
    icon: Building,
    implemented: false,
    examples: [
      "Investment Grade",
      "High Yield",
      "Convertible Bonds",
      "Green Bonds",
    ],
    color: bondsColors.corporate,
  },
  {
    title: "Municipal Bonds",
    description:
      "Tax-advantaged bonds issued by states, cities, and local governments",
    href: "/bonds/municipal",
    icon: Building2,
    implemented: false,
    examples: [
      "General Obligation",
      "Revenue Bonds",
      "Tax-Free Munis",
      "Build America",
    ],
    color: bondsColors.municipal,
  },
  {
    title: "Savings Bonds",
    description: "Government-backed savings certificates and retail bonds",
    href: "/bonds/savings",
    icon: PiggyBank,
    implemented: false,
    examples: [
      "Series I Bonds",
      "Series EE Bonds",
      "Premium Bonds",
      "Savings Certificates",
    ],
    color: bondsColors.savings,
  },
  {
    title: "Bond Funds & ETFs",
    description: "Diversified fixed income exposure through funds and ETFs",
    href: "/bonds/funds",
    icon: BarChart3,
    implemented: false,
    examples: ["Aggregate Bond", "Short-Term", "Long-Term", "International"],
    color: bondsColors.funds,
  },
];

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
          {bondCategories.map((category) => (
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
