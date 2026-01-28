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
  TrendingUp,
} from "lucide-react";

/**
 * Cash & Money Market Overview Page
 *
 * Hub for all cash and money market investment types: Savings Accounts,
 * Money Market Funds, CDs, Treasury Bills, Cash Equivalents, Forex.
 */

interface CashCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
}

const cashCategories: CashCategory[] = [
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

const CashCategoryCard = ({ category }: { category: CashCategory }) => {
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
              View Accounts
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

export default function CashPage() {
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

      {/* Category Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cashCategories.map((category) => (
          <CashCategoryCard key={category.title} category={category} />
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
            <Link href="/banking">
              Connect Bank Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
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
