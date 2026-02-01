"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import {
  Home,
  Building2,
  BarChart3,
  Users,
  TreePine,
  ArrowRight,
  MapPin,
} from "lucide-react";
import {
  CategoryDashboardSection,
  SubcategoryCategoryCard,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useRealEstateSummary } from "@/hooks/convex/realEstate";

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
  },
  {
    title: "Commercial",
    description:
      "Office buildings, retail spaces, warehouses, and industrial properties",
    href: "/real-estate/commercial",
    icon: Building2,
    implemented: false,
    examples: ["Office Space", "Retail", "Warehouses", "Mixed-Use"],
  },
  {
    title: "REITs",
    description:
      "Real Estate Investment Trusts - publicly traded real estate securities",
    href: "/real-estate/reits",
    icon: BarChart3,
    implemented: false,
    examples: ["Equity REITs", "Mortgage REITs", "Hybrid REITs", "REIT ETFs"],
  },
  {
    title: "Crowdfunding",
    description: "Real estate investments through crowdfunding platforms",
    href: "/real-estate/crowdfunding",
    icon: Users,
    implemented: false,
    examples: ["Fundrise", "CrowdStreet", "RealtyMogul", "Groundfloor"],
  },
  {
    title: "Land",
    description: "Raw land, farmland, and undeveloped property investments",
    href: "/real-estate/land",
    icon: TreePine,
    implemented: false,
    examples: ["Raw Land", "Farmland", "Timber", "Development Land"],
  },
];

export default function RealEstatePage() {
  const { summary, isLoading } = useRealEstateSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Real Estate</h1>
        <p className="text-muted-foreground mt-2">
          Track your real estate investments - residential properties,
          commercial holdings, REITs, and more.
        </p>
      </div>

      {/* Dashboard Section */}
      <CategoryDashboardSection
        summary={summary}
        currency="eur"
        isLoading={isLoading}
      />

      {/* Category Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {realEstateCategories.map((category) => (
          <SubcategoryCategoryCard
            key={category.title}
            category={category}
            actionLabel="View Properties"
          />
        ))}
      </div>

      {/* Summary Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Property Portfolio
          </CardTitle>
          <CardDescription>
            Real estate provides diversification, rental income, and potential
            appreciation. Track property values, rental yields, and equity
            growth.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled>
            Add Property
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
