import type { InvestmentCurrency } from "./investments";

/**
 * A market quote currency: the price table's own columns (EUR, USD, CHF).
 * Quote widgets (the Prices tab, PriceChart) use it; holdings and summaries
 * are in the display currency (MetalsDisplayCurrency).
 */
export type MetalCurrency = "eur" | "usd" | "chf";

/** The currency vault holdings, summaries and P/L are shown in (the display currency). */
export type MetalsDisplayCurrency = InvestmentCurrency;

const METAL_QUOTE_CURRENCIES: readonly string[] = ["eur", "usd", "chf"] satisfies readonly MetalCurrency[];

/** A currency as a quote column; null when the price table has none for it (e.g. GBP). */
export function toMetalCurrency(currency: string): MetalCurrency | null {
  const code = currency.toLowerCase();
  return METAL_QUOTE_CURRENCIES.includes(code) ? (code as MetalCurrency) : null;
}

export type MetalType = "gold" | "silver" | "platinum" | "palladium";

/** Spot per troy ounce of each metal in one currency; null without a quote */
export type SpotQuotes = Record<MetalType, number | null>;

export interface MetalChartData {
  date: Date | null;
  /** null (or 0) where no price was recorded: a gap, never filled */
  price: number | null;
}
