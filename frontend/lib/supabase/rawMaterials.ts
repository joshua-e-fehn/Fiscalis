import { PeriodDuration } from "@/../services/finance/financeService";
import { MetalChartData, MetalCurrency } from "@/lib/types/rawMaterials";

export async function getGoldPrices(
  timeRange: PeriodDuration,
  currency: MetalCurrency = "EUR"
): Promise<MetalChartData[]> {
  const response = await fetch(
    `/api/raw-materials/gold/prices/${timeRange}/${currency}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch gold prices: ${response.statusText}`);
  }
  return response.json();
}
