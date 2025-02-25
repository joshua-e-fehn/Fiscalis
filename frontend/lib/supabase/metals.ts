import { PeriodDuration } from "@/../services/finance/financeService";
import { MetalChartData, MetalCurrency, MetalType } from "@/lib/types/metals";

export async function getLatestMetalPrice(
  metal: MetalType,
  currency: MetalCurrency
): Promise<MetalChartData> {
  const response = await fetch(
    `/api/metals/${metal}/prices/latest/${currency}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch gold prices: ${response.statusText}`);
  }
  return response.json();
}

export async function getHistoricalMetalPrices(
  metal: MetalType,
  timeRange: PeriodDuration,
  currency: MetalCurrency
): Promise<MetalChartData[]> {
  const response = await fetch(
    `/api/metals/${metal}/prices/historical/${timeRange}/${currency}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch gold prices: ${response.statusText}`);
  }
  return response.json();
}
