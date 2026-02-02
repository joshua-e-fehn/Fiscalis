"use client";

import { Home, Building2, BarChart3, Users, TreePine } from "lucide-react";
import {
  CategoryDashboardSection,
  SubcategoryCategoryCard,
  PageHeader,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useRealEstateSummary } from "@/hooks/convex/realEstate";
import { categoryColorPalettes } from "@/lib/types/investments";

// Get real-estate color palette
const realEstateColors = categoryColorPalettes["real-estate"];

/**
 * Real Estate Overview Page
 *
 * Hub for all real estate investment types: Residential, Commercial, REITs,
 * Crowdfunding, Land.
 */

const realEstateCategories: SubcategoryCardData[] = [
  {
    title: "Residential",
    description:
      "Single-family homes, apartments, condos, and vacation properties",
    href: "/real-estate/residential",
    icon: Home,
    implemented: false,
    examples: ["Primary Home", "Rental Properties", "Vacation Homes", "Condos"],
    color: realEstateColors.residential,
  },
  {
    title: "Commercial",
    description:
      "Office buildings, retail spaces, warehouses, and industrial properties",
    href: "/real-estate/commercial",
    icon: Building2,
    implemented: false,
    examples: ["Office Space", "Retail", "Warehouses", "Mixed-Use"],
    color: realEstateColors.commercial,
  },
  {
    title: "REITs",
    description:
      "Real Estate Investment Trusts - publicly traded real estate securities",
    href: "/real-estate/reits",
    icon: BarChart3,
    implemented: false,
    examples: ["Equity REITs", "Mortgage REITs", "Hybrid REITs", "REIT ETFs"],
    color: realEstateColors.reits,
  },
  {
    title: "Crowdfunding",
    description: "Real estate investments through crowdfunding platforms",
    href: "/real-estate/crowdfunding",
    icon: Users,
    implemented: false,
    examples: ["Fundrise", "CrowdStreet", "RealtyMogul", "Groundfloor"],
    color: realEstateColors.crowdfunding,
  },
  {
    title: "Land",
    description: "Raw land, farmland, and undeveloped property investments",
    href: "/real-estate/land",
    icon: TreePine,
    implemented: false,
    examples: ["Raw Land", "Farmland", "Timber", "Development Land"],
    color: realEstateColors.land,
  },
];

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
      <CategoryDashboardSection
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
          {realEstateCategories.map((category) => (
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
