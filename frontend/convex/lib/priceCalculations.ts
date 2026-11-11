/**
 * Price calculation utilities for the Vault feature
 * Used for calculating precious metal values, weights, and profit/loss
 */

// ============================================
// Constants
// ============================================

/**
 * Troy ounce in grams - the standard unit for precious metals trading
 * This is a fixed physical constant used worldwide in the precious metals industry
 */
export const TROY_OUNCE_GRAMS = 31.1034768;

// ============================================
// Weight Conversions
// ============================================

/**
 * Convert grams to troy ounces
 */
export function gramsToTroyOunces(grams: number): number {
  return grams / TROY_OUNCE_GRAMS;
}

/**
 * Convert troy ounces to grams
 */
export function troyOuncesToGrams(oz: number): number {
  return oz * TROY_OUNCE_GRAMS;
}

/**
 * Calculate fine (pure metal) weight from total weight and purity
 * @param totalWeightGrams - Total weight of the item in grams
 * @param purity - Purity as fineness (e.g., 999.9, 916.7, 750)
 * @returns Fine weight in grams
 */
export function calculateFineWeight(
  totalWeightGrams: number,
  purity: number,
): number {
  return totalWeightGrams * (purity / 1000);
}

// ============================================
// Value Calculations
// ============================================

/**
 * Calculate current market value with premium
 * Formula: spotPricePerOunce × fineWeightOz × (1 + premium) × quantity
 *
 * @param spotPricePerOunce - Current spot price per troy ounce
 * @param fineWeightGrams - Pure metal weight in grams
 * @param premium - Premium as decimal (e.g., 0.03 for 3%, -0.02 for -2%)
 * @param quantity - Number of items
 * @returns Total market value
 */
export function calculateMarketValue(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  premium: number,
  quantity: number,
): number {
  const fineWeightOz = gramsToTroyOunces(fineWeightGrams);
  return spotPricePerOunce * fineWeightOz * (1 + premium) * quantity;
}

/**
 * Calculate buy price (what you'd pay to acquire an item)
 * Uses buy premium which is typically positive (above spot)
 */
export function calculateBuyPrice(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  buyPremium: number,
  quantity: number,
): number {
  return calculateMarketValue(
    spotPricePerOunce,
    fineWeightGrams,
    buyPremium,
    quantity,
  );
}

/**
 * Calculate sell price (what you'd receive when selling)
 * Uses sell premium which can be negative (below spot)
 */
export function calculateSellPrice(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  sellPremium: number,
  quantity: number,
): number {
  return calculateMarketValue(
    spotPricePerOunce,
    fineWeightGrams,
    sellPremium,
    quantity,
  );
}

/**
 * Calculate melt value (pure metal value without premium)
 * This is the intrinsic value of the metal content only
 *
 * @param spotPricePerOunce - Current spot price per troy ounce
 * @param fineWeightGrams - Pure metal weight in grams
 * @param quantity - Number of items
 * @returns Total melt value
 */
export function calculateMeltValue(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  quantity: number,
): number {
  const fineWeightOz = gramsToTroyOunces(fineWeightGrams);
  return spotPricePerOunce * fineWeightOz * quantity;
}

/**
 * Calculate the premium value (market value minus melt value)
 *
 * @param spotPricePerOunce - Current spot price per troy ounce
 * @param fineWeightGrams - Pure metal weight in grams
 * @param premium - Premium as decimal (e.g., 0.03 for 3%)
 * @param quantity - Number of items
 * @returns Premium value
 */
export function calculatePremiumValue(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  premium: number,
  quantity: number,
): number {
  const meltValue = calculateMeltValue(
    spotPricePerOunce,
    fineWeightGrams,
    quantity,
  );
  return meltValue * premium;
}

// ============================================
// Profit/Loss Calculations
// ============================================

export interface ProfitLoss {
  absolute: number;
  percentage: number;
}

/**
 * Calculate profit/loss compared to purchase price
 *
 * @param currentValue - Current total value of holdings
 * @param purchasePricePerUnit - Original purchase price per unit
 * @param quantity - Number of items
 * @returns Object with absolute and percentage profit/loss
 */
export function calculateProfitLoss(
  currentValue: number,
  purchasePricePerUnit: number,
  quantity: number,
): ProfitLoss {
  const totalPurchasePrice = purchasePricePerUnit * quantity;
  const absolute = currentValue - totalPurchasePrice;
  const percentage =
    totalPurchasePrice > 0
      ? ((currentValue - totalPurchasePrice) / totalPurchasePrice) * 100
      : 0;

  return { absolute, percentage };
}

/**
 * Calculate price change between two values
 *
 * @param currentPrice - Current price
 * @param previousPrice - Previous price to compare against
 * @returns Object with absolute and percentage change
 */
export function calculatePriceChange(
  currentPrice: number,
  previousPrice: number,
): ProfitLoss {
  const absolute = currentPrice - previousPrice;
  const percentage =
    previousPrice > 0
      ? ((currentPrice - previousPrice) / previousPrice) * 100
      : 0;

  return { absolute, percentage };
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format a number as currency
 *
 * @param value - The value to format
 * @param currency - Currency code (EUR, USD, CHF)
 * @param locale - Locale for formatting (default: de-DE for European format)
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number,
  currency: "EUR" | "USD" | "CHF" = "EUR",
  locale: string = "de-DE",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format weight with appropriate unit
 *
 * @param grams - Weight in grams
 * @param unit - Display unit ('g' | 'oz' | 'kg')
 * @returns Formatted weight string
 */
export function formatWeight(
  grams: number,
  unit: "g" | "oz" | "kg" = "g",
): string {
  switch (unit) {
    case "oz":
      return `${gramsToTroyOunces(grams).toFixed(4)} oz`;
    case "kg":
      return `${(grams / 1000).toFixed(3)} kg`;
    case "g":
    default:
      return `${grams.toFixed(2)} g`;
  }
}

/**
 * Format percentage with sign
 *
 * @param percentage - Percentage value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string with sign
 */
export function formatPercentage(
  percentage: number,
  decimals: number = 2,
): string {
  const sign = percentage >= 0 ? "+" : "";
  return `${sign}${percentage.toFixed(decimals)}%`;
}

// ============================================
// Server-side vault valuation (net worth, API, snapshots)
// ============================================

export type SpotMetal = "gold" | "silver" | "platinum" | "palladium";

export const SPOT_METALS: readonly SpotMetal[] = [
  "gold",
  "silver",
  "platinum",
  "palladium",
];

/** Latest EUR spot price per troy ounce for one metal. */
export interface SpotPrice {
  metalType: SpotMetal;
  eurPerOunce: number;
  /** When the price was observed upstream (ms since epoch). */
  sourceTimestamp: number;
}

/**
 * A spot price older than this is not trusted for valuation; the item falls
 * back to its purchase price. Generous enough to cover weekends/holidays.
 */
export const SPOT_PRICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Value a vault item the same way the dashboard does
 * (`hooks/convex/metals.ts` enrichItemWithValuation): liquidation value at
 * spot, i.e. `calculateSellPrice(spot, fineWeightGrams, sellPremium ?? 0, qty)`.
 *
 * Falls back to purchase price when no fresh spot price is available, so a
 * price-feed outage never silently zeroes a holding.
 */
export function valueVaultItem(
  item: {
    fineWeightGrams: number;
    quantity: number;
    sellPremium?: number;
    purchasePricePerUnit?: number;
  },
  spot: SpotPrice | undefined,
  now: number,
): { value: number; cost: number; pricedAtSpot: boolean } {
  const cost = (item.purchasePricePerUnit ?? 0) * item.quantity;
  const fresh =
    spot !== undefined &&
    Number.isFinite(spot.eurPerOunce) &&
    spot.eurPerOunce > 0 &&
    now - spot.sourceTimestamp <= SPOT_PRICE_MAX_AGE_MS;

  if (!fresh) return { value: cost, cost, pricedAtSpot: false };

  return {
    value: calculateSellPrice(
      spot.eurPerOunce,
      item.fineWeightGrams,
      item.sellPremium ?? 0,
      item.quantity,
    ),
    cost,
    pricedAtSpot: true,
  };
}

/**
 * Parse the JSON of `GET /api/metals/prices/all/latest` into EUR spot prices.
 * Untrusted input: anything missing, non-numeric or non-positive is dropped,
 * and an unparseable timestamp rejects the whole payload.
 */
export function parseLatestMetalPrices(json: unknown): SpotPrice[] {
  if (typeof json !== "object" || json === null) return [];
  const body = json as Record<string, unknown>;
  const sourceTimestamp =
    typeof body.timestamp === "string" ? Date.parse(body.timestamp) : NaN;
  if (!Number.isFinite(sourceTimestamp)) return [];

  const prices: SpotPrice[] = [];
  for (const metalType of SPOT_METALS) {
    const entry = body[metalType] as Record<string, unknown> | undefined;
    const eur = entry?.eur;
    if (typeof eur === "number" && Number.isFinite(eur) && eur > 0) {
      prices.push({ metalType, eurPerOunce: eur, sourceTimestamp });
    }
  }
  return prices;
}
