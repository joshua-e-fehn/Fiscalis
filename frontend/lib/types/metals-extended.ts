/**
 * Types for precious metals tracking
 */

import type { MetalCurrency, MetalType } from "./metals";

// ═══════════════════════════════════════════════════════════════
// Price Types (the latest snapshot from convex/metalPrices.ts)
// ═══════════════════════════════════════════════════════════════

/** Aliases of the one definition in lib/types/metals.ts */
export type MetalsCurrency = MetalCurrency;
export type MetalsType = MetalType;

/** Base metal price in all currencies */
export interface MetalPrice {
  eur: number;
  usd: number;
  chf: number | null;
}

/** All metals in EUR/USD/CHF with the EUR rates (hooks/metals.ts useMetalsPrices) */
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

/** The latest prices, as useMetalsPrices serves them */
export interface MetalsPrices {
  all: AllMetalPrices;
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
  quantity: number; // Held, from the transaction ledger
  buyPremium: number; // Premium when buying (e.g., 0.03 = 3%)
  sellPremium: number; // Premium/discount when selling (e.g., -0.02 = 2% below spot)
  purchasePricePerUnit?: number; // Average cost per unit held, in purchaseCurrency (the display currency)
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
  marketValue: number | null; // Value at sell price (what you could liquidate for); null when unknown (no spot, no cost)
  meltValue: number; // Pure metal value at spot price (no premium)
  buyPremiumValue: number; // Premium portion of buy price
  sellPremiumValue: number; // Premium/discount portion of sell price
  // P/L calculations
  totalCost: number | null;
  profitLoss: number | null; // Unrealized
  profitLossPercent: number | null;
  /** Valued at a fresh spot price; false: at cost (stale or missing spot) */
  pricedAtSpot: boolean;
  /** Ledger (services/finance/metalsLedger.ts), EUR (sale previews); an
   * unreplayable item's cached cost converted into EUR, null without a rate */
  averageCost: number | null;
  /** Realized P/L of the item's sales, display currency; null when unknown */
  realizedProfitLoss: number | null;
  /** Average cost of the units the item sold, display currency */
  soldCost: number;
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
