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
  Palette,
  Wine,
  Watch,
  Car,
  Coins,
  IdCardLanyard,
  Image,
  ArrowRight,
  TrendingUp,
  Star,
} from "lucide-react";
import { Icon } from "lucide-react";
import { gemRing } from "@lucide/lab";
import { CategoryDashboardSection } from "@/components/atomic/molecules/investments";
import { useCollectiblesSummary } from "@/hooks/convex/collectibles";

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

interface CollectibleCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
}

const collectibleCategories: CollectibleCategory[] = [
  {
    title: "Art",
    description: "Fine art, paintings, sculptures, and artistic collectibles",
    href: "/collectibles/art",
    icon: Palette,
    implemented: false,
    examples: ["Paintings", "Sculptures", "Prints", "Photography"],
  },
  {
    title: "Wine",
    description: "Fine wines and vintage bottles as investment assets",
    href: "/collectibles/wine",
    icon: Wine,
    implemented: false,
    examples: ["Bordeaux", "Burgundy", "Champagne", "Napa Valley"],
  },
  {
    title: "Watches",
    description: "Luxury timepieces and vintage watch collections",
    href: "/collectibles/watches",
    icon: Watch,
    implemented: false,
    examples: ["Rolex", "Patek Philippe", "Audemars Piguet", "Omega"],
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
  },
  {
    title: "Classic Cars",
    description: "Vintage automobiles and collector vehicles",
    href: "/collectibles/cars",
    icon: Car,
    implemented: false,
    examples: ["Porsche", "Ferrari", "Mercedes-Benz", "Muscle Cars"],
  },
  {
    title: "Numismatic Coins",
    description: "Rare coins and currency collections with historical value",
    href: "/collectibles/coins",
    icon: Coins,
    implemented: false,
    examples: ["Ancient Coins", "Gold Coins", "Silver Coins", "Error Coins"],
  },
  {
    title: "Trading Cards",
    description:
      "Sports cards, Pokémon, Magic: The Gathering, and other collectible cards",
    href: "/collectibles/cards",
    icon: IdCardLanyard,
    implemented: false,
    examples: ["Sports Cards", "Pokémon", "Magic: The Gathering", "Yu-Gi-Oh!"],
  },
  {
    title: "NFTs",
    description: "Non-fungible tokens and digital collectibles",
    href: "/collectibles/nfts",
    icon: Image,
    implemented: false,
    examples: ["Art NFTs", "PFP Collections", "Gaming NFTs", "Music NFTs"],
  },
];

const CollectibleCategoryCard = ({
  category,
}: {
  category: CollectibleCategory;
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
              View Collection
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

export default function CollectiblesPage() {
  const { summary, isLoading } = useCollectiblesSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Collectibles</h1>
        <p className="text-muted-foreground mt-2">
          Track your collectible investments - art, wine, watches, classic cars,
          and more.
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
        {collectibleCategories.map((category) => (
          <CollectibleCategoryCard key={category.title} category={category} />
        ))}
      </div>

      {/* Summary Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Collection Overview
          </CardTitle>
          <CardDescription>
            Collectibles can provide diversification and potential appreciation.
            Track valuations, provenance, and insurance details for your
            collection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled>
            Add Item
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
