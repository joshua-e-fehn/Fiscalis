import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getWorldData,
  getIndicators,
  getIndicatorsGrouped,
  searchWorldBankIndicators,
  getDynamicWorldData,
} from "@/lib/api/worldbank";
import type {
  IndicatorId,
  IndicatorData,
  IndicatorMetadata,
  IndicatorCategory,
} from "@/lib/types/worldbank";
import type {
  SearchedIndicator,
  DynamicIndicatorData,
} from "@/lib/types/worldbank-search";

// Progress type for prefetch tracking
interface PrefetchProgress {
  loaded: number;
  total: number;
  isComplete: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Query Keys
// ═══════════════════════════════════════════════════════════════

export const worldDataKeys = {
  all: ["world-data"] as const,
  indicators: () => [...worldDataKeys.all, "indicators"] as const,
  indicatorsGrouped: () =>
    [...worldDataKeys.all, "indicators", "grouped"] as const,
  data: (indicator: IndicatorId) =>
    [...worldDataKeys.all, "data", indicator] as const,
  dataYear: (indicator: IndicatorId, year: number) =>
    [...worldDataKeys.data(indicator), year] as const,
  comparison: (indicator: IndicatorId, years: number[]) =>
    [...worldDataKeys.all, "comparison", indicator, years.join("-")] as const,
  // Dynamic indicator keys (for any World Bank indicator)
  search: (query: string) => [...worldDataKeys.all, "search", query] as const,
  dynamicData: (code: string) =>
    [...worldDataKeys.all, "dynamic", code] as const,
  dynamicDataYear: (code: string, year: number) =>
    [...worldDataKeys.dynamicData(code), year] as const,
};

// ═══════════════════════════════════════════════════════════════
// Data Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch world data for a specific indicator and year
 * Uses server-side caching (24h) + client-side caching (1h)
 */
export function useWorldData(indicator: IndicatorId, year: number) {
  return useQuery<IndicatorData>({
    queryKey: worldDataKeys.dataYear(indicator, year),
    queryFn: () => getWorldData(indicator, year),
    staleTime: 60 * 60 * 1000, // 1 hour (data rarely changes)
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24h
    refetchOnWindowFocus: false, // Historical data doesn't need frequent refetch
    retry: 2,
  });
}

/**
 * Fetch list of available indicators
 */
export function useIndicators() {
  return useQuery<{ indicators: IndicatorMetadata[] }>({
    queryKey: worldDataKeys.indicators(),
    queryFn: getIndicators,
    staleTime: Infinity, // Never changes during session
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch indicators grouped by category
 */
export function useIndicatorsGrouped() {
  return useQuery<{ grouped: Record<IndicatorCategory, IndicatorMetadata[]> }>({
    queryKey: worldDataKeys.indicatorsGrouped(),
    queryFn: getIndicatorsGrouped,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

// ═══════════════════════════════════════════════════════════════
// Dynamic Indicator Hooks (Search any World Bank indicator)
// ═══════════════════════════════════════════════════════════════

/**
 * Search World Bank indicators with debouncing
 */
export function useIndicatorSearch(query: string, enabled: boolean = true) {
  return useQuery<{ indicators: SearchedIndicator[]; query: string }>({
    queryKey: worldDataKeys.search(query),
    queryFn: () => searchWorldBankIndicators(query, 50),
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch data for any World Bank indicator by code
 */
export function useDynamicWorldData(
  indicatorCode: string,
  year: number,
  enabled: boolean = true,
) {
  return useQuery<DynamicIndicatorData>({
    queryKey: worldDataKeys.dynamicDataYear(indicatorCode, year),
    queryFn: () => getDynamicWorldData(indicatorCode, year),
    enabled: enabled && indicatorCode.length > 0,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Unified hook for both featured and dynamic indicators
 * Automatically uses the right query based on indicator type
 */
export function useUnifiedWorldData(
  indicator: string, // Either IndicatorId or World Bank code
  year: number,
  isDynamic: boolean = false,
) {
  const featuredQuery = useWorldData(indicator as IndicatorId, year);
  const dynamicQuery = useDynamicWorldData(indicator, year, isDynamic);

  if (isDynamic) {
    return {
      data: dynamicQuery.data,
      isLoading: dynamicQuery.isLoading,
      error: dynamicQuery.error,
      refetch: dynamicQuery.refetch,
      isDynamic: true,
    };
  }

  return {
    data: featuredQuery.data,
    isLoading: featuredQuery.isLoading,
    error: featuredQuery.error,
    refetch: featuredQuery.refetch,
    isDynamic: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// Prefetching Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Prefetch adjacent years for smooth slider experience
 * Call this when the slider is being interacted with
 */
export function usePrefetchAdjacentYears(
  indicator: IndicatorId,
  year: number,
  range: number = 5,
) {
  const queryClient = useQueryClient();

  const prefetchYear = (targetYear: number) => {
    queryClient.prefetchQuery({
      queryKey: worldDataKeys.dataYear(indicator, targetYear),
      queryFn: () => getWorldData(indicator, targetYear),
      staleTime: 60 * 60 * 1000,
    });
  };

  const prefetchRange = () => {
    // Prefetch years in both directions
    for (let i = 1; i <= range; i++) {
      prefetchYear(year - i);
      prefetchYear(year + i);
    }
  };

  const prefetchDecades = () => {
    // Prefetch common decade years for quick jumps
    const decades = [1970, 1980, 1990, 2000, 2010, 2020];
    decades.forEach((decade) => {
      if (decade !== year) {
        prefetchYear(decade);
      }
    });
  };

  return {
    prefetchYear,
    prefetchRange,
    prefetchDecades,
  };
}

/**
 * Prefetch all years for an indicator in the background
 * Returns progress information for UI feedback
 */
export function usePrefetchAllYears(
  indicator: IndicatorId,
  minYear: number,
  maxYear: number,
) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState({
    loaded: 0,
    total: 0,
    isComplete: false,
  });
  const [isPrefetching, setIsPrefetching] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check how many years are already cached
  const getCachedYearsCount = useCallback(() => {
    let count = 0;
    for (let year = minYear; year <= maxYear; year++) {
      const cached = queryClient.getQueryData(
        worldDataKeys.dataYear(indicator, year),
      );
      if (cached) count++;
    }
    return count;
  }, [queryClient, indicator, minYear, maxYear]);

  // Prefetch all years with staggered loading to avoid overwhelming the server
  const prefetchAll = useCallback(async () => {
    if (isPrefetching) return;

    // Cancel any previous prefetch operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const years: number[] = [];
    for (let year = minYear; year <= maxYear; year++) {
      // Skip already cached years
      const cached = queryClient.getQueryData(
        worldDataKeys.dataYear(indicator, year),
      );
      if (!cached) {
        years.push(year);
      }
    }

    if (years.length === 0) {
      setProgress({
        loaded: maxYear - minYear + 1,
        total: maxYear - minYear + 1,
        isComplete: true,
      });
      return;
    }

    const totalYears = maxYear - minYear + 1;
    const alreadyCached = totalYears - years.length;

    setIsPrefetching(true);
    setProgress({
      loaded: alreadyCached,
      total: totalYears,
      isComplete: false,
    });

    // Batch prefetch - load multiple years in parallel but in batches
    const BATCH_SIZE = 5;
    let loadedCount = alreadyCached;

    for (let i = 0; i < years.length; i += BATCH_SIZE) {
      if (abortControllerRef.current?.signal.aborted) break;

      const batch = years.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (year) => {
          try {
            await queryClient.prefetchQuery({
              queryKey: worldDataKeys.dataYear(indicator, year),
              queryFn: () => getWorldData(indicator, year),
              staleTime: 60 * 60 * 1000,
            });
            loadedCount++;
            setProgress({
              loaded: loadedCount,
              total: totalYears,
              isComplete: false,
            });
          } catch (e) {
            // Silently fail individual year prefetches
            console.warn(`Failed to prefetch year ${year}:`, e);
          }
        }),
      );

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < years.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    setProgress((prev: PrefetchProgress) => ({ ...prev, isComplete: true }));
    setIsPrefetching(false);
  }, [queryClient, indicator, minYear, maxYear, isPrefetching]);

  // Cancel prefetching
  const cancelPrefetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPrefetching(false);
  }, []);

  // Check if a specific year is cached
  const isYearCached = useCallback(
    (year: number) => {
      return !!queryClient.getQueryData(
        worldDataKeys.dataYear(indicator, year),
      );
    },
    [queryClient, indicator],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Reset progress and cancel ongoing prefetch when indicator changes
  useEffect(() => {
    // Cancel any ongoing prefetch for the previous indicator
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPrefetching(false);
    // Use a small delay to ensure cache is checked after state reset
    const timeoutId = setTimeout(() => {
      setProgress({
        loaded: getCachedYearsCount(),
        total: maxYear - minYear + 1,
        isComplete: false,
      });
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [indicator, getCachedYearsCount, maxYear, minYear]);

  return {
    prefetchAll,
    cancelPrefetch,
    progress,
    isPrefetching,
    isYearCached,
    getCachedYearsCount,
  };
}

/**
 * Simple hook to check if a year's data is cached
 * Use this when you need cache checking before other hooks
 */
export function useIsYearCached(indicator: IndicatorId) {
  const queryClient = useQueryClient();

  return useCallback(
    (year: number) => {
      return !!queryClient.getQueryData(
        worldDataKeys.dataYear(indicator, year),
      );
    },
    [queryClient, indicator],
  );
}

/**
 * Hook for prefetching on indicator change
 * Prefetches the current year when indicator changes
 */
export function usePrefetchOnIndicatorChange(year: number) {
  const queryClient = useQueryClient();

  const prefetchIndicator = (indicator: IndicatorId) => {
    queryClient.prefetchQuery({
      queryKey: worldDataKeys.dataYear(indicator, year),
      queryFn: () => getWorldData(indicator, year),
      staleTime: 60 * 60 * 1000,
    });
  };

  return { prefetchIndicator };
}

// ═══════════════════════════════════════════════════════════════
// Comparison Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch data for multiple years (for comparison view)
 * Useful for showing change over time or side-by-side comparison
 */
export function useWorldDataComparison(
  indicator: IndicatorId,
  years: number[],
) {
  return useQuery<IndicatorData[]>({
    queryKey: worldDataKeys.comparison(indicator, years),
    queryFn: async () => {
      const results = await Promise.all(
        years.map((year) => getWorldData(indicator, year)),
      );
      return results;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    enabled: years.length > 0,
  });
}

/**
 * Calculate changes between two years for a given indicator
 */
export function useWorldDataDelta(
  indicator: IndicatorId,
  startYear: number,
  endYear: number,
) {
  const { data, isLoading, error } = useWorldDataComparison(indicator, [
    startYear,
    endYear,
  ]);

  const deltaData = data ? calculateDelta(data[0], data[1]) : null;

  return {
    data: deltaData,
    isLoading,
    error,
    startYearData: data?.[0],
    endYearData: data?.[1],
  };
}

/**
 * Calculate the delta (change) between two indicator data snapshots
 */
function calculateDelta(
  startData: IndicatorData,
  endData: IndicatorData,
): Map<
  string,
  { absolute: number; percent: number; startValue: number; endValue: number }
> {
  const deltaMap = new Map<
    string,
    { absolute: number; percent: number; startValue: number; endValue: number }
  >();

  // Create a map of end year values for quick lookup
  const endValuesMap = new Map(endData.countries.map((c) => [c.code, c.value]));

  // Calculate deltas for each country
  startData.countries.forEach((startCountry) => {
    const endValue = endValuesMap.get(startCountry.code);

    if (
      startCountry.value !== null &&
      endValue !== null &&
      endValue !== undefined
    ) {
      const absolute = endValue - startCountry.value;
      const percent =
        startCountry.value !== 0
          ? ((endValue - startCountry.value) / startCountry.value) * 100
          : 0;

      deltaMap.set(startCountry.code, {
        absolute,
        percent,
        startValue: startCountry.value,
        endValue,
      });
    }
  });

  return deltaMap;
}

// ═══════════════════════════════════════════════════════════════
// Utility Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * Get a single country's data from the current indicator/year
 */
export function useCountryData(
  indicator: IndicatorId,
  year: number,
  countryCode: string,
) {
  const { data, isLoading, error } = useWorldData(indicator, year);

  const countryData = data?.countries.find(
    (c) => c.code === countryCode || c.code3 === countryCode,
  );

  return {
    data: countryData,
    indicator: data?.indicator,
    isLoading,
    error,
  };
}

/**
 * Get top N countries by value for the current indicator/year
 * Filters out aggregate regions (World, OECD, etc.) - only actual countries with 2-letter ISO codes
 */
export function useTopCountries(
  indicator: IndicatorId,
  year: number,
  count: number = 10,
  order: "asc" | "desc" = "desc",
) {
  const { data, isLoading, error } = useWorldData(indicator, year);

  const topCountries = data?.countries
    // Filter out aggregate regions - they have 3-letter codes
    // Actual countries have 2-letter ISO codes
    .filter((c) => c.value !== null && c.code.length === 2)
    .sort((a, b) => {
      const comparison = (b.value ?? 0) - (a.value ?? 0);
      return order === "desc" ? comparison : -comparison;
    })
    .slice(0, count);

  return {
    data: topCountries,
    indicator: data?.indicator,
    isLoading,
    error,
  };
}

/**
 * Invalidate world data cache (useful after settings change)
 */
export function useInvalidateWorldData() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: worldDataKeys.all });
  };

  const invalidateIndicator = (indicator: IndicatorId) => {
    queryClient.invalidateQueries({ queryKey: worldDataKeys.data(indicator) });
  };

  const invalidateYear = (indicator: IndicatorId, year: number) => {
    queryClient.invalidateQueries({
      queryKey: worldDataKeys.dataYear(indicator, year),
    });
  };

  return {
    invalidateAll,
    invalidateIndicator,
    invalidateYear,
  };
}
