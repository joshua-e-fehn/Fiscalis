"use client";

import { Coins, Fuel, Factory, Wheat, Atom, Gem } from "lucide-react";
import {
  InvestmentDashboardSection,
  COMMODITIES_KPI_CARDS,
  SubcategoryCategoryCard,
  PageHeader,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useCommoditiesSummary } from "@/hooks/convex/commodities";
import { categoryColorPalettes } from "@/lib/types/investments";

// Get commodities color palette
const commoditiesColors = categoryColorPalettes.commodities;

/**
 * Commodities Overview Page
 *
 * Hub for all commodity types: Precious Metals, Energy, Industrial Metals, Agricultural, Rare Earth.
 * Currently only Precious Metals is implemented.
 */

const commodityCategories: SubcategoryCardData[] = [
  {
    title: "Precious Metals",
    description:
      "Track gold, silver, platinum, and palladium prices with real-time charts",
    href: "/assets/commodities/metals",
    icon: Coins,
    implemented: true,
    examples: ["Gold", "Silver", "Platinum", "Palladium"],
    color: commoditiesColors.metals,
  },
  {
    title: "Energy",
    description: "Oil, natural gas, and other energy commodity prices",
    href: "/assets/commodities/energy",
    icon: Fuel,
    implemented: false,
    examples: ["Crude Oil", "Natural Gas", "Heating Oil", "Gasoline"],
    color: commoditiesColors.energy,
  },
  {
    title: "Industrial Metals",
    description: "Base metals used in manufacturing and construction",
    href: "/assets/commodities/industrial",
    icon: Factory,
    implemented: false,
    examples: ["Copper", "Aluminum", "Zinc", "Nickel"],
    color: commoditiesColors.industrial,
  },
  {
    title: "Agricultural",
    description: "Grains, softs, and other agricultural commodities",
    href: "/assets/commodities/agricultural",
    icon: Wheat,
    implemented: false,
    examples: ["Wheat", "Corn", "Soybeans", "Coffee"],
    color: commoditiesColors.agricultural,
  },
  {
    title: "Rare Earth",
    description: "Strategic rare earth elements used in technology and defense",
    href: "/assets/commodities/rare-earth",
    icon: Atom,
    implemented: false,
    examples: ["Neodymium", "Dysprosium", "Lithium", "Cobalt"],
    color: commoditiesColors["rare-earth"],
  },
  {
    title: "Gemstones",
    description: "Diamonds, rubies, sapphires, and other precious gemstones",
    href: "/assets/commodities/gemstones",
    icon: Gem,
    implemented: false,
    examples: ["Diamonds", "Rubies", "Sapphires", "Emeralds"],
    color: commoditiesColors.gemstones,
  },
];

export default function CommoditiesPage() {
  const { summary, isLoading } = useCommoditiesSummary("eur");

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 md:px-24 gap-6">
      <PageHeader
        title="Commodities"
        subtitle="Track real-time prices and manage your holdings across different commodity types"
        actions={[
          {
            label: "Add Item",
            href: "/assets/commodities/metals",
            variant: "outline",
          },
          { label: "Connect Broker", href: "/integrations/brokers" },
        ]}
      />

      {/* Portfolio Dashboard Section */}
      <div className="w-full">
        <InvestmentDashboardSection
          category="commodities"
          summary={summary}
          currency="eur"
          isLoading={isLoading}
          kpiCards={COMMODITIES_KPI_CARDS}
          showTopHoldings={hasHoldings ?? false}
        />
      </div>

      {/* Category Grid */}
      <div className="w-full space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Commodity Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {commodityCategories.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Portfolio"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
