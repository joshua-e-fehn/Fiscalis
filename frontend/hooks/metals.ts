import { useQuery, useQueries } from "@tanstack/react-query";

import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";
import {
  AllMetalPrices,
  GoldExtendedPrices,
  MetalsPrices,
  MetalsType,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import {
  type TimeRange,
  type PriceHistoryWindow,
  getTimeRangeStartTimestamp,
  priceHistoryWindow,
  sliceFrom,
} from "@/../services/finance/financeService";
import type { PricePoint } from "@/lib/performance";
import { interpolateMissingData } from "@/lib/utils/interpolate";

import * as metalsApi from "@/lib/api/metals";

// ═══════════════════════════════════════════════════════════════
// Query Keys
// ═══════════════════════════════════════════════════════════════

// Query keys for historical/latest prices (from finance service)
export const metalKeys = {
  all: ["metals"] as const,
  prices: (metal: MetalType) => [...metalKeys.all, metal, "prices"] as const,
  latest: (metal: MetalType, currency: MetalCurrency) =>
    [...metalKeys.prices(metal), "latest", currency] as const,
  historical: (
    metal: MetalType,
    timeRange: TimeRange,
    currency: MetalCurrency,
  ) => [...metalKeys.prices(metal), "historical", timeRange, currency] as const,
  history: (
    metal: MetalType,
    currency: MetalCurrency,
    window: PriceHistoryWindow,
  ) =>
    [
      ...metalKeys.prices(metal),
      "history",
      currency,
      window.interval,
      window.from,
    ] as const,
};

// Query keys for Supabase prices (all metals + extended)
export const metalsPriceKeys = {
  all: ["metals", "prices"] as const,
  allLatest: () => [...metalsPriceKeys.all, "all", "latest"] as const,
  goldExtended: () => [...metalsPriceKeys.all, "gold", "extended"] as const,
};

// ═══════════════════════════════════════════════════════════════
// Historical Price Hooks (Finance Service)
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to fetch historical metal prices based on a predefined time range
 * Automatically interpolates missing/zero data points
 */
export function useMetalPrices(
  metal: MetalType,
  timeRange: TimeRange,
  currency: MetalCurrency,
) {
  return useQuery<MetalChartData[]>({
    queryKey: metalKeys.historical(metal, timeRange, currency),
    queryFn: async () => {
      const data = await metalsApi.getMetalPricesHistorical(
        metal,
        timeRange,
        currency,
      );
      // Interpolate missing/zero values
      return interpolateMissingData(data);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: timeRange === "Hour" ? 1000 * 60 : 1000 * 60 * 5, // 1 minute or 5 minutes
  });
}

/**
 * Hook to fetch the latest metal price data
 */
export function useMetalPriceLatest(metal: MetalType, currency: MetalCurrency) {
  return useQuery<MetalChartData>({
    queryKey: metalKeys.latest(metal, currency),
    queryFn: () => metalsApi.getMetalPriceLatest(metal, currency),
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 1000 * 60, // Refresh every minute
  });
}

/**
 * A metal's closes for a range, as price points (no gap filling: the
 * performance strategies bridge gaps themselves).
 *
 * Every range with the same interval shares one fetch per metal and
 * currency (priceHistoryWindow: the widest of those ranges, stable for the
 * day), and each caller slices it to its own range start less `lookbackMs`.
 */
export function useMetalPriceHistory(
  metal: MetalType,
  timeRange: TimeRange,
  currency: MetalCurrency,
  options: { lookbackMs?: number; enabled?: boolean } = {},
) {
  const { lookbackMs = 0, enabled = true } = options;
  const window = priceHistoryWindow(timeRange);

  return useQuery({
    queryKey: metalKeys.history(metal, currency, window),
    queryFn: async (): Promise<PricePoint[]> => {
      const data = await metalsApi.getMetalPricesRange(
        metal,
        new Date(window.from),
        new Date(),
        window.interval,
        currency,
      );
      // A missing close comes back as null or 0: it is a gap, not a price
      return data.flatMap((p) =>
        p.date !== null && p.price !== null && p.price > 0
          ? [{ timestamp: new Date(p.date).getTime(), price: p.price }]
          : [],
      );
    },
    select: (points) =>
      sliceFrom(points, getTimeRangeStartTimestamp(timeRange) - lookbackMs),
    staleTime: 1000 * 60 * 15, // 15 minutes (historical data changes less frequently)
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    enabled,
  });
}

/**
 * Helper hook to fetch both latest price and historical data for a metal
 */
export function useMetalComplete(
  metal: MetalType,
  timeRange: TimeRange = "Day",
  currency: MetalCurrency = "usd",
) {
  const latestPrice = useMetalPriceLatest(metal, currency);
  const historicalPrices = useMetalPrices(metal, timeRange, currency);

  return {
    latest: latestPrice.data,
    historical: historicalPrices.data,
    isLoading: latestPrice.isLoading || historicalPrices.isLoading,
    isError: latestPrice.isError || historicalPrices.isError,
    error: latestPrice.error || historicalPrices.error,
    refetch: () => {
      latestPrice.refetch();
      historicalPrices.refetch();
    },
  };
}

/**
 * Hook to get the latest prices for multiple metals at once
 */
export function useMultipleMetalPrices(
  metals: MetalType[],
  currency: MetalCurrency = "usd",
) {
  // Create individual queries for each metal
  const queries = metals.map((metal) => ({
    queryKey: metalKeys.latest(metal, currency),
    queryFn: () => metalsApi.getMetalPriceLatest(metal, currency),
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60, // Refresh every minute
  }));

  // Return the results in an object keyed by metal type
  return useQueries({ queries });
}

// ═══════════════════════════════════════════════════════════════
// All Metals Price Hooks (Supabase)
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to fetch all metal prices from Supabase
 * Endpoint: GET /api/metals/prices/all/latest
 *
 * Returns all 4 metals (gold, silver, platinum, palladium)
 * in EUR/USD/CHF with exchange rates.
 *
 * Auto-refreshes every 60 seconds.
 */
export function useAllMetalPrices() {
  return useQuery<AllMetalPrices>({
    queryKey: metalsPriceKeys.allLatest(),
    queryFn: metalsApi.getAllMetalPricesLatest,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
  });
}

/**
 * Hook to fetch gold extended prices (gram, kilo, purity)
 * Endpoint: GET /api/metals/gold/prices/extended
 *
 * Auto-refreshes every 60 seconds.
 */
export function useGoldExtendedPrices() {
  return useQuery<GoldExtendedPrices>({
    queryKey: metalsPriceKeys.goldExtended(),
    queryFn: metalsApi.getGoldExtendedPrices,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
  });
}

/**
 * Combined hook - fetches all metals + gold extended in parallel
 *
 * Use this when you need the full metals pricing data.
 */
export function useMetalsPrices(): {
  data: MetalsPrices | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const allMetals = useAllMetalPrices();
  const goldExtended = useGoldExtendedPrices();

  const isLoading = allMetals.isLoading || goldExtended.isLoading;
  const isError = allMetals.isError || goldExtended.isError;

  const data: MetalsPrices | undefined =
    allMetals.data && goldExtended.data
      ? {
          all: allMetals.data,
          goldExtended: goldExtended.data,
        }
      : allMetals.data
        ? {
            all: allMetals.data,
            goldExtended: null,
          }
        : undefined;

  return {
    data,
    isLoading,
    isError,
    error: allMetals.error || goldExtended.error || null,
    refetch: () => {
      allMetals.refetch();
      goldExtended.refetch();
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Price Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get spot price per troy ounce for a metal in specified currency
 */
export function getSpotPrice(
  prices: MetalsPrices | undefined,
  metalType: MetalsType,
  currency: MetalsCurrency,
): number | null {
  if (!prices?.all) return null;

  const metalPrices = prices.all[metalType];
  const price = metalPrices[currency];

  return price ?? null;
}

/**
 * Get gold purity price per gram for specified purity and currency
 */
export function getGoldPurityPrice(
  prices: MetalsPrices | undefined,
  purity: 333 | 585 | 750 | 833 | 900 | 916 | 999,
  currency: MetalsCurrency,
): number | null {
  if (!prices?.goldExtended) return null;

  return prices.goldExtended.purity[currency][purity] ?? null;
}
