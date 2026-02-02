"use client";

import {
  TrendingUp,
  BarChart3,
  PieChart,
  Briefcase,
  Activity,
} from "lucide-react";
import {
  InvestmentDashboardSection,
  SubcategoryCategoryCard,
  PageHeader,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useEquitiesSummary } from "@/hooks/convex/equities";
import { categoryColorPalettes } from "@/lib/types/investments";

// Get equities color palette
const equitiesColors = categoryColorPalettes.equities;

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
    color: equitiesColors.stocks,
  },
  {
    title: "ETFs & Index Funds",
    description:
      "Passive funds tracking market indices for diversified exposure",
    href: "/equities/etfs",
    icon: BarChart3,
    implemented: false,
    examples: ["S&P 500", "MSCI World", "NASDAQ-100", "DAX"],
    color: equitiesColors.etfs,
  },
  {
    title: "Mutual Funds",
    description:
      "Actively managed investment funds with professional portfolio management",
    href: "/equities/funds",
    icon: PieChart,
    implemented: false,
    examples: ["Growth Funds", "Value Funds", "Sector Funds", "Balanced Funds"],
    color: equitiesColors.funds,
  },
  {
    title: "Options",
    description: "Derivative contracts for hedging or leveraged exposure",
    href: "/equities/options",
    icon: Activity,
    implemented: false,
    examples: ["Call Options", "Put Options", "Spreads", "Covered Calls"],
    color: equitiesColors.options,
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
    color: equitiesColors.private,
  },
];

export default function EquitiesPage() {
  const { summary, isLoading } = useEquitiesSummary();

  // Check if there are any holdings
  const hasHoldings = summary && summary.totalValue > 0;

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Equities"
        subtitle="Track your stock portfolio, ETFs, mutual funds, and private equity investments."
        actions={[{ label: "Connect Broker", href: "/integrations/brokers" }]}
      />

      {/* Portfolio Dashboard Section */}
      <InvestmentDashboardSection
        category="equities"
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
    </div>
  );
}
