"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import {
  InvestmentDashboardSection,
  visibleCategoryCards,
} from "@/components/atomic/molecules/investments";
import { useLiabilitiesSummary } from "@/hooks/convex/liabilities";
import { formatCurrency } from "@/lib/utils/currency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { AddLoanDialog } from "@/components/atomic/organisms/loans/add-loan-dialog";
import {
  liabilitiesSubcategoryUI,
  useCategoryLabels,
} from "@/lib/config/categoryUI";

/**
 * Liabilities Overview Page
 *
 * Hub for all liability types: Mortgages, Loans, Credit Cards, Margin Loans.
 */

/**
 * A liability type card. Name, description and example tags come from the
 * liabilities subcategory catalogue (categories.liabilities.*); this page
 * links to the loans tracker, which the shared card config does not mark as
 * built.
 */
interface LiabilityCategory {
  id: keyof typeof liabilitiesSubcategoryUI;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
}

const liabilityCategories: LiabilityCategory[] = [
  {
    id: "mortgages",
    href: "/liabilities/mortgages",
    icon: Home,
    implemented: false,
  },
  {
    id: "loans",
    href: "/liabilities/loans",
    icon: Banknote,
    implemented: true,
  },
  {
    id: "credit-cards",
    href: "/liabilities/credit-cards",
    icon: CreditCard,
    implemented: false,
  },
  {
    id: "margin-loans",
    href: "/liabilities/margin",
    icon: TrendingDown,
    implemented: false,
  },
];

interface LiabilityCategoryCardProps {
  category: LiabilityCategory;
  value: number;
  holdingsCount: number;
  /** Currency `value` is in (the summary's) */
  currency: InvestmentCurrency;
}

const LiabilityCategoryCard = ({
  category,
  value,
  holdingsCount,
  currency,
}: LiabilityCategoryCardProps) => {
  const t = useTranslations("loans.liabilitiesOverview");
  const tCard = useTranslations("categories.card");
  const labels = useCategoryLabels();
  const label = liabilitiesSubcategoryUI[category.id].label;
  const Icon = category.icon;
  const hasHoldings = holdingsCount > 0;

  const formatValue = (val: number) =>
    formatCurrency(val, currency, { compact: true });

  return (
    <Card
      className={`relative overflow-hidden transition-all ${
        category.implemented
          ? "hover:shadow-lg hover:border-destructive/50 cursor-pointer"
          : "opacity-60"
      }`}
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
              <CardTitle className="text-lg">{labels.name(label)}</CardTitle>
              {hasHoldings ? (
                <span className="text-sm font-semibold text-destructive">
                  {formatValue(value)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t("noBalances")}
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
          {labels.description(label)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasHoldings ? (
          <div className="mb-4">
            <span className="text-sm text-muted-foreground">
              {t("accounts", { count: holdingsCount })}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {labels.examples(label).map((example) => (
              <span
                key={example}
                className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
              >
                {example}
              </span>
            ))}
          </div>
        )}
        {category.implemented ? (
          <Button
            asChild
            className="w-full"
            variant={hasHoldings ? "destructive" : "outline"}
          >
            <Link href={category.href}>
              {hasHoldings ? t("viewDetails") : t("track")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled className="w-full" variant="outline">
            {tCard("comingSoonButton")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default function LiabilitiesPage() {
  const { summary, currency, isLoading } = useLiabilitiesSummary();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const t = useTranslations("loans.liabilitiesOverview");
  const tLoans = useTranslations("loans.list");
  const tCalculator = useTranslations("calculators.loan");
  const tAction = useTranslations("assets.actions");
  const labels = useCategoryLabels();

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
          <h1 className="text-3xl font-bold tracking-tight">
            {labels.categoryName("liabilities")}
          </h1>
          <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {tLoans("addLoan")}
        </Button>
      </div>

      {/* Summary Alert if has liabilities */}
      {hasLiabilities && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("total")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {formatCurrency(summary.totalValue, currency)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t("acrossAccounts", {
                count: summary.subcategories.reduce(
                  (sum, s) => sum + s.holdingsCount,
                  0,
                ),
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Dashboard Section */}
      <InvestmentDashboardSection
        category="liabilities"
        summary={summary}
        currency={currency}
        isLoading={isLoading}
        showTopHoldings={hasLiabilities ?? false}
      />

      {/* Liability Categories */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {t("byType")}
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Planned types ("Coming Soon") stay hidden until built (ENG-227) */}
          {visibleCategoryCards(liabilityCategories).map((category) => {
            const data = getSubcategoryData(category.id);
            return (
              <LiabilityCategoryCard
                key={category.id}
                category={category}
                value={data.value}
                holdingsCount={data.holdingsCount}
                currency={currency}
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
            {t("toolsTitle")}
          </CardTitle>
          <CardDescription>{t("toolsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href="/tools/calculators/loan">
              {tCalculator("title")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/integrations/banking">
              {tAction("connectBank")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <AddLoanDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  );
}
