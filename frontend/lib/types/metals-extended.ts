/**
 * Types for precious metals tracking
 */

// ═══════════════════════════════════════════════════════════════
// Price Types (from Supabase via /api/metals/*)
// ═══════════════════════════════════════════════════════════════

export type MetalsCurrency = "eur" | "usd" | "chf";
export type MetalsType = "gold" | "silver" | "platinum" | "palladium";

/** Purity levels for gold (in per-mille) */
export type GoldPurity = 333 | 585 | 750 | 833 | 900 | 916 | 999;

/** Base metal price in all currencies */
export interface MetalPrice {
  eur: number;
  usd: number;
  chf: number | null;
}

/** Gold purity prices per gram */
export interface GoldPurityPrices {
  333: number | null;
  585: number | null;
  750: number | null;
  833: number | null;
  900: number | null;
  916: number | null;
  999: number | null;
}

/** Gold extended prices from /api/metals/gold/prices/extended */
export interface GoldExtendedPrices {
  ounce: MetalPrice;
  gram: {
    eur: number | null;
    usd: number | null;
    chf: number | null;
  };
  kilo: {
    eur: number | null;
    usd: number | null;
    chf: number | null;
  };
  purity: {
    eur: GoldPurityPrices;
    usd: GoldPurityPrices;
    chf: GoldPurityPrices;
  };
  timestamp: string;
}

/** All metals prices from /api/metals/prices/all/latest */
export interface AllMetalPrices {
  gold: MetalPrice;
  silver: MetalPrice;
  platinum: MetalPrice;
  palladium: MetalPrice;
  exchangeRates: {
    eurToUsd: number | null;
    eurToChf: number | null;
  };
  timestamp: string;
}

/** Combined prices (all metals + gold extended) */
export interface MetalsPrices {
  all: AllMetalPrices;
  goldExtended: GoldExtendedPrices | null;
}

// ═══════════════════════════════════════════════════════════════
// Metals Item Types (computed with prices)
// ═══════════════════════════════════════════════════════════════

/** Metal item with computed valuations */
export interface MetalItemWithValuation {
  // From Convex
  _id: string;
  userId: string;
  catalogItemId?: string;
  customName?: string;
  metalType: MetalsType;
  category: "coin" | "bar" | "jewelry" | "scrap";
  purity: number;
  weightGrams: number;
  fineWeightGrams: number;
  quantity: number;
  buyPremium: number; // Premium when buying (e.g., 0.03 = 3%)
  sellPremium: number; // Premium/discount when selling (e.g., -0.02 = 2% below spot)
  purchasePricePerUnit?: number;
  purchaseDate?: string;
  purchaseCurrency?: string;
  storageLocation?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  // Enriched data
  displayName: string;
  catalogItem?: {
    name: string;
    country?: string;
    mint?: string;
    imageUrl?: string;
  };
  // Computed valuations (in user's preferred currency)
  currentBuyPrice: number; // What you'd pay to buy this item today (spot + buy premium)
  currentSellPrice: number; // What you'd receive selling today (spot + sell premium)
  marketValue: number; // Current value at sell price (what you could liquidate for)
  meltValue: number; // Pure metal value at spot price (no premium)
  buyPremiumValue: number; // Premium portion of buy price
  sellPremiumValue: number; // Premium/discount portion of sell price
  // P/L calculations
  totalCost: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
}

/** Summary totals by metal type */
export interface MetalSummary {
  totalFineWeightGrams: number;
  totalFineWeightOz: number;
  totalItems: number; // Total quantity
  itemCount: number; // Number of distinct items
  marketValue: number;
  meltValue: number;
  totalCost: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
}

/** Complete metals portfolio summary */
export interface MetalsSummary {
  gold: MetalSummary;
  silver: MetalSummary;
  platinum: MetalSummary;
  palladium: MetalSummary;
  totalMarketValue: number;
  totalMeltValue: number;
  totalCost: number | null;
  totalProfitLoss: number | null;
  totalProfitLossPercent: number | null;
  allocation: {
    gold: number; // Percentage
    silver: number;
    platinum: number;
    palladium: number;
  };
}
