"use client";

import {
  Palette,
  Wine,
  Watch,
  Car,
  Coins,
  IdCardLanyard,
  Image,
} from "lucide-react";
import { Icon } from "lucide-react";
import { gemRing } from "@lucide/lab";
import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
  PageHeader,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useCollectiblesSummary } from "@/hooks/convex/collectibles";
import { categoryColorPalettes } from "@/lib/types/investments";

// Get collectibles color palette
const collectiblesColors = categoryColorPalettes.collectibles;

// Wrapper component for lab icons to match the standard icon interface
const GemRingIcon = ({ className }: { className?: string }) => (
  <Icon iconNode={gemRing} className={className} />
);

/**
 * Collectibles Overview Page
 *
 * Hub for all collectible investment types: Art, Wine, Watches, Jewelry,
 * Classic Cars, Numismatic Coins, Trading Cards, NFTs.
 */

const collectibleCategories: SubcategoryCardData[] = [
  {
    title: "Art",
    description: "Fine art, paintings, sculptures, and artistic collectibles",
    href: "/collectibles/art",
    icon: Palette,
    implemented: false,
    examples: ["Paintings", "Sculptures", "Prints", "Photography"],
    color: collectiblesColors.art,
  },
  {
    title: "Wine",
    description: "Fine wines and vintage bottles as investment assets",
    href: "/collectibles/wine",
    icon: Wine,
    implemented: false,
    examples: ["Bordeaux", "Burgundy", "Champagne", "Napa Valley"],
    color: collectiblesColors.wine,
  },
  {
    title: "Watches",
    description: "Luxury timepieces and vintage watch collections",
    href: "/collectibles/watches",
    icon: Watch,
    implemented: false,
    examples: ["Rolex", "Patek Philippe", "Audemars Piguet", "Omega"],
    color: collectiblesColors.watches,
  },
  {
    title: "Jewelry",
    description: "Precious jewelry, gemstones, and designer pieces",
    href: "/collectibles/jewelry",
    icon: GemRingIcon,
    implemented: false,
    examples: [
      "Diamonds",
      "Colored Gems",
      "Vintage Jewelry",
      "Designer Pieces",
    ],
    color: collectiblesColors.other,
  },
  {
    title: "Classic Cars",
    description: "Vintage automobiles and collector vehicles",
    href: "/collectibles/cars",
    icon: Car,
    implemented: false,
    examples: ["Porsche", "Ferrari", "Mercedes-Benz", "Muscle Cars"],
    color: collectiblesColors.cars,
  },
  {
    title: "Numismatic Coins",
    description: "Rare coins and currency collections with historical value",
    href: "/collectibles/coins",
    icon: Coins,
    implemented: false,
    examples: ["Ancient Coins", "Gold Coins", "Silver Coins", "Error Coins"],
    color: collectiblesColors.memorabilia,
  },
  {
    title: "Trading Cards",
    description:
      "Sports cards, Pokémon, Magic: The Gathering, and other collectible cards",
    href: "/collectibles/cards",
    icon: IdCardLanyard,
    implemented: false,
    examples: ["Sports Cards", "Pokémon", "Magic: The Gathering", "Yu-Gi-Oh!"],
    color: collectiblesColors.memorabilia,
  },
  {
    title: "NFTs",
    description: "Non-fungible tokens and digital collectibles",
    href: "/collectibles/nfts",
    icon: Image,
    implemented: false,
    examples: ["Art NFTs", "PFP Collections", "Gaming NFTs", "Music NFTs"],
    color: collectiblesColors.nfts,
  },
];

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
          {collectibleCategories.map((category) => (
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
