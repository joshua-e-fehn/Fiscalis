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
import { ArrowRight, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCategoryLabels,
  type CategoryCardData,
} from "@/lib/config/categoryUI";
import { isFeatureEnabled } from "@/lib/config/features";
import { cn } from "@/lib/utils";

/** A subcategory card: its catalogue label (title), route, icon and colour */
export type SubcategoryCardData = Pick<
  CategoryCardData,
  "title" | "href" | "icon" | "implemented" | "color"
>;

interface SubcategoryCategoryCardProps {
  category: SubcategoryCardData;
  /** Text for the action button; defaults to "View Portfolio" */
  actionLabel?: string;
}

/**
 * Reusable card component for investment subcategories.
 * Displays category info, example tags, and either an action button or "Coming Soon".
 */
export function SubcategoryCategoryCard({
  category,
  actionLabel,
}: SubcategoryCategoryCardProps) {
  const t = useTranslations("categories.card");
  const labels = useCategoryLabels();
  const Icon = category.icon;

  // Default to primary color if no color specified
  const iconBgColor = category.color
    ? `${category.color}20` // 20 = ~12% opacity in hex
    : category.implemented
      ? "rgb(var(--primary) / 0.1)"
      : undefined;

  return (
    <Card
      className={`relative overflow-hidden transition-all h-full flex flex-col ${
        category.implemented
          ? "hover:shadow-lg hover:border-primary cursor-pointer"
          : "opacity-60"
      }`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${!category.color && !category.implemented ? "bg-muted" : ""}`}
              style={iconBgColor ? { backgroundColor: iconBgColor } : undefined}
            >
              <Icon
                className={`h-6 w-6 ${category.color ? "text-foreground" : category.implemented ? "text-primary" : "text-muted-foreground"}`}
              />
            </div>
            <div>
              <CardTitle className="text-lg">
                {labels.name(category.title)}
              </CardTitle>
              {!category.implemented && (
                <span className="text-xs text-muted-foreground">
                  {t("comingSoon")}
                </span>
              )}
            </div>
          </div>
          {category.implemented && (
            <TrendingUp className="h-5 w-5 text-green-500" />
          )}
        </div>
        <CardDescription className="mt-2">
          {labels.description(category.title)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow">
        <div className="flex flex-wrap gap-2 mb-4">
          {labels.examples(category.title).map((example) => (
            <span
              key={example}
              className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
            >
              {example}
            </span>
          ))}
        </div>
        <div className="mt-auto">
          {category.implemented ? (
            <Button asChild className="w-full">
              <Link href={category.href}>
                {actionLabel ?? t("viewPortfolio")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button disabled className="w-full" variant="outline">
              {t("comingSoonButton")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Cards a category page shows: the built ones, plus the planned ("Coming
 * soon") ones only while the plannedCategories flag is on (ENG-227).
 */
export function visibleCategoryCards(
  cards: readonly SubcategoryCardData[],
): SubcategoryCardData[] {
  return cards.filter(
    (card) => card.implemented || isFeatureEnabled("plannedCategories"),
  );
}

const GRID_COLUMNS = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
} as const;

/**
 * A titled grid of subcategory cards. Planned cards are left out (see
 * visibleCategoryCards) and the section disappears when nothing is left.
 */
export function SubcategoryCardSection({
  title,
  cards,
  actionLabel,
  columns = 3,
  className,
}: {
  title: string;
  cards: readonly SubcategoryCardData[];
  actionLabel?: string;
  columns?: keyof typeof GRID_COLUMNS;
  className?: string;
}) {
  const visible = visibleCategoryCards(cards);
  if (visible.length === 0) return null;
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className={cn("grid gap-6 md:grid-cols-2", GRID_COLUMNS[columns])}>
        {visible.map((category) => (
          <SubcategoryCategoryCard
            key={category.title}
            category={category}
            actionLabel={actionLabel}
          />
        ))}
      </div>
    </div>
  );
}
