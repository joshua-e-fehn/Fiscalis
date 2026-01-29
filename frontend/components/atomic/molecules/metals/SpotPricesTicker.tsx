"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MetalsType,
  MetalsCurrency,
  MetalsPrices,
} from "@/lib/types/metals-extended";
import { AnimatedNumber, PriceDisplay } from "@/components/atomic/atoms/metals";
import { getSpotPrice } from "@/hooks/metals";
import { RefreshCw, Clock } from "lucide-react";

// Simple relative time formatter
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

interface SpotPricesTickerProps {
  prices: MetalsPrices | undefined;
  currency?: MetalsCurrency;
  isLoading?: boolean;
  lastUpdated?: string;
  onRefresh?: () => void;
  className?: string;
}

const metalLabels: Record<MetalsType, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
};

export function SpotPricesTicker({
  prices,
  currency = "eur",
  isLoading = false,
  lastUpdated,
  onRefresh,
  className,
}: SpotPricesTickerProps) {
  const metals: MetalsType[] = ["gold", "silver", "platinum", "palladium"];

  const formattedLastUpdated = lastUpdated
    ? formatRelativeTime(new Date(lastUpdated))
    : null;

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-6", className)}>
        {metals.map((metal) => (
          <div key={metal} className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {metalLabels[metal]}:
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
          Live Spot Prices
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {formattedLastUpdated && (
            <>
              <Clock className="h-3 w-3" />
              <span>Updated {formattedLastUpdated}</span>
            </>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="Refresh prices"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metals.map((metal) => {
          const spotPrice = prices
            ? getSpotPrice(prices, metal, currency)
            : null;

          const formatCurrency = (value: number) =>
            new Intl.NumberFormat("de-CH", {
              style: "currency",
              currency: currency.toUpperCase(),
              minimumFractionDigits: 2,
            }).format(value);

          return (
            <div
              key={metal}
              className="flex flex-col p-2 rounded-lg bg-muted/50"
            >
              <span className="text-xs text-muted-foreground">
                {metalLabels[metal]}
              </span>
              <div className="flex items-baseline gap-1">
                {spotPrice !== null ? (
                  <>
                    <AnimatedNumber
                      value={spotPrice}
                      formatFn={formatCurrency}
                      className="text-base font-semibold"
                      duration={400}
                    />
                    <span className="text-xs text-muted-foreground">/oz</span>
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
  prices,
  currency = "eur",
  className,
}: {
  prices: MetalsPrices | undefined;
  currency?: MetalsCurrency;
  className?: string;
}) {
  const metals: MetalsType[] = ["gold", "silver", "platinum", "palladium"];

  return (
    <div className={cn("flex items-center gap-4 flex-wrap text-sm", className)}>
      {metals.map((metal) => {
        const spotPrice = prices ? getSpotPrice(prices, metal, currency) : null;

        return (
          <div key={metal} className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{metalLabels[metal]}:</span>
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
