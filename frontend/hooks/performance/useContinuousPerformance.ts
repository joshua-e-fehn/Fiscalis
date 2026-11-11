/**
 * Continuous (price-based) performance input for the vault.
 *
 * Loads what the continuous strategy values the vault from: the vault items
 * as holdings, each held metal's price history and the live spot. It does
 * not calculate; useCategoryPerformance runs the strategy.
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import type {
  TimeRange,
  HoldingData,
  PriceData,
  PricePoint,
  ContinuousPerformanceInput,
} from "@/lib/performance";
import {
  MS,
  getDefaultIntervalForRange,
  getTimeRangeStartTimestamp,
} from "@/../services/finance/financeService";
import { resolvePremiums } from "@/../services/finance/metals";

import { getSpotPrice, useMetalPricesRange, useMetalsPrices } from "@/hooks/metals";
import type { MetalCurrency, MetalType } from "@/lib/types/metals";
import type { MetalsCurrency, MetalsType } from "@/lib/types/metals-extended";

/** Prices are fetched from this long before the range start, so the start
 * takes the last close at or before it (31 Dec for YTD), not a later one. */
const PRICE_LOOKBACK_MS = 7 * MS.DAY;

const METALS: MetalsType[] = ["gold", "silver", "platinum", "palladium"];

export interface UseVaultPerformanceInputOptions {
  timeRange: TimeRange;
  /** Currency for price data (default: "eur") */
  currency?: MetalsCurrency;
  enabled?: boolean;
}

export interface VaultPerformanceInput {
  /** Undefined while loading or when the vault is empty */
  input: ContinuousPerformanceInput | undefined;
  isLoading: boolean;
}

export function useVaultPerformanceInput(
  options: UseVaultPerformanceInputOptions,
): VaultPerformanceInput {
  const { timeRange, currency = "eur", enabled = true } = options;
  const { userId } = useAuth();

  // Fixed per range so query keys do not churn
  const { startDate, endDate, interval } = useMemo(() => {
    const now = Date.now();
    return {
      startDate: new Date(getTimeRangeStartTimestamp(timeRange, now) - PRICE_LOOKBACK_MS),
      endDate: new Date(now),
      interval: getDefaultIntervalForRange(timeRange),
    };
  }, [timeRange]);

  const vaultItems = useQuery(
    api.vault.getUserVaultItems,
    enabled && userId ? {} : "skip",
  );
  const held = useMemo(
    () => new Set((vaultItems ?? []).map((i) => i.metalType as MetalsType)),
    [vaultItems],
  );

  // One query per metal (fixed hook order); disabled for metals not held
  const args = [startDate, endDate, interval, currency as MetalCurrency] as const;
  const series: Record<MetalsType, ReturnType<typeof useMetalPricesRange>> = {
    gold: useMetalPricesRange("gold" as MetalType, ...args, enabled && held.has("gold")),
    silver: useMetalPricesRange("silver" as MetalType, ...args, enabled && held.has("silver")),
    platinum: useMetalPricesRange("platinum" as MetalType, ...args, enabled && held.has("platinum")),
    palladium: useMetalPricesRange("palladium" as MetalType, ...args, enabled && held.has("palladium")),
  };
  const live = useMetalsPrices();

  // A disabled (or signed-out) input is not loading: it is absent
  const isLoading =
    enabled &&
    !!userId &&
    (vaultItems === undefined ||
      live.isLoading ||
      METALS.some((m) => held.has(m) && series[m].isLoading));

  const goldData = series.gold.data;
  const silverData = series.silver.data;
  const platinumData = series.platinum.data;
  const palladiumData = series.palladium.data;

  const input = useMemo<ContinuousPerformanceInput | undefined>(() => {
    if (!vaultItems || vaultItems.length === 0) return undefined;

    const holdings: HoldingData[] = vaultItems.map((item) => ({
      id: item._id,
      assetType: item.metalType,
      quantity: item.quantity,
      fineWeightGrams: item.fineWeightGrams,
      sellPremium: resolvePremiums({ sell: [item.sellPremium] }).sellPremium,
      // No date: held since before the range (never the record's creation)
      purchaseDate: item.purchaseDate
        ? new Date(item.purchaseDate).getTime()
        : undefined,
      purchasePricePerUnit: item.purchasePricePerUnit ?? undefined,
      // Stored items without one were entered in EUR (vault.ts default)
      purchaseCurrency: item.purchaseCurrency ?? "EUR",
    }));

    // Per-ounce closes; the client's gap-filled points are dropped so the
    // strategy's own lookup decides how gaps are bridged. A metal whose
    // fetch failed has no series, and the strategy flags the result partial.
    const data = { gold: goldData, silver: silverData, platinum: platinumData, palladium: palladiumData };
    const prices: PriceData = {};
    const livePrices: Partial<Record<string, PricePoint>> = {};
    const liveTs = live.data?.all?.timestamp ? Date.parse(live.data.all.timestamp) : null;
    for (const metal of METALS) {
      if (!held.has(metal)) continue;
      const points = (data[metal] ?? []).filter(
        (p) => p.price !== null && p.date !== null && !p.isInterpolated,
      );
      if (points.length > 0) {
        prices[metal] = points.map((p) => ({
          timestamp: new Date(p.date!).getTime(),
          price: p.price!,
        }));
      }
      const spot = getSpotPrice(live.data, metal, currency);
      if (spot !== null && liveTs !== null) {
        livePrices[metal] = { timestamp: liveTs, price: spot };
      }
    }

    return { holdings, prices, livePrices, currency };
  }, [vaultItems, held, goldData, silverData, platinumData, palladiumData, live.data, currency]);

  return { input, isLoading };
}
