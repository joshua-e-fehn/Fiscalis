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
  Landmark,
  Building,
  Building2,
  PiggyBank,
  BarChart3,
  ArrowRight,
  TrendingUp,
  FileText,
} from "lucide-react";
import { CategoryDashboardSection } from "@/components/atomic/molecules/investments";
import { useBondsSummary } from "@/hooks/convex/bonds";

/**
 * Bonds Overview Page
 *
 * Hub for all fixed income investment types: Government Bonds, Corporate Bonds,
 * Municipal Bonds, Savings Bonds, Bond Funds/ETFs.
 */

interface BondCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
}

const bondCategories: BondCategory[] = [
  {
    title: "Government Bonds",
    description:
      "Treasury bills, notes, and bonds issued by national governments including inflation-protected securities",
    href: "/bonds/government",
    icon: Landmark,
    implemented: false,
    examples: ["US Treasuries", "German Bunds", "UK Gilts", "TIPS/I-Bonds"],
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
  },
  {
    title: "Bond Funds & ETFs",
    description: "Diversified fixed income exposure through funds and ETFs",
    href: "/bonds/funds",
    icon: BarChart3,
    implemented: false,
    examples: ["Aggregate Bond", "Short-Term", "Long-Term", "International"],
  },
];

const BondCategoryCard = ({ category }: { category: BondCategory }) => {
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
              View Holdings
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

export default function BondsPage() {
  const { summary, isLoading } = useBondsSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bonds</h1>
        <p className="text-muted-foreground mt-2">
          Track your fixed income investments - government bonds, corporate
          bonds, and bond funds.
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
        {bondCategories.map((category) => (
          <BondCategoryCard key={category.title} category={category} />
        ))}
      </div>

      {/* Summary Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Fixed Income Overview
          </CardTitle>
          <CardDescription>
            Bonds provide steady income and help balance portfolio risk. Track
            maturity dates, yields, and interest payments all in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/brokers">
              Connect Broker
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/banking">
              Connect Bank Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
