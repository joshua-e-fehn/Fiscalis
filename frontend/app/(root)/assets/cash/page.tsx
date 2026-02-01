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
  Wallet,
  PiggyBank,
  Landmark,
  Clock,
  Banknote,
  ArrowRightLeft,
  ArrowRight,
} from "lucide-react";
import {
  CategoryDashboardSection,
  SubcategoryCategoryCard,
  type SubcategoryCardData,
} from "@/components/atomic/molecules/investments";
import { useCashSummary } from "@/hooks/convex/cash";

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
  },
  {
    title: "Money Market Funds",
    description: "Short-term, low-risk investment funds with high liquidity",
    href: "/cash/money-market",
    icon: Landmark,
    implemented: false,
    examples: ["Government MMF", "Prime MMF", "Tax-Exempt MMF", "Retail MMF"],
  },
  {
    title: "Certificates of Deposit",
    description: "Fixed-term deposits with guaranteed interest rates",
    href: "/cash/cds",
    icon: Clock,
    implemented: false,
    examples: ["3-Month CD", "6-Month CD", "1-Year CD", "CD Ladders"],
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
  },
  {
    title: "Foreign Currency (Forex)",
    description: "Foreign currency holdings and exchange positions",
    href: "/cash/forex",
    icon: ArrowRightLeft,
    implemented: false,
    examples: ["EUR", "GBP", "JPY", "CHF"],
  },
];

export default function CashPage() {
  const { summary, isLoading } = useCashSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Cash & Money Market
        </h1>
        <p className="text-muted-foreground mt-2">
          Track your liquid assets - savings accounts, money market funds, CDs,
          and foreign currency holdings.
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
        {cashCategories.map((category) => (
          <SubcategoryCategoryCard
            key={category.title}
            category={category}
            actionLabel="View Accounts"
          />
        ))}
      </div>

      {/* Summary Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Liquidity Overview
          </CardTitle>
          <CardDescription>
            Cash and money market investments provide stability and liquidity.
            Track interest rates, maturity dates, and optimize your emergency
            fund allocation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/integrations/banking">
              Connect Bank Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
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
