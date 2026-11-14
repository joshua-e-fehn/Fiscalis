"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface PriceUpdateIndicatorProps {
  isUpdating?: boolean;
  lastUpdated?: Date | number | null;
  className?: string;
}

/**
 * Shows real-time price update status with timestamp
 */
export function PriceUpdateIndicator({
  isUpdating = false,
  lastUpdated,
  className,
}: PriceUpdateIndicatorProps) {
  const t = useTranslations("metals.holdings.priceUpdate");
  const format = useFormatter();
  // Re-render every second so "5 seconds ago" keeps counting
  const now = useNow({ updateInterval: 1000 });

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {isUpdating ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>{t("updating")}</span>
        </>
      ) : lastUpdated ? (
        <span>
          {t("updated", { when: format.relativeTime(lastUpdated, now) })}
        </span>
      ) : null}
    </div>
  );
}
