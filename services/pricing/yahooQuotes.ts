/**
 * Yahoo Finance as the price source of securities a bank depot holds
 * (services/banking/securityTrades.ts). Two public, keyless endpoints:
 * the search finds the listings of an ISIN, the chart endpoint gives each
 * listing's last price. The API is unofficial; a changed payload reads as
 * no listings, and the holding falls back to its cost.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import type { SecurityListing } from "../banking/securityTrades";

export const YAHOO_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";
export const YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart";

/** Listings priced per ISIN, each one chart request. */
export const MAX_LISTINGS_PER_ISIN = 6;

/** Hours between price refreshes; fund prices change once a day. */
export const SECURITY_PRICE_REFRESH_HOURS = 3;

export function yahooSearchUrl(isin: string): string {
  return `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(isin)}&quotesCount=${MAX_LISTINGS_PER_ISIN}&newsCount=0`;
}

export function yahooChartUrl(symbol: string): string {
  return `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
}

export interface YahooSearchHit {
  symbol: string;
  quoteType?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The listings a search response names, in Yahoo's order. */
export function searchHits(payload: unknown): YahooSearchHit[] {
  const quotes = isRecord(payload) ? payload.quotes : undefined;
  if (!Array.isArray(quotes)) return [];
  return quotes.flatMap((q) =>
    isRecord(q) && typeof q.symbol === "string" && q.symbol
      ? [
          {
            symbol: q.symbol,
            ...(typeof q.quoteType === "string" ? { quoteType: q.quoteType } : {}),
          },
        ]
      : [],
  );
}

/** A chart response's last price as a listing; null when it has none. */
export function chartListing(
  payload: unknown,
  quoteType?: string,
): SecurityListing | null {
  const chart = isRecord(payload) ? payload.chart : undefined;
  const result = isRecord(chart) && Array.isArray(chart.result) ? chart.result[0] : undefined;
  const meta = isRecord(result) ? result.meta : undefined;
  if (!isRecord(meta)) return null;
  const { symbol, regularMarketPrice, currency, regularMarketTime } = meta;
  if (
    typeof symbol !== "string" ||
    typeof regularMarketPrice !== "number" ||
    typeof currency !== "string" ||
    typeof regularMarketTime !== "number"
  ) {
    return null;
  }
  return {
    symbol,
    price: regularMarketPrice,
    currency,
    marketTime: regularMarketTime * 1000,
    ...(quoteType ? { quoteType } : {}),
  };
}
