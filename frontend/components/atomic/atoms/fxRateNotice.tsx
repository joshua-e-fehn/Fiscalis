"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";

/** The rate's UTC day (YYYY-MM-DD) as a date in the app's format. */
function formatRateDate(day: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * Flags a degraded exchange rate behind the display-currency figures: a
 * stale market rate (older than a week) or the built-in fallback table.
 * Figures are converted anyway; this says how far to trust them. Renders
 * nothing for EUR, a live market rate or while loading.
 */
export function FxRateNotice() {
  const { code, source, rateDate, isLoading } = useDisplayCurrency();
  if (isLoading || (source !== "stale" && source !== "fallback")) return null;

  // Whole sentences, one per case, so they can be translated as units
  const stale = source === "stale" && rateDate !== null;
  const label = stale
    ? `Rates as of ${formatRateDate(rateDate)}`
    : "Approximate rate";
  const detail = stale
    ? `Amounts in ${code} use the exchange rate of ${formatRateDate(rateDate)}, the latest available.`
    : `No current exchange rate for ${code} is available, so amounts use an approximate rate.`;

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
