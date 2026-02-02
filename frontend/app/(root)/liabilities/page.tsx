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
  Home,
  CreditCard,
  Banknote,
  TrendingDown,
  ArrowRight,
  Building2,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { InvestmentDashboardSection } from "@/components/atomic/molecules/investments";
import { useLiabilitiesSummary } from "@/hooks/convex/liabilities";

/**
 * Liabilities Overview Page
 *
 * Hub for all liability types: Mortgages, Loans, Credit Cards, Margin Loans.
 */

interface LiabilityCategory {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  examples: string[];
}

const liabilityCategories: LiabilityCategory[] = [
  {
    id: "mortgages",
    title: "Mortgages",
    description: "Home loans and property mortgages",
    href: "/liabilities/mortgages",
    icon: Home,
    examples: ["Primary Residence", "Investment Property", "Second Home"],
  },
  {
    id: "loans",
    title: "Loans",
    description: "Personal, auto, student, and other loans",
    href: "/liabilities/loans",
    icon: Banknote,
    examples: ["Auto Loans", "Student Loans", "Personal Loans"],
  },
  {
    id: "credit-cards",
    title: "Credit Cards",
    description: "Credit card balances and revolving credit",
    href: "/liabilities/credit-cards",
    icon: CreditCard,
    examples: ["Visa", "Mastercard", "Amex", "Store Cards"],
  },
  {
    id: "margin-loans",
    title: "Margin Loans",
    description: "Borrowed funds from brokerage accounts",
    href: "/liabilities/margin",
    icon: TrendingDown,
    examples: ["Broker Margin", "Securities Lending"],
  },
];

interface LiabilityCategoryCardProps {
  category: LiabilityCategory;
  value: number;
  holdingsCount: number;
}

const LiabilityCategoryCard = ({
  category,
  value,
  holdingsCount,
}: LiabilityCategoryCardProps) => {
  const Icon = category.icon;
  const hasHoldings = holdingsCount > 0;

  // Format value for display
  const formatValue = (val: number) => {
    if (val >= 1000000) {
      return `€${(val / 1000000).toFixed(2)}M`;
    } else if (val >= 1000) {
      return `€${(val / 1000).toFixed(1)}K`;
    }
    return `€${val.toFixed(2)}`;
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all hover:shadow-lg hover:border-destructive/50 cursor-pointer`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                hasHoldings ? "bg-destructive/10" : "bg-muted"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${
                  hasHoldings ? "text-destructive" : "text-muted-foreground"
                }`}
              />
            </div>
            <div>
              <CardTitle className="text-lg">{category.title}</CardTitle>
              {hasHoldings ? (
                <span className="text-sm font-semibold text-destructive">
                  {formatValue(value)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  No balances
                </span>
              )}
            </div>
          </div>
          {hasHoldings && (
            <div className="text-right">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
          )}
        </div>
        <CardDescription className="mt-2">
          {category.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasHoldings ? (
          <div className="mb-4">
            <span className="text-sm text-muted-foreground">
              {holdingsCount} {holdingsCount === 1 ? "account" : "accounts"}
            </span>
          </div>
        ) : (
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
        )}
        <Button
          asChild
          className="w-full"
          variant={hasHoldings ? "destructive" : "outline"}
        >
          <Link href={category.href}>
            {hasHoldings ? "View Details" : "Track Liability"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export default function LiabilitiesPage() {
  const { summary, isLoading } = useLiabilitiesSummary();

  // Check if there are any liabilities
  const hasLiabilities = summary && summary.totalValue > 0;

  // Helper to get subcategory data from summary
  const getSubcategoryData = (id: string) => {
    const subcategory = summary?.subcategories.find((s) => s.id === id);
    return {
      value: subcategory?.totalValue ?? 0,
      holdingsCount: subcategory?.holdingsCount ?? 0,
    };
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Liabilities</h1>
          <p className="text-muted-foreground mt-2">
            Track your debts, loans, mortgages, and credit card balances.
          </p>
        </div>
        <Button asChild>
          <Link href="/liabilities/loans/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Loan
          </Link>
        </Button>
      </div>

      {/* Summary Alert if has liabilities */}
      {hasLiabilities && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Total Liabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              €
              {summary.totalValue.toLocaleString("de-DE", {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Across{" "}
              {summary.subcategories.reduce(
                (sum, s) => sum + s.holdingsCount,
                0,
              )}{" "}
              accounts
            </p>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Dashboard Section */}
      <InvestmentDashboardSection
        category="liabilities"
        summary={summary}
        currency="eur"
        isLoading={isLoading}
        showTopHoldings={hasLiabilities ?? false}
      />

      {/* Liability Categories */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            By Type
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {liabilityCategories.map((category) => {
            const data = getSubcategoryData(category.id);
            return (
              <LiabilityCategoryCard
                key={category.title}
                category={category}
                value={data.value}
                holdingsCount={data.holdingsCount}
              />
            );
          })}
        </div>
      </div>

      {/* Loan Management CTA */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Loan Calculator & Tracker
          </CardTitle>
          <CardDescription>
            Use the advanced loan calculator to plan repayments, compare
            scenarios, and track your debt payoff progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href="/calculators/loan">
              Loan Calculator
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/banking">
              Connect Bank
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
