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
  TrendingUp,
  MapPin,
} from "lucide-react";

/**
 * Real Estate Overview Page
 *
 * Hub for all real estate investment types: Residential, Commercial, REITs,
 * Crowdfunding, Land.
 */

interface RealEstateCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
}

const realEstateCategories: RealEstateCategory[] = [
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

const RealEstateCategoryCard = ({
  category,
}: {
  category: RealEstateCategory;
}) => {
  const Icon = category.icon;

  return (
    <Card
      className={`relative overflow-hidden transition-all ${
        category.implemented
          ? "hover:shadow-lg hover:border-primary cursor-pointer"
          : "opacity-60"
      }`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                category.implemented ? "bg-primary/10" : "bg-muted"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${
                  category.implemented
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
            </div>
            <div>
              <CardTitle className="text-lg">{category.title}</CardTitle>
              {!category.implemented && (
                <span className="text-xs text-muted-foreground">
                  Coming soon
                </span>
              )}
            </div>
          </div>
          {category.implemented && (
            <TrendingUp className="h-5 w-5 text-green-500" />
          )}
        </div>
        <CardDescription className="mt-2">
          {category.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {category.examples.map((example) => (
            <span
              key={example}
              className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
            >
              {example}
            </span>
          ))}
        </div>
        {category.implemented ? (
          <Button asChild className="w-full">
            <Link href={category.href}>
              View Properties
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled className="w-full" variant="outline">
            Coming Soon
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default function RealEstatePage() {
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

      {/* Category Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {realEstateCategories.map((category) => (
          <RealEstateCategoryCard key={category.title} category={category} />
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
