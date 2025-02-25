import { TimeRange, TimeInterval } from "@/../services/finance/financeService";
import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";

export async function getMetalPriceLatest(
  metal: MetalType,
  currency: MetalCurrency
): Promise<MetalChartData> {
  const params = new URLSearchParams({
    currency: currency.toLowerCase(),
  });

  const response = await fetch(
    `/api/metals/${metal}/prices/latest?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${metal} prices: ${response.statusText}`);
  }
  return response.json();
}

export async function getMetalPricesHistorical(
  metal: MetalType,
  timeRange: TimeRange,
  currency: MetalCurrency
): Promise<MetalChartData[]> {
  const params = new URLSearchParams({
    timeRange: timeRange,
    currency: currency.toLowerCase(),
  });

  const response = await fetch(
    `/api/metals/${metal}/prices/historical?${params.toString()}`
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
  currency: MetalCurrency
): Promise<MetalChartData[]> {
  // Ensure dates are in UTC / standard time
  const standardStartTime = new Date(
    startDate.getTime() + startDate.getTimezoneOffset() * 60000
  );
  const standardEndTime = new Date(
    endDate.getTime() + endDate.getTimezoneOffset() * 60000
  );

  const params = new URLSearchParams({
    startDate: standardStartTime.toISOString(), // Will be in standard time (UTC)
    endDate: standardEndTime.toISOString(), // Will be in standard time (UTC)
    aggregationInterval,
    currency: currency.toLowerCase(),
  });

  const response = await fetch(
    `/api/metals/${metal}/prices/range?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${metal} prices: ${response.statusText}`);
  }
  return response.json();
}
