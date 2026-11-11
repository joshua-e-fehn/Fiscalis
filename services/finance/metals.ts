/**
 * Precious-metal valuation: the one implementation shared by the Convex
 * backend (net worth, snapshots, spot-price mirror), the React hooks (vault
 * dashboard) and the continuous performance strategy.
 *
 * Framework-free so the Convex bundle, Next.js and vitest can all import it.
 * Prices are per troy ounce, weights in grams, premiums are decimals
 * (0.03 = 3% above spot, -0.02 = 2% below spot).
 */

import { summarizeHoldings } from "../portfolio/categorySummary";

// ============================================
// Units
// ============================================

/** Troy ounce in grams, the unit precious-metal prices are quoted in. */
export const TROY_OUNCE_GRAMS = 31.1034768;

export function gramsToTroyOunces(grams: number): number {
  return grams / TROY_OUNCE_GRAMS;
}

// ============================================
// Premiums
// ============================================

/** Buy premium used when neither the item nor its catalog entry sets one. */
export const DEFAULT_BUY_PREMIUM = 0.03;
/** Sell premium used when none is set: selling at spot. */
export const DEFAULT_SELL_PREMIUM = 0;

/**
 * Resolve an item's buy/sell premiums. Candidates are tried in order (e.g.
 * the explicit argument, the catalog default, the legacy single `premium`
 * field); the first number wins, then the defaults above.
 */
export function resolvePremiums(candidates: {
  buy?: ReadonlyArray<number | null | undefined>;
  sell?: ReadonlyArray<number | null | undefined>;
}): { buyPremium: number; sellPremium: number } {
  const first = (values: ReadonlyArray<number | null | undefined> = []) =>
    values.find((v): v is number => typeof v === "number");
  return {
    buyPremium: first(candidates.buy) ?? DEFAULT_BUY_PREMIUM,
    sellPremium: first(candidates.sell) ?? DEFAULT_SELL_PREMIUM,
  };
}

// ============================================
// Value at a given spot price
// ============================================

/** Pure metal value at spot: spot/oz × fine oz × quantity. */
export function calculateMeltValue(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  quantity: number,
): number {
  return spotPricePerOunce * gramsToTroyOunces(fineWeightGrams) * quantity;
}

/** Value at spot with a premium: melt value × (1 + premium). */
export function calculateMarketValue(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  premium: number,
  quantity: number,
): number {
  return (
    calculateMeltValue(spotPricePerOunce, fineWeightGrams, quantity) *
    (1 + premium)
  );
}

/** What you would pay to acquire the items (buy premium). */
export const calculateBuyPrice = calculateMarketValue;

/** What you would receive selling the items (sell premium). */
export const calculateSellPrice = calculateMarketValue;

/** The premium part of the value: melt value × premium. */
export function calculatePremiumValue(
  spotPricePerOunce: number,
  fineWeightGrams: number,
  premium: number,
  quantity: number,
): number {
  return (
    calculateMeltValue(spotPricePerOunce, fineWeightGrams, quantity) * premium
  );
}

export interface PriceChange {
  absolute: number;
  /** Percent; 0 when the previous price is not positive. */
  percentage: number;
}

export function calculatePriceChange(
  currentPrice: number,
  previousPrice: number,
): PriceChange {
  const absolute = currentPrice - previousPrice;
  return {
    absolute,
    percentage: previousPrice > 0 ? (absolute / previousPrice) * 100 : 0,
  };
}

// ============================================
// Spot prices and staleness
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

/** Tolerated clock skew for upstream timestamps that lie in the future. */
export const SPOT_PRICE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * The spot price per ounce if it is usable for valuation (finite, positive,
 * observed within SPOT_PRICE_MAX_AGE_MS and not in the future), else null.
 */
export function freshSpotPerOunce(
  pricePerOunce: number | null | undefined,
  sourceTimestamp: number | null | undefined,
  now: number,
): number | null {
  if (
    typeof pricePerOunce !== "number" ||
    !Number.isFinite(pricePerOunce) ||
    pricePerOunce <= 0 ||
    typeof sourceTimestamp !== "number" ||
    !Number.isFinite(sourceTimestamp)
  ) {
    return null;
  }
  const age = now - sourceTimestamp;
  if (age > SPOT_PRICE_MAX_AGE_MS || age < -SPOT_PRICE_MAX_FUTURE_SKEW_MS) {
    return null;
  }
  return pricePerOunce;
}

/**
 * Parse the JSON of `GET /api/metals/prices/all/latest` into EUR spot prices.
 * Untrusted input: anything missing, non-numeric or non-positive is dropped,
 * and an unparseable or future timestamp rejects the whole payload.
 */
export function parseLatestMetalPrices(
  json: unknown,
  now: number,
): SpotPrice[] {
  if (typeof json !== "object" || json === null) return [];
  const body = json as Record<string, unknown>;
  const sourceTimestamp =
    typeof body.timestamp === "string" ? Date.parse(body.timestamp) : NaN;
  if (!Number.isFinite(sourceTimestamp)) return [];
  // A future timestamp would freeze the mirror (newer-wins upsert) and look
  // fresh forever, so reject it outright.
  if (sourceTimestamp - now > SPOT_PRICE_MAX_FUTURE_SKEW_MS) return [];

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

// ============================================
// Item valuation
// ============================================

export interface MetalItemInput {
  fineWeightGrams: number;
  quantity: number;
  sellPremium?: number;
  purchasePricePerUnit?: number;
}

/**
 * Liquidation value of a vault item at spot:
 * `calculateSellPrice(spot, fineWeightGrams, sellPremium ?? 0, quantity)`.
 *
 * `cost` is null when the item has no purchase price. Without a fresh spot
 * price the item is valued at its cost (0 when unknown), so a price-feed
 * outage never silently zeroes a holding that has a cost.
 */
export function valueVaultItem(
  item: MetalItemInput,
  spot: Pick<SpotPrice, "eurPerOunce" | "sourceTimestamp"> | undefined,
  now: number,
): { value: number; cost: number | null; pricedAtSpot: boolean } {
  const cost =
    item.purchasePricePerUnit != null
      ? item.purchasePricePerUnit * item.quantity
      : null;
  const perOunce = freshSpotPerOunce(
    spot?.eurPerOunce,
    spot?.sourceTimestamp,
    now,
  );
  if (perOunce === null) {
    return { value: cost ?? 0, cost, pricedAtSpot: false };
  }
  return {
    value: calculateSellPrice(
      perOunce,
      item.fineWeightGrams,
      item.sellPremium ?? DEFAULT_SELL_PREMIUM,
      item.quantity,
    ),
    cost,
    pricedAtSpot: true,
  };
}

export interface MetalItemValuation {
  /** Per-unit price to buy one item today (buy premium); 0 without spot. */
  currentBuyPrice: number;
  /** Per-unit price selling one item today (sell premium); 0 without spot. */
  currentSellPrice: number;
  /** Liquidation value of the whole position (see valueVaultItem). */
  marketValue: number;
  meltValue: number;
  buyPremiumValue: number;
  sellPremiumValue: number;
  totalCost: number | null;
  /** marketValue − totalCost; null without cost or without a fresh spot. */
  profitLoss: number | null;
  profitLossPercent: number | null;
  pricedAtSpot: boolean;
}

/**
 * Full dashboard valuation of one vault item. `spotPerOunce` is in the
 * display currency; it goes through the same staleness policy as the server
 * (`freshSpotPerOunce`) and the market value is `valueVaultItem`'s.
 */
export function valueMetalItem(
  item: MetalItemInput & { buyPremium: number; sellPremium: number },
  spot: { pricePerOunce: number | null; sourceTimestamp: number | null },
  now: number,
): MetalItemValuation {
  const perOunce = freshSpotPerOunce(
    spot.pricePerOunce,
    spot.sourceTimestamp,
    now,
  );
  const { value, cost, pricedAtSpot } = valueVaultItem(
    item,
    perOunce === null
      ? undefined
      : { eurPerOunce: perOunce, sourceTimestamp: now },
    now,
  );
  const at = (fn: (spot: number) => number) =>
    perOunce === null ? 0 : fn(perOunce);
  const change =
    pricedAtSpot && cost !== null ? calculatePriceChange(value, cost) : null;

  return {
    currentBuyPrice: at((s) =>
      calculateBuyPrice(s, item.fineWeightGrams, item.buyPremium, 1),
    ),
    currentSellPrice: at((s) =>
      calculateSellPrice(s, item.fineWeightGrams, item.sellPremium, 1),
    ),
    marketValue: value,
    meltValue: at((s) =>
      calculateMeltValue(s, item.fineWeightGrams, item.quantity),
    ),
    buyPremiumValue: at((s) =>
      calculatePremiumValue(
        s,
        item.fineWeightGrams,
        item.buyPremium,
        item.quantity,
      ),
    ),
    sellPremiumValue: at((s) =>
      calculatePremiumValue(
        s,
        item.fineWeightGrams,
        item.sellPremium,
        item.quantity,
      ),
    ),
    totalCost: cost,
    profitLoss: change ? change.absolute : null,
    profitLossPercent: change && cost! > 0 ? change.percentage : null,
    pricedAtSpot,
  };
}

// ============================================
// Portfolio summary
// ============================================

export interface ValuedMetalItem {
  metalType: string;
  fineWeightGrams: number;
  quantity: number;
  marketValue: number;
  meltValue: number;
  totalCost: number | null;
}

export interface MetalTypeSummary {
  totalFineWeightGrams: number;
  totalFineWeightOz: number;
  /** Total quantity */
  totalItems: number;
  /** Number of distinct items */
  itemCount: number;
  marketValue: number;
  meltValue: number;
  /** Cost of the items that have one; null when none has */
  totalCost: number | null;
  /** P/L over the items with a cost (value and cost of the same items) */
  profitLoss: number | null;
  profitLossPercent: number | null;
  /** Share of marketValue that totalCost covers (0..1), null without value */
  coverage: number | null;
}

export interface MetalsPortfolioSummary {
  gold: MetalTypeSummary;
  silver: MetalTypeSummary;
  platinum: MetalTypeSummary;
  palladium: MetalTypeSummary;
  totalMarketValue: number;
  totalMeltValue: number;
  totalCost: number | null;
  totalProfitLoss: number | null;
  totalProfitLossPercent: number | null;
  coverage: number | null;
  /** Percent of totalMarketValue per metal */
  allocation: Record<SpotMetal, number>;
}

function summarizeMetalType(items: ValuedMetalItem[]): MetalTypeSummary {
  const totalFineWeightGrams = items.reduce(
    (sum, i) => sum + i.fineWeightGrams * i.quantity,
    0,
  );
  const pl = summarizeHoldings(
    items.map((i) => ({ value: i.marketValue, costBasis: i.totalCost })),
  );
  return {
    totalFineWeightGrams,
    totalFineWeightOz: gramsToTroyOunces(totalFineWeightGrams),
    totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
    itemCount: items.length,
    marketValue: pl.value,
    meltValue: items.reduce((sum, i) => sum + i.meltValue, 0),
    totalCost: pl.costBasis,
    profitLoss: pl.profitLoss,
    profitLossPercent: pl.profitLossPercent,
    coverage: pl.coverage,
  };
}

/**
 * Per-metal and total summary of valued items. Cost and P/L follow the
 * shared coverage policy (`summarizeHoldings`): only items with a purchase
 * price count, and `coverage` says which share of the value that is.
 */
export function summarizeMetalItems(
  items: ValuedMetalItem[],
): MetalsPortfolioSummary {
  const [gold, silver, platinum, palladium] = SPOT_METALS.map((metal) =>
    summarizeMetalType(items.filter((i) => i.metalType === metal)),
  );
  const total = summarizeHoldings(
    items.map((i) => ({ value: i.marketValue, costBasis: i.totalCost })),
  );
  const share = (v: number) => (total.value > 0 ? (v / total.value) * 100 : 0);

  return {
    gold,
    silver,
    platinum,
    palladium,
    totalMarketValue: total.value,
    totalMeltValue: items.reduce((sum, i) => sum + i.meltValue, 0),
    totalCost: total.costBasis,
    totalProfitLoss: total.profitLoss,
    totalProfitLossPercent: total.profitLossPercent,
    coverage: total.coverage,
    allocation: {
      gold: share(gold.marketValue),
      silver: share(silver.marketValue),
      platinum: share(platinum.marketValue),
      palladium: share(palladium.marketValue),
    },
  };
}
