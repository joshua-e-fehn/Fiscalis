import { TimeRange, TimeInterval } from "@/../services/finance/financeService";
import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";
import {
  AllMetalPrices,
  GoldExtendedPrices,
} from "@/lib/types/metals-extended";

// ═══════════════════════════════════════════════════════════════
// Existing metals API functions
// ═══════════════════════════════════════════════════════════════

export async function getMetalPriceLatest(
  metal: MetalType,
  currency: MetalCurrency,
): Promise<MetalChartData> {
  const params = new URLSearchParams({
    currency: currency.toLowerCase(),
  });

  const response = await fetch(
    `/api/metals/${metal}/prices/latest?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${metal} prices: ${response.statusText}`);
  }
  return response.json();
}

export async function getMetalPricesHistorical(
  metal: MetalType,
  timeRange: TimeRange,
  currency: MetalCurrency,
): Promise<MetalChartData[]> {
  const params = new URLSearchParams({
    timeRange: timeRange,
    currency: currency.toLowerCase(),
  });

  const response = await fetch(
    `/api/metals/${metal}/prices/historical?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${metal} prices: ${response.statusText}`);
  }
  return response.json();
}

export async function getMetalPricesRange(
  metal: MetalType,
  startDate: Date,
  endDate: Date,
  aggregationInterval: TimeInterval,
  currency: MetalCurrency,
): Promise<MetalChartData[]> {
  const params = new URLSearchParams({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    aggregationInterval,
    currency: currency.toLowerCase(),
  });

  const response = await fetch(
    `/api/metals/${metal}/prices/range?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${metal} prices: ${response.statusText}`);
  }
  return response.json();
}

// ═══════════════════════════════════════════════════════════════
// Extended metals prices API functions
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch all metal prices from Supabase in a single request
 * Endpoint: GET /api/metals/prices/all/latest
 */
export async function getAllMetalPricesLatest(): Promise<AllMetalPrices> {
  const response = await fetch("/api/metals/prices/all/latest");

  if (!response.ok) {
    throw new Error(`Failed to fetch all metal prices: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch gold extended prices (gram, kilo, purity) from Supabase
 * Endpoint: GET /api/metals/gold/prices/extended
 */
export async function getGoldExtendedPrices(): Promise<GoldExtendedPrices> {
  const response = await fetch("/api/metals/gold/prices/extended");

  if (!response.ok) {
    throw new Error(
      `Failed to fetch gold extended prices: ${response.statusText}`,
    );
  }

  return response.json();
}
