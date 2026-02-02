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

export interface SubcategoryCardData {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
  /** Optional color for the icon background (hex color) */
  color?: string;
}

interface SubcategoryCategoryCardProps {
  category: SubcategoryCardData;
  /** Text for the action button (e.g., "View Accounts", "View Holdings") */
  actionLabel?: string;
}

/**
 * Reusable card component for investment subcategories.
 * Displays category info, example tags, and either an action button or "Coming Soon".
 */
export function SubcategoryCategoryCard({
  category,
  actionLabel = "View Portfolio",
}: SubcategoryCategoryCardProps) {
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
      <CardContent className="flex flex-col flex-grow">
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
        <div className="mt-auto">
          {category.implemented ? (
            <Button asChild className="w-full">
              <Link href={category.href}>
                {actionLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button disabled className="w-full" variant="outline">
              Coming Soon
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
