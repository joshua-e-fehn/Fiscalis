import type { InvestmentCurrency } from "./investments";

/**
 * A market quote currency: the price table's own columns (EUR, USD, CHF).
 * Quote widgets (the Prices tab, PriceChart) use it; holdings and summaries
 * are in the display currency (MetalsDisplayCurrency).
 */
export type MetalCurrency = "eur" | "usd" | "chf";

/** The currency vault holdings, summaries and P/L are shown in (the display currency). */
export type MetalsDisplayCurrency = InvestmentCurrency;

export type MetalType = "gold" | "silver" | "platinum" | "palladium";

/** Spot per troy ounce of each metal in one currency; null without a quote */
export type SpotQuotes = Record<MetalType, number | null>;

export interface MetalChartData {
  date: Date | null;
  /** null (or 0) where no price was recorded: a gap, never filled */
  price: number | null;
}
