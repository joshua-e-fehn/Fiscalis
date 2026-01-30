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
} from "lucide-react";
import { CategoryDashboardSection } from "@/components/atomic/molecules/investments";
import { useEquitiesSummary } from "@/hooks/convex/equities";

/**
 * Equities Overview Page
 *
 * Hub for all equity investment types: Private Equity, Public Stocks, ETFs/Index Funds, Mutual Funds.
 */

interface EquityCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
}

const publicEquityCategories: EquityCategory[] = [
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
];

const privateEquityCategories: EquityCategory[] = [
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

const EquityCategoryCard = ({ category }: { category: EquityCategory }) => {
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
              View Portfolio
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {publicEquityCategories.map((category) => (
            <EquityCategoryCard key={category.title} category={category} />
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
            <EquityCategoryCard key={category.title} category={category} />
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
            <Link href="/brokers">
              Connect Broker
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
