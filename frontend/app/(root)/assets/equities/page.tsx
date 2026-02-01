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
  Building2,
  TrendingUp,
  ArrowRight,
  BarChart3,
  PieChart,
  Briefcase,
  Activity,
} from "lucide-react";
import {
  CategoryDashboardSection,
  SubcategoryCategoryCard,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useEquitiesSummary } from "@/hooks/convex/equities";

/**
 * Equities Overview Page
 *
 * Hub for all equity investment types: Private Equity, Public Stocks, ETFs/Index Funds, Mutual Funds, Options.
 */

const publicEquityCategories: SubcategoryCardData[] = [
  {
    title: "Public Stocks",
    description: "Individual company shares traded on public stock exchanges",
    href: "/equities/stocks",
    icon: TrendingUp,
    implemented: false,
    examples: ["Apple", "Microsoft", "Tesla", "Amazon"],
  },
  {
    title: "ETFs & Index Funds",
    description:
      "Passive funds tracking market indices for diversified exposure",
    href: "/equities/etfs",
    icon: BarChart3,
    implemented: false,
    examples: ["S&P 500", "MSCI World", "NASDAQ-100", "DAX"],
  },
  {
    title: "Mutual Funds",
    description:
      "Actively managed investment funds with professional portfolio management",
    href: "/equities/funds",
    icon: PieChart,
    implemented: false,
    examples: ["Growth Funds", "Value Funds", "Sector Funds", "Balanced Funds"],
  },
  {
    title: "Options",
    description: "Derivative contracts for hedging or leveraged exposure",
    href: "/equities/options",
    icon: Activity,
    implemented: false,
    examples: ["Call Options", "Put Options", "Spreads", "Covered Calls"],
  },
];

const privateEquityCategories: SubcategoryCardData[] = [
  {
    title: "Private Equity",
    description:
      "Investments in private companies, startups, and angel investments",
    href: "/equities/private",
    icon: Briefcase,
    implemented: false,
    examples: ["Startups", "Venture Capital", "Angel Investments", "PE Funds"],
  },
];

export default function EquitiesPage() {
  const { summary, isLoading } = useEquitiesSummary();

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Equities</h1>
        <p className="text-muted-foreground mt-2">
          Track your stock portfolio, ETFs, mutual funds, and private equity
          investments.
        </p>
      </div>

      {/* Portfolio Dashboard Section */}
      <CategoryDashboardSection
        summary={summary}
        currency="eur"
        isLoading={isLoading}
        showTopHoldings={hasHoldings ?? false}
      />

      {/* Public Equities Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Public Markets
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {publicEquityCategories.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Holdings"
            />
          ))}
        </div>
      </div>

      {/* Private Equities Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Private Markets
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {privateEquityCategories.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Holdings"
            />
          ))}
        </div>
      </div>

      {/* Connect Broker CTA */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Portfolio Overview
          </CardTitle>
          <CardDescription>
            Connect your brokerage accounts to automatically track all your
            equity investments in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/integrations/brokers">
              Connect Broker
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
