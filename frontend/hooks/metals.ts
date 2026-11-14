import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
import type { InvestmentCurrency } from "@/lib/types/investments";
import {
  fromEur,
  quotesInCurrency,
} from "@/../services/finance/displayCurrency";
import {
  useDisplayCurrency,
  useDisplayRateHistory,
} from "@/hooks/convex/displayCurrency";

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
 * Market quotes in `currency`: the price store's own column for EUR, USD
 * and CHF; another display currency (GBP) from the EUR quotes, at the
 * daily rates from `sinceMs` (rateOn) or the latest rate. Only the display
 * currency can be derived; another one has no data.
 */
function useQuoteConversion(
  currency: InvestmentCurrency,
  sinceMs: number | undefined,
) {
  const quoted = isQuoteCurrency(currency);
  const fetched: MetalCurrency = quoted ? currency : "eur";
  const display = useDisplayCurrency();
  const rates = useDisplayRateHistory(quoted ? undefined : sinceMs);
  const convertible = quoted || display.currency === currency;
  const ratesLoading = !quoted && (display.isLoading || rates.isLoading);
  return {
    quoted,
    fetched,
    convertible,
    ratesLoading,
    rateOn: rates.rateOn,
    unitsPerEur: display.unitsPerEur,
  };
}

/**
 * Hook to fetch historical metal prices based on a predefined time range,
 * for the price charts. Missing closes stay gaps (null or 0); PriceChart
 * breaks the line there. A display currency without its own quote column
 * (GBP) is derived from the EUR closes at each day's rate.
 */
export function useMetalPrices(
  metal: MetalType,
  timeRange: TimeRange,
  currency: InvestmentCurrency,
): { data: MetalChartData[] | undefined; isLoading: boolean } {
  // Rate history from a start that is stable for the day
  const conversion = useQuoteConversion(
    currency,
    priceHistoryWindow(timeRange).from,
  );
  const { quoted, fetched, convertible, ratesLoading, rateOn, unitsPerEur } =
    conversion;
  const query = useQuery<MetalChartData[]>({
    queryKey: metalKeys.historical(metal, timeRange, fetched),
    queryFn: () =>
      metalsApi.getMetalPricesHistorical(metal, timeRange, fetched),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: timeRange === "Hour" ? 1000 * 60 : 1000 * 60 * 5, // 1 minute or 5 minutes
  });

  const raw = query.data;
  const data = useMemo(() => {
    if (raw === undefined || quoted) return raw;
    if (ratesLoading) return undefined;
    if (!convertible) return [];
    return quotesInCurrency(raw, rateOn, unitsPerEur);
  }, [raw, quoted, ratesLoading, convertible, rateOn, unitsPerEur]);

  return { data, isLoading: query.isLoading || ratesLoading };
}

/**
 * Hook to fetch the latest metal price data, in `currency`: the quote
 * column, or (GBP) the EUR quote at the latest display rate.
 */
export function useMetalPriceLatest(
  metal: MetalType,
  currency: InvestmentCurrency,
): { data: MetalChartData | undefined; isLoading: boolean } {
  const { quoted, fetched, convertible, ratesLoading, unitsPerEur } =
    useQuoteConversion(currency, undefined);
  const query = useQuery<MetalChartData>({
    queryKey: metalKeys.latest(metal, fetched),
    queryFn: () => metalsApi.getMetalPriceLatest(metal, fetched),
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 1000 * 60, // Refresh every minute
  });

  const raw = query.data;
  const data = useMemo(() => {
    if (raw === undefined || quoted) return raw;
    if (ratesLoading || !convertible) return undefined;
    return quotesInCurrency([raw], () => unitsPerEur, unitsPerEur)[0];
  }, [raw, quoted, ratesLoading, convertible, unitsPerEur]);

  return { data, isLoading: query.isLoading || ratesLoading };
}

/** Currencies the price store quotes metals in (its EUR/USD/CHF columns) */
const QUOTE_CURRENCIES: readonly MetalCurrency[] = ["eur", "usd", "chf"];

/** A currency the price store has its own column for. */
export function isQuoteCurrency(currency: string): currency is MetalCurrency {
  return (QUOTE_CURRENCIES as readonly string[]).includes(currency);
}

export interface MetalPriceHistory {
  /** Closes in the asked currency, ascending; undefined while loading */
  data: PricePoint[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /**
   * Derived closes taken at the latest rate (no daily history), or none
   * at all (a currency other than the display currency): flag the result
   */
  partial: boolean;
}

/**
 * A metal's closes for a range, as price points (no gap filling: the
 * performance strategies bridge gaps themselves).
 *
 * Every range with the same interval shares one fetch per metal and
 * currency (priceHistoryWindow: the widest of those ranges, stable for the
 * day), and each caller slices it to its own range start less `lookbackMs`.
 *
 * EUR, USD and CHF are the price store's own columns. Another display
 * currency (GBP) is derived from the EUR closes, each at its own day's
 * rate (useDisplayRateHistory), so it is only available as the display
 * currency.
 */
export function useMetalPriceHistory(
  metal: MetalType,
  timeRange: TimeRange,
  currency: InvestmentCurrency,
  options: { lookbackMs?: number; enabled?: boolean } = {},
): MetalPriceHistory {
  const { lookbackMs = 0, enabled = true } = options;
  const window = priceHistoryWindow(timeRange);
  const quoted = isQuoteCurrency(currency);
  const fetched: MetalCurrency = quoted ? currency : "eur";

  const display = useDisplayCurrency();
  const rates = useDisplayRateHistory(quoted ? undefined : window.from);
  // Display rates convert into the display currency only
  const convertible = quoted || display.currency === currency;

  const query = useQuery({
    queryKey: metalKeys.history(metal, fetched, window),
    queryFn: async (): Promise<PricePoint[]> => {
      const data = await metalsApi.getMetalPricesRange(
        metal,
        new Date(window.from),
        new Date(),
        window.interval,
        fetched,
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

  const ratesLoading = !quoted && (display.isLoading || rates.isLoading);
  const isLoading = query.isLoading || (enabled && ratesLoading);
  const raw = query.data;
  const rateOn = rates.rateOn;
  const data = useMemo(() => {
    if (raw === undefined || quoted) return raw;
    if (ratesLoading) return undefined;
    if (!convertible) return [];
    return raw.map((p) => ({
      timestamp: p.timestamp,
      price: fromEur(p.price, rateOn(p.timestamp)),
    }));
  }, [raw, quoted, ratesLoading, convertible, rateOn]);

  return {
    data,
    isLoading,
    isError: query.isError,
    partial: !quoted && (rates.partial || !convertible),
  };
}

/**
 * Spot per troy ounce in a display currency: the price store's own column
 * for EUR, USD and CHF, else the EUR spot at `unitsPerEur` (the latest
 * display rate, useDisplayCurrency).
 */
export function getDisplaySpotPrice(
  prices: MetalsPrices | undefined,
  metalType: MetalsType,
  currency: InvestmentCurrency,
  unitsPerEur: number,
): number | null {
  if (isQuoteCurrency(currency)) return getSpotPrice(prices, metalType, currency);
  const eur = getSpotPrice(prices, metalType, "eur");
  return eur === null ? null : fromEur(eur, unitsPerEur);
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
