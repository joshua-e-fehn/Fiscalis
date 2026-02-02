"use client";

import {
  Wallet,
  PiggyBank,
  Landmark,
  Clock,
  Banknote,
  ArrowRightLeft,
} from "lucide-react";
import {
  InvestmentDashboardSection,
  CASH_KPI_CARDS,
  SubcategoryCategoryCard,
  PageHeader,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useCashSummary } from "@/hooks/convex/cash";
import { usePortfolioOverview } from "@/hooks/convex/portfolio";
import { categoryColorPalettes } from "@/lib/types/investments";

// Get cash color palette
const cashColors = categoryColorPalettes.cash;

/**
 * Cash & Money Market Overview Page
 *
 * Hub for all cash and money market investment types: Savings Accounts,
 * Money Market Funds, CDs, Treasury Bills, Cash Equivalents, Forex.
 */

const cashCategories: SubcategoryCardData[] = [
  {
    title: "Checking Accounts",
    description: "Everyday transaction accounts linked via banking connections",
    href: "/cash/checking",
    icon: Wallet,
    implemented: false,
    examples: ["Personal Checking", "Business Checking", "Joint Accounts"],
    color: cashColors["checking-accounts"],
  },
  {
    title: "Savings Accounts",
    description: "High-yield savings accounts and regular bank savings",
    href: "/cash/savings",
    icon: PiggyBank,
    implemented: false,
    examples: [
      "High-Yield Savings",
      "Regular Savings",
      "Online Savings",
      "Business Savings",
    ],
    color: cashColors["savings-accounts"],
  },
  {
    title: "Money Market Funds",
    description: "Short-term, low-risk investment funds with high liquidity",
    href: "/cash/money-market",
    icon: Landmark,
    implemented: false,
    examples: ["Government MMF", "Prime MMF", "Tax-Exempt MMF", "Retail MMF"],
    color: cashColors["money-market"],
  },
  {
    title: "Certificates of Deposit",
    description: "Fixed-term deposits with guaranteed interest rates",
    href: "/cash/cds",
    icon: Clock,
    implemented: false,
    examples: ["3-Month CD", "6-Month CD", "1-Year CD", "CD Ladders"],
    color: cashColors.cds,
  },
  {
    title: "Treasury Bills",
    description:
      "Short-term government securities with maturities under one year",
    href: "/cash/tbills",
    icon: Banknote,
    implemented: false,
    examples: [
      "4-Week T-Bill",
      "8-Week T-Bill",
      "13-Week T-Bill",
      "26-Week T-Bill",
    ],
    color: cashColors["treasury-bills"],
  },
  {
    title: "Foreign Currency (Forex)",
    description: "Foreign currency holdings and exchange positions",
    href: "/cash/forex",
    icon: ArrowRightLeft,
    implemented: false,
    examples: ["EUR", "GBP", "JPY", "CHF"],
    color: cashColors.forex,
  },
];

export default function CashPage() {
  const { summary, isLoading } = useCashSummary();
  const { summary: portfolioSummary } = usePortfolioOverview("eur");

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Cash & Money Market"
        subtitle="Track your liquid assets - savings accounts, money market funds, CDs, and foreign currency holdings."
        actions={[
          {
            label: "Connect Broker",
            href: "/integrations/brokers",
            variant: "outline",
          },
          { label: "Connect Bank", href: "/integrations/banking" },
        ]}
      />

      {/* Dashboard Section */}
      <InvestmentDashboardSection
        category="cash"
        summary={summary}
        currency="eur"
        isLoading={isLoading}
        kpiCards={CASH_KPI_CARDS}
        totalPortfolioAssets={portfolioSummary?.totalAssets ?? 0}
        performanceChartTitle="Cash Balance History"
      />

      {/* Category Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Cash Categories
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cashCategories.map((category) => (
            <SubcategoryCategoryCard
              key={category.title}
              category={category}
              actionLabel="View Accounts"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
