"use client";

/**
 * ValuationBadge: how a position's price is known (ENG-239). A provider
 * price refreshed between syncs is "live"; a user's manual price or model
 * is marked so it is never taken for a market price. A price refreshed
 * only by its sync gets no badge.
 */

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/shadcn/badge";
import { cn } from "@/lib/utils";
import type { PositionValuationKind } from "@/convex/portfolio";

export function ValuationBadge({
  kind,
  className,
}: {
  kind: PositionValuationKind;
  className?: string;
}) {
  const t = useTranslations("categories.valuation");
  if (kind === "sync") return null;
  return (
    <Badge
      variant={kind === "live" ? "secondary" : "outline"}
      className={cn("px-1.5 py-0 text-[10px] font-normal", className)}
      title={t(`badgeHints.${kind}`)}
    >
      {t(`badges.${kind}`)}
    </Badge>
  );
}
