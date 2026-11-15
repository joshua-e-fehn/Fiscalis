"use client";

import { AlertTriangle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";

/**
 * Flags a degraded exchange rate behind the display-currency figures: a
 * stale market rate (older than a week) or the built-in fallback table.
 * Figures are converted anyway; this says how far to trust them. Renders
 * nothing for EUR, a live market rate or while loading.
 */
export function FxRateNotice() {
  const t = useTranslations("common.fxNotice");
  const format = useFormatter();
  const { code, source, rateDate, isLoading } = useDisplayCurrency();
  if (isLoading || (source !== "stale" && source !== "fallback")) return null;

  // Whole sentences, one per case, so they translate as units. rateDate is
  // the rate's UTC day (YYYY-MM-DD), so it is formatted as a calendar date.
  const date =
    source === "stale" && rateDate !== null
      ? format.dateTime(new Date(`${rateDate}T00:00:00Z`), "dateOnly")
      : null;
  const label =
    date !== null ? t("staleLabel", { date }) : t("approximateLabel");
  const detail =
    date !== null
      ? t("staleDetail", { currency: code, date })
      : t("approximateDetail", { currency: code });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            tabIndex={0}
            className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
