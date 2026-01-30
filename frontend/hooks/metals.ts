import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";
import {
  AllMetalPrices,
  GoldExtendedPrices,
  MetalsPrices,
  MetalsType,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { TimeRange, TimeInterval } from "@/../services/finance/financeService";
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
  range: (
    metal: MetalType,
    startDate: string,
    endDate: string,
    aggregationInterval: TimeInterval,
    currency: MetalCurrency,
  ) =>
    [
      ...metalKeys.prices(metal),
      "range",
      startDate,
      endDate,
      aggregationInterval,
      currency,
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
 * Hook to fetch metal prices for a custom date range with specified aggregation
 * Automatically interpolates missing/zero data points
 */
export function useMetalPricesRange(
  metal: MetalType,
  startDate: Date,
  endDate: Date,
  aggregationInterval: TimeInterval,
  currency: MetalCurrency,
  enabled = true,
) {
  // Format dates for query key to ensure stable keys
  const formattedStartDate = startDate.toISOString().split("T")[0];
  const formattedEndDate = endDate.toISOString().split("T")[0];

  return useQuery<MetalChartData[]>({
    queryKey: metalKeys.range(
      metal,
      formattedStartDate,
      formattedEndDate,
      aggregationInterval,
      currency,
    ),
    queryFn: async () => {
      const data = await metalsApi.getMetalPricesRange(
        metal,
        startDate,
        endDate,
        aggregationInterval,
        currency,
      );
      // Interpolate missing/zero values
      return interpolateMissingData(data);
    },
    staleTime: 1000 * 60 * 15, // 15 minutes (historical data changes less frequently)
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    enabled, // Allow disabling the query when needed
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

// ═══════════════════════════════════════════════════════════════
// YTD Portfolio Performance Hook
// ═══════════════════════════════════════════════════════════════

import { calculateSellPrice } from "@/convex/lib/priceCalculations";
import { MetalItemWithValuation } from "@/lib/types/metals-extended";

interface YTDPerformanceResult {
  ytdProfitLoss: number | null;
  ytdProfitLossPercent: number | null;
  valueAtStartOfYear: number | null;
  isLoading: boolean;
}

/**
 * Hook to calculate YTD portfolio performance
 *
 * This fetches historical prices for Jan 1st of the current year for each metal type
 * and calculates the portfolio value at that date using each item's fine weight and sell premium.
 *
 * YTD = (current portfolio value - portfolio value at Jan 1) / portfolio value at Jan 1
 */
export function useYTDPortfolioPerformance(
  items: MetalItemWithValuation[] | undefined,
  currentPortfolioValue: number,
  currency: MetalsCurrency = "eur",
): YTDPerformanceResult {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
  const dayAfterStartOfYear = new Date(Date.UTC(currentYear, 0, 2, 0, 0, 0, 0));

  // Fetch historical prices for each metal type at start of year
  const goldPrices = useMetalPricesRange(
    "gold",
    startOfYear,
    dayAfterStartOfYear,
    "day",
    currency as MetalCurrency,
    !!items && items.length > 0,
  );

  const silverPrices = useMetalPricesRange(
    "silver",
    startOfYear,
    dayAfterStartOfYear,
    "day",
    currency as MetalCurrency,
    !!items && items.some((i) => i.metalType === "silver"),
  );

  const platinumPrices = useMetalPricesRange(
    "platinum",
    startOfYear,
    dayAfterStartOfYear,
    "day",
    currency as MetalCurrency,
    !!items && items.some((i) => i.metalType === "platinum"),
  );

  const palladiumPrices = useMetalPricesRange(
    "palladium",
    startOfYear,
    dayAfterStartOfYear,
    "day",
    currency as MetalCurrency,
    !!items && items.some((i) => i.metalType === "palladium"),
  );

  const isLoading =
    goldPrices.isLoading ||
    silverPrices.isLoading ||
    platinumPrices.isLoading ||
    palladiumPrices.isLoading;

  // Calculate portfolio value at start of year
  const valueAtStartOfYear = useMemo(() => {
    if (!items || items.length === 0 || isLoading) {
      return null;
    }

    // Get spot prices at start of year for each metal
    const startOfYearPrices: Record<MetalsType, number | null> = {
      gold: goldPrices.data?.[0]?.price ?? null,
      silver: silverPrices.data?.[0]?.price ?? null,
      platinum: platinumPrices.data?.[0]?.price ?? null,
      palladium: palladiumPrices.data?.[0]?.price ?? null,
    };

    // Filter items that existed at the start of the year
    // (purchased before Jan 1 of current year)
    const startOfYearTimestamp = startOfYear.getTime();
    const itemsAtStartOfYear = items.filter((item) => {
      // Use createdAt as proxy for purchase date if purchaseDate not available
      const itemDate = item.purchaseDate
        ? new Date(item.purchaseDate).getTime()
        : item.createdAt;
      return itemDate < startOfYearTimestamp;
    });

    if (itemsAtStartOfYear.length === 0) {
      return null;
    }

    // Calculate total value at start of year using historical prices + item premiums
    let totalValue = 0;
    for (const item of itemsAtStartOfYear) {
      const spotPrice = startOfYearPrices[item.metalType];
      if (spotPrice === null) continue;

      // Calculate what this item would have been worth at Jan 1 using its sell premium
      const itemValueAtStartOfYear = calculateSellPrice(
        spotPrice,
        item.fineWeightGrams,
        item.sellPremium,
        item.quantity,
      );
      totalValue += itemValueAtStartOfYear;
    }

    return totalValue > 0 ? totalValue : null;
  }, [
    items,
    isLoading,
    goldPrices.data,
    silverPrices.data,
    platinumPrices.data,
    palladiumPrices.data,
    startOfYear,
  ]);

  // Calculate YTD performance
  const ytdProfitLoss =
    valueAtStartOfYear !== null && currentPortfolioValue > 0
      ? currentPortfolioValue - valueAtStartOfYear
      : null;

  const ytdProfitLossPercent =
    valueAtStartOfYear !== null &&
    valueAtStartOfYear > 0 &&
    ytdProfitLoss !== null
      ? (ytdProfitLoss / valueAtStartOfYear) * 100
      : null;

  return {
    ytdProfitLoss,
    ytdProfitLossPercent,
    valueAtStartOfYear,
    isLoading,
  };
}

// ═══════════════════════════════════════════════════════════════
// Portfolio Historical Values Hook
// ═══════════════════════════════════════════════════════════════

export type PortfolioTimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "All";

interface PortfolioHistoryPoint {
  timestamp: number;
  date: string;
  value: number;
  cost: number;
}

interface PortfolioHistoricalValuesResult {
  dataPoints: PortfolioHistoryPoint[];
  isLoading: boolean;
}

/**
 * Get date range and aggregation interval for a given time range
 */
function getDateRangeForTimeRange(
  timeRange: PortfolioTimeRange,
  earliestTransaction: Date | null,
): { startDate: Date; endDate: Date; interval: TimeInterval } {
  const endDate = new Date();
  let startDate: Date;
  let interval: TimeInterval;

  switch (timeRange) {
    case "1W":
      startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      interval = "hour";
      break;
    case "1M":
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      interval = "day";
      break;
    case "3M":
      startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      interval = "day";
      break;
    case "6M":
      startDate = new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000);
      interval = "day";
      break;
    case "1Y":
      startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      interval = "day";
      break;
    case "All":
    default:
      // Use earliest transaction date or 1 year ago, whichever is earlier
      startDate = earliestTransaction
        ? new Date(
            Math.min(
              earliestTransaction.getTime(),
              endDate.getTime() - 365 * 24 * 60 * 60 * 1000,
            ),
          )
        : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      interval = "day";
      break;
  }

  return { startDate, endDate, interval };
}

/**
 * Hook to calculate portfolio historical values for the performance chart
 *
 * This calculates the theoretical sell value of all holdings at each point in time:
 * - Fetches historical prices for each metal type
 * - Tracks quantity held at each date based on transactions
 * - Calculates: holdings_at_date × historical_price_at_date
 */
export function usePortfolioHistoricalValues(
  items: MetalItemWithValuation[] | undefined,
  transactions:
    | Array<{
        transactionDate: string;
        transactionType: string;
        quantity: number;
        pricePerUnit: number;
        vaultItemId?: string;
      }>
    | undefined,
  currentPortfolioValue: number,
  totalCost: number | null,
  timeRange: PortfolioTimeRange = "3M",
  currency: MetalsCurrency = "eur",
): PortfolioHistoricalValuesResult {
  // Find earliest transaction date
  const earliestTransaction = useMemo(() => {
    if (!transactions || transactions.length === 0) return null;
    const sorted = [...transactions].sort(
      (a, b) =>
        new Date(a.transactionDate).getTime() -
        new Date(b.transactionDate).getTime(),
    );
    return new Date(sorted[0].transactionDate);
  }, [transactions]);

  // Get date range for the selected time range
  const { startDate, endDate, interval } = useMemo(
    () => getDateRangeForTimeRange(timeRange, earliestTransaction),
    [timeRange, earliestTransaction],
  );

  // Fetch historical prices for each metal
  const hasItems = !!items && items.length > 0;

  const goldPrices = useMetalPricesRange(
    "gold",
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    hasItems && items.some((i) => i.metalType === "gold"),
  );

  const silverPrices = useMetalPricesRange(
    "silver",
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    hasItems && items.some((i) => i.metalType === "silver"),
  );

  const platinumPrices = useMetalPricesRange(
    "platinum",
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    hasItems && items.some((i) => i.metalType === "platinum"),
  );

  const palladiumPrices = useMetalPricesRange(
    "palladium",
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    hasItems && items.some((i) => i.metalType === "palladium"),
  );

  const isLoading =
    goldPrices.isLoading ||
    silverPrices.isLoading ||
    platinumPrices.isLoading ||
    palladiumPrices.isLoading;

  // Calculate portfolio value at each historical price point
  const dataPoints = useMemo<PortfolioHistoryPoint[]>(() => {
    if (!items || items.length === 0 || isLoading) {
      return [];
    }

    // Build a map of historical prices by timestamp
    const pricesByTimestamp = new Map<
      number,
      Record<MetalsType, number | null>
    >();

    // Helper to safely convert date to timestamp
    // The API returns date as string (JSON serialization), not Date object
    const toTimestamp = (date: Date | string | null): number => {
      if (!date) return 0;
      if (typeof date === "string") return new Date(date).getTime();
      return date.getTime();
    };

    // Collect all unique timestamps from all metals
    const allPrices = [
      ...(goldPrices.data ?? []).map((p) => ({
        ...p,
        timestamp: toTimestamp(p.date),
        metal: "gold" as MetalsType,
      })),
      ...(silverPrices.data ?? []).map((p) => ({
        ...p,
        timestamp: toTimestamp(p.date),
        metal: "silver" as MetalsType,
      })),
      ...(platinumPrices.data ?? []).map((p) => ({
        ...p,
        timestamp: toTimestamp(p.date),
        metal: "platinum" as MetalsType,
      })),
      ...(palladiumPrices.data ?? []).map((p) => ({
        ...p,
        timestamp: toTimestamp(p.date),
        metal: "palladium" as MetalsType,
      })),
    ].filter((p) => p.timestamp > 0 && p.price !== null);

    // Get unique timestamps and initialize price map
    const uniqueTimestamps = new Set<number>();
    for (const pricePoint of allPrices) {
      uniqueTimestamps.add(pricePoint.timestamp);
    }

    // Initialize all timestamps with null prices
    for (const ts of uniqueTimestamps) {
      pricesByTimestamp.set(ts, {
        gold: null,
        silver: null,
        platinum: null,
        palladium: null,
      });
    }

    // Fill in prices from each metal's data
    for (const pricePoint of allPrices) {
      const existing = pricesByTimestamp.get(pricePoint.timestamp);
      if (existing) {
        existing[pricePoint.metal] = pricePoint.price;
      }
    }

    // Forward-fill missing prices (use last known price)
    const sortedTimestamps = Array.from(uniqueTimestamps).sort((a, b) => a - b);
    const lastKnownPrices: Record<MetalsType, number | null> = {
      gold: null,
      silver: null,
      platinum: null,
      palladium: null,
    };

    for (const ts of sortedTimestamps) {
      const prices = pricesByTimestamp.get(ts)!;
      for (const metal of [
        "gold",
        "silver",
        "platinum",
        "palladium",
      ] as const) {
        if (prices[metal] !== null) {
          lastKnownPrices[metal] = prices[metal];
        } else if (lastKnownPrices[metal] !== null) {
          prices[metal] = lastKnownPrices[metal];
        }
      }
    }

    // Build transaction history to track holdings over time
    // Group items by their id and track quantity changes
    const itemQuantityAtTime = new Map<
      string,
      Array<{ timestamp: number; quantity: number; costBasis: number }>
    >();

    // Initialize with current state
    for (const item of items) {
      const purchaseTimestamp = item.purchaseDate
        ? new Date(item.purchaseDate).getTime()
        : item.createdAt;
      const costBasis = (item.purchasePricePerUnit ?? 0) * item.quantity;

      itemQuantityAtTime.set(item._id, [
        {
          timestamp: purchaseTimestamp,
          quantity: item.quantity,
          costBasis,
        },
      ]);
    }

    // Calculate portfolio value at each timestamp
    const results: PortfolioHistoryPoint[] = [];

    for (const ts of sortedTimestamps) {
      const prices = pricesByTimestamp.get(ts)!;
      let portfolioValue = 0;
      let portfolioCost = 0;

      for (const item of items) {
        const spotPrice = prices[item.metalType];
        if (spotPrice === null) continue;

        // Check if item existed at this timestamp
        const purchaseTimestamp = item.purchaseDate
          ? new Date(item.purchaseDate).getTime()
          : item.createdAt;

        if (ts < purchaseTimestamp) {
          // Item didn't exist yet
          continue;
        }

        // Calculate sell value at this timestamp
        const itemValue = calculateSellPrice(
          spotPrice,
          item.fineWeightGrams,
          item.sellPremium,
          item.quantity,
        );
        portfolioValue += itemValue;

        // Track cost basis
        if (item.purchasePricePerUnit) {
          portfolioCost += item.purchasePricePerUnit * item.quantity;
        }
      }

      if (portfolioValue > 0) {
        results.push({
          timestamp: ts,
          date: new Date(ts).toLocaleDateString("de-DE"),
          value: portfolioValue,
          cost: portfolioCost > 0 ? portfolioCost : portfolioValue,
        });
      }
    }

    // Add current value as the last point if not already present
    const now = Date.now();
    const lastPoint = results[results.length - 1];
    if (!lastPoint || lastPoint.timestamp < now - 60 * 60 * 1000) {
      results.push({
        timestamp: now,
        date: new Date(now).toLocaleDateString("de-DE"),
        value: currentPortfolioValue,
        cost: totalCost ?? currentPortfolioValue,
      });
    }

    return results;
  }, [
    items,
    isLoading,
    goldPrices.data,
    silverPrices.data,
    platinumPrices.data,
    palladiumPrices.data,
    currentPortfolioValue,
    totalCost,
  ]);

  return {
    dataPoints,
    isLoading,
  };
}
