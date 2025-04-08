import { useQuery, useQueries } from "@tanstack/react-query";

import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";
import { TimeRange, TimeInterval } from "@/../services/finance/financeService";

import * as metalsApi from "@/lib/api/metals";

// Query keys
export const metalKeys = {
  all: ["metals"] as const,
  prices: (metal: MetalType) => [...metalKeys.all, metal, "prices"] as const,
  latest: (metal: MetalType, currency: MetalCurrency) =>
    [...metalKeys.prices(metal), "latest", currency] as const,
  historical: (
    metal: MetalType,
    timeRange: TimeRange,
    currency: MetalCurrency
  ) => [...metalKeys.prices(metal), "historical", timeRange, currency] as const,
  range: (
    metal: MetalType,
    startDate: string,
    endDate: string,
    aggregationInterval: TimeInterval,
    currency: MetalCurrency
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

/**
 * Hook to fetch historical metal prices based on a predefined time range
 */
export function useMetalPrices(
  metal: MetalType,
  timeRange: TimeRange,
  currency: MetalCurrency
) {
  return useQuery<MetalChartData[]>({
    queryKey: metalKeys.historical(metal, timeRange, currency),
    queryFn: () =>
      metalsApi.getMetalPricesHistorical(metal, timeRange, currency),
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
 */
export function useMetalPricesRange(
  metal: MetalType,
  startDate: Date,
  endDate: Date,
  aggregationInterval: TimeInterval,
  currency: MetalCurrency,
  enabled = true
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
      currency
    ),
    queryFn: () =>
      metalsApi.getMetalPricesRange(
        metal,
        startDate,
        endDate,
        aggregationInterval,
        currency
      ),
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
  currency: MetalCurrency = "usd"
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
  currency: MetalCurrency = "usd"
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
