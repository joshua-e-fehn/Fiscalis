import { precious_metal_prices } from "@/db/drizzle/schema";

export type MetalCurrency = "eur" | "usd";

export type MetalType = "gold" | "silver" | "platinum" | "palladium";

export interface MetalChartData {
  date: Date | null;
  price: number | null;
}

export const metalColumns = {
  eur: {
    gold: precious_metal_prices.gold_eur,
    silver: precious_metal_prices.silver_eur,
    platinum: precious_metal_prices.platinum_eur,
    palladium: precious_metal_prices.palladium_eur,
  },
  usd: {
    gold: precious_metal_prices.gold_usd,
    silver: precious_metal_prices.silver_usd,
    platinum: precious_metal_prices.platinum_usd,
    palladium: precious_metal_prices.palladium_usd,
  },
};
