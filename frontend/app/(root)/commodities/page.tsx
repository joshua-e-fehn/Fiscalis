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
  Coins,
  Fuel,
  Factory,
  Wheat,
  ArrowRight,
  TrendingUp,
  Atom,
  Gem,
} from "lucide-react";
import { CategoryDashboardSection } from "@/components/atomic/molecules/investments";
import { useCommoditiesSummary } from "@/hooks/convex/commodities";

/**
 * Commodities Overview Page
 *
 * Hub for all commodity types: Precious Metals, Energy, Industrial Metals, Agricultural, Rare Earth.
 * Currently only Precious Metals is implemented.
 */

interface CommodityCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
}

const commodityCategories: CommodityCategory[] = [
  {
    title: "Precious Metals",
    description:
      "Track gold, silver, platinum, and palladium prices with real-time charts",
    href: "/commodities/metals",
    icon: Coins,
    implemented: true,
    examples: ["Gold", "Silver", "Platinum", "Palladium"],
  },
  {
    title: "Energy",
    description: "Oil, natural gas, and other energy commodity prices",
    href: "/commodities/energy",
    icon: Fuel,
    implemented: false,
    examples: ["Crude Oil", "Natural Gas", "Heating Oil", "Gasoline"],
  },
  {
    title: "Industrial Metals",
    description: "Base metals used in manufacturing and construction",
    href: "/commodities/industrial",
    icon: Factory,
    implemented: false,
    examples: ["Copper", "Aluminum", "Zinc", "Nickel"],
  },
  {
    title: "Agricultural",
    description: "Grains, softs, and other agricultural commodities",
    href: "/commodities/agricultural",
    icon: Wheat,
    implemented: false,
    examples: ["Wheat", "Corn", "Soybeans", "Coffee"],
  },
  {
    title: "Rare Earth",
    description: "Strategic rare earth elements used in technology and defense",
    href: "/commodities/rare-earth",
    icon: Atom,
    implemented: false,
    examples: ["Neodymium", "Dysprosium", "Lithium", "Cobalt"],
  },
  {
    title: "Gemstones",
    description: "Diamonds, rubies, sapphires, and other precious gemstones",
    href: "/commodities/gemstones",
    icon: Gem,
    implemented: false,
    examples: ["Diamonds", "Rubies", "Sapphires", "Emeralds"],
  },
];

const CommodityCategoryCard = ({
  category,
}: {
  category: CommodityCategory;
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
              View Prices
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

export default function CommoditiesPage() {
  const { summary, isLoading } = useCommoditiesSummary("eur");

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6">
      {/* Header */}
      <div className="w-full">
        <h1 className="text-3xl font-bold">Commodities</h1>
        <p className="text-muted-foreground mt-2">
          Track real-time prices and manage your holdings across different
          commodity types
        </p>
      </div>

      {/* Portfolio Dashboard Section */}
      <div className="w-full">
        <CategoryDashboardSection
          summary={summary}
          currency="eur"
          isLoading={isLoading}
          showTopHoldings={hasHoldings ?? false}
        />
      </div>

      {/* Category Grid */}
      <div className="w-full">
        <h2 className="text-lg font-semibold mb-4">Categories</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {commodityCategories.map((category) => (
            <CommodityCategoryCard key={category.title} category={category} />
          ))}
        </div>
      </div>

      {/* Empty state CTA - only show when no holdings */}
      {!hasHoldings && !isLoading && (
        <Card className="w-full mt-4 bg-muted/30">
          <CardContent className="py-6">
            <div className="text-center">
              <p className="text-muted-foreground">
                Start tracking your commodity investments to see portfolio
                analytics here.
              </p>
              <Button asChild variant="link" className="mt-2">
                <Link href="/commodities/metals/inventory">
                  Get started with Precious Metals →
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
