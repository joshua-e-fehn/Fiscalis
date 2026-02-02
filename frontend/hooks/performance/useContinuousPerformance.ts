/**
 * Continuous Performance Hook
 *
 * Calculates performance from historical price data for continuous value assets
 * (precious metals with real-time price feeds)
 */

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import type {
  TimeRange,
  TimeInterval,
  PerformanceMetrics,
  PerformanceDataPoint,
  HoldingData,
  PriceData,
} from "@/lib/performance";
import {
  getContinuousStrategy,
  type ContinuousPerformanceInput,
  type PerformanceCalculationOptions,
} from "@/lib/performance";
import {
  getDefaultIntervalForRange,
  getTimeRangeStartTimestamp,
} from "@/../services/finance/financeService";

import { useMetalPricesRange } from "@/hooks/metals";
import type { MetalCurrency, MetalType } from "@/lib/types/metals";
import type { MetalsCurrency, MetalsType } from "@/lib/types/metals-extended";

// Troy ounce to grams conversion factor
const TROY_OUNCE_TO_GRAMS = 31.1035;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface UseContinuousPerformanceOptions {
  /** Time range for performance calculation */
  timeRange: TimeRange;
  /** Currency for price data (default: "eur") */
  currency?: MetalsCurrency;
  /** Whether to include data points in result (default: false for performance) */
  includeDataPoints?: boolean;
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
}

export interface UseContinuousPerformanceResult {
  /** Performance metrics */
  metrics: PerformanceMetrics | null;
  /** Data points for charting (if includeDataPoints=true) */
  dataPoints: PerformanceDataPoint[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Current portfolio value */
  currentValue: number;
  /** Total cost basis */
  totalCostBasis: number | null;
}

// ═══════════════════════════════════════════════════════════════
// Helper to convert TimeRange to date range
// ═══════════════════════════════════════════════════════════════

function getDateRange(timeRange: TimeRange): {
  startDate: Date;
  endDate: Date;
  interval: TimeInterval;
} {
  const endDate = new Date();
  const startTimestamp = getTimeRangeStartTimestamp(timeRange);
  const startDate = new Date(startTimestamp);
  const interval = getDefaultIntervalForRange(timeRange);

  return { startDate, endDate, interval };
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for continuous (price-based) performance calculation
 *
 * Uses vault items from Convex and historical prices from the metals API.
 * Calculates: Value(t) = Σ(quantity_i(t) × price_i(t) × premium_i)
 *
 * @example
 * ```tsx
 * const { metrics, isLoading } = useContinuousPerformance({
 *   timeRange: "YTD",
 *   currency: "eur",
 * });
 *
 * if (isLoading) return <Spinner />;
 *
 * return (
 *   <div>
 *     <p>YTD: {metrics?.percentChange.toFixed(2)}%</p>
 *   </div>
 * );
 * ```
 */
export function useContinuousPerformance(
  options: UseContinuousPerformanceOptions,
): UseContinuousPerformanceResult {
  const {
    timeRange,
    currency = "eur",
    includeDataPoints = false,
    enabled = true,
  } = options;

  const { userId } = useAuth();

  // Get date range for the time range
  const { startDate, endDate, interval } = useMemo(
    () => getDateRange(timeRange),
    [timeRange],
  );

  // Fetch vault items from Convex
  const vaultItems = useQuery(
    api.vault.getUserVaultItems,
    enabled && userId ? { userId } : "skip",
  );

  // Determine which metal types we need prices for
  const metalTypes = useMemo(() => {
    if (!vaultItems) return new Set<MetalsType>();
    return new Set(
      vaultItems.map(
        (item: { metalType: string }) => item.metalType as MetalsType,
      ),
    );
  }, [vaultItems]);

  // Fetch historical prices for each metal type
  const goldPrices = useMetalPricesRange(
    "gold" as MetalType,
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    enabled && metalTypes.has("gold"),
  );

  const silverPrices = useMetalPricesRange(
    "silver" as MetalType,
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    enabled && metalTypes.has("silver"),
  );

  const platinumPrices = useMetalPricesRange(
    "platinum" as MetalType,
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    enabled && metalTypes.has("platinum"),
  );

  const palladiumPrices = useMetalPricesRange(
    "palladium" as MetalType,
    startDate,
    endDate,
    interval,
    currency as MetalCurrency,
    enabled && metalTypes.has("palladium"),
  );

  const isLoading =
    vaultItems === undefined ||
    (metalTypes.has("gold") && goldPrices.isLoading) ||
    (metalTypes.has("silver") && silverPrices.isLoading) ||
    (metalTypes.has("platinum") && platinumPrices.isLoading) ||
    (metalTypes.has("palladium") && palladiumPrices.isLoading);

  // Transform vault items to HoldingData format
  const holdings = useMemo<HoldingData[]>(() => {
    if (!vaultItems) return [];

    return vaultItems.map((item) => ({
      id: item._id,
      assetType: item.metalType,
      quantity: item.quantity,
      fineWeightGrams: item.fineWeightGrams,
      sellPremium: item.sellPremium ?? 0,
      purchaseDate: item.purchaseDate
        ? new Date(item.purchaseDate).getTime()
        : item._creationTime,
      purchasePricePerUnit: item.purchasePricePerUnit,
    }));
  }, [vaultItems]);

  // Transform price data to PriceData format
  // Note: API prices are per troy ounce, but calculations need per gram
  const prices = useMemo<PriceData>(() => {
    const result: PriceData = {};

    // Helper to convert API date to timestamp
    const toTimestamp = (date: Date | string | null): number => {
      if (!date) return 0;
      if (typeof date === "string") return new Date(date).getTime();
      return date.getTime();
    };

    // Helper to convert price per ounce to price per gram
    const toPerGram = (pricePerOunce: number): number => {
      return pricePerOunce / TROY_OUNCE_TO_GRAMS;
    };

    if (goldPrices.data) {
      result.gold = goldPrices.data
        .filter((p) => p.price !== null)
        .map((p) => ({
          timestamp: toTimestamp(p.date),
          price: toPerGram(p.price!),
        }));
    }

    if (silverPrices.data) {
      result.silver = silverPrices.data
        .filter((p) => p.price !== null)
        .map((p) => ({
          timestamp: toTimestamp(p.date),
          price: toPerGram(p.price!),
        }));
    }

    if (platinumPrices.data) {
      result.platinum = platinumPrices.data
        .filter((p) => p.price !== null)
        .map((p) => ({
          timestamp: toTimestamp(p.date),
          price: toPerGram(p.price!),
        }));
    }

    if (palladiumPrices.data) {
      result.palladium = palladiumPrices.data
        .filter((p) => p.price !== null)
        .map((p) => ({
          timestamp: toTimestamp(p.date),
          price: toPerGram(p.price!),
        }));
    }

    return result;
  }, [
    goldPrices.data,
    silverPrices.data,
    platinumPrices.data,
    palladiumPrices.data,
  ]);

  // Calculate current value and cost basis from vault items
  const { currentValue, totalCostBasis } = useMemo(() => {
    if (!vaultItems || vaultItems.length === 0) {
      return { currentValue: 0, totalCostBasis: null };
    }

    let cost = 0;

    for (const item of vaultItems) {
      // Calculate cost basis
      if (item.purchasePricePerUnit) {
        cost += item.purchasePricePerUnit * item.quantity;
      }
    }

    // Note: Current value calculation requires live prices which are
    // fetched separately in useCommoditiesSummary. Here we just track cost.
    // The actual current value comes from the performance calculation end value.
    return {
      currentValue: 0, // Will be populated from metrics.endValue
      totalCostBasis: cost > 0 ? cost : null,
    };
  }, [vaultItems]);

  // Calculate performance
  const result = useMemo(() => {
    if (holdings.length === 0 || Object.keys(prices).length === 0) {
      return {
        metrics: null,
        dataPoints: [],
      };
    }

    const strategy = getContinuousStrategy();
    const input: ContinuousPerformanceInput = {
      holdings,
      prices,
    };
    const calcOptions: PerformanceCalculationOptions = {
      timeRange,
      includeDataPoints,
    };

    try {
      const performanceResult = strategy.calculate(input, calcOptions);
      return {
        metrics: performanceResult.metrics,
        dataPoints: performanceResult.dataPoints,
      };
    } catch (err) {
      console.error("Continuous performance calculation error:", err);
      return {
        metrics: null,
        dataPoints: [],
      };
    }
  }, [holdings, prices, timeRange, includeDataPoints]);

  return {
    metrics: result.metrics,
    dataPoints: result.dataPoints,
    isLoading,
    error: null,
    currentValue,
    totalCostBasis,
  };
}
