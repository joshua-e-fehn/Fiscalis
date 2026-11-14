"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { MetalsType } from "@/lib/types/metals-extended";
import type { MetalsDisplayCurrency, SpotQuotes } from "@/lib/types/metals";
import { AnimatedNumber, PriceDisplay } from "@/components/atomic/atoms/metals";
import { RefreshCw, Clock } from "lucide-react";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const METALS: readonly MetalsType[] = [
  "gold",
  "silver",
  "platinum",
  "palladium",
];

interface SpotPricesTickerProps {
  /**
   * Quotes in `currency` (useMetals spotPrices): the price table's own
   * column for EUR/USD/CHF, the EUR quote at the latest rate otherwise
   */
  spotPrices: SpotQuotes | undefined;
  currency: MetalsDisplayCurrency;
  isLoading?: boolean;
  lastUpdated?: string;
  onRefresh?: () => void;
  className?: string;
}

export function SpotPricesTicker({
  spotPrices,
  currency,
  isLoading = false,
  lastUpdated,
  onRefresh,
  className,
}: SpotPricesTickerProps) {
  const t = useTranslations("metals");
  const format = useFormatter();
  const now = useNow({ updateInterval: MINUTE_MS });

  // "just now", "5 minutes ago", "3 hours ago", then the date
  const formattedLastUpdated = (() => {
    if (!lastUpdated) return null;
    const updated = new Date(lastUpdated);
    const elapsed = now.getTime() - updated.getTime();
    if (elapsed < MINUTE_MS) return t("performance.justNow");
    if (elapsed < DAY_MS) return format.relativeTime(updated, now);
    return format.dateTime(updated, "date");
  })();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-6", className)}>
        {METALS.map((metal) => (
          <div key={metal} className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("performance.metalLabel", { metal: t(`metal.${metal}`) })}
            </span>
            <div className="h-5 w-20 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t("performance.liveSpotPrices")}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {formattedLastUpdated && (
            <>
              <Clock className="h-3 w-3" />
              <span>
                {t("performance.updated", { when: formattedLastUpdated })}
              </span>
            </>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1 hover:bg-muted rounded transition-colors"
              title={t("performance.refreshPrices")}
              aria-label={t("performance.refreshPrices")}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {METALS.map((metal) => {
          const spotPrice = spotPrices?.[metal] ?? null;

          return (
            <div
              key={metal}
              className="flex flex-col p-2 rounded-lg bg-muted/50"
            >
              <span className="text-xs text-muted-foreground">
                {t(`metal.${metal}`)}
              </span>
              <div className="flex items-baseline gap-1">
                {spotPrice !== null ? (
                  <>
                    <AnimatedNumber
                      value={spotPrice}
                      formatFn={(value) => formatCurrency(value, currency)}
                      className="text-base font-semibold"
                      duration={400}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t("prices.perOz")}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">--</span>
                )}
              </div>
              {/* Placeholder for price change - would need historical data */}
              {/* <PercentageChange value={0.12} size="sm" /> */}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact single-line ticker
export function SpotPricesTickerCompact({
  spotPrices,
  currency,
  className,
}: {
  /** Quotes in `currency` (useMetals spotPrices) */
  spotPrices: SpotQuotes | undefined;
  currency: MetalsDisplayCurrency;
  className?: string;
}) {
  const t = useTranslations("metals");

  return (
    <div className={cn("flex items-center gap-4 flex-wrap text-sm", className)}>
      {METALS.map((metal) => {
        const spotPrice = spotPrices?.[metal] ?? null;

        return (
          <div key={metal} className="flex items-center gap-1.5">
            <span className="text-muted-foreground">
              {t("performance.metalLabel", { metal: t(`metal.${metal}`) })}
            </span>
            {spotPrice !== null ? (
              <PriceDisplay value={spotPrice} currency={currency} size="sm" />
            ) : (
              <span className="text-muted-foreground">--</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
