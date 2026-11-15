/**
 * Live provider prices between full syncs (ENG-239).
 *
 * No new vendor: the prices come from the providers the app already uses.
 *
 * - Bitpanda's public ticker (no key, one request for every asset) every
 *   BITPANDA_TICKER_REFRESH_MINUTES, into the assetPrices table, then onto
 *   the Bitpanda holdings it prices.
 * - SnapTrade quotes for the symbols each user holds, hourly on weekdays
 *   during European and US trading hours (SNAPTRADE_QUOTES_CRON), one call
 *   per account and batch, within a per-user token bucket.
 *
 * Which holdings a feed re-prices is the PRICE_FEEDS seam
 * (services/performance/config.ts priceFeedFor). This module holds the pure
 * parts: reading the provider payloads, the sanity guard on a new price,
 * and the fields a re-priced row is patched with, computed exactly as the
 * sync computes them.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import { priceFromTicker } from "../bitpanda/normalize";
import { resolveHoldingPrice } from "../bitpanda/holdingPrice";
import { positionProfitLoss } from "../brokers/snaptradePosition";
import {
  normalizeCurrency,
  positionBaseFields,
  type FxRates,
} from "../finance/currency";
import { roundMoney } from "../finance/financeService";

// ═══════════════════════════════════════════════════════════════
// Schedule
// ═══════════════════════════════════════════════════════════════

/**
 * Minutes between Bitpanda ticker reads. The ticker is one public,
 * unauthenticated request for every listed asset; every 10 minutes is 144
 * requests a day, far inside what Bitpanda tolerates from one client.
 */
export const BITPANDA_TICKER_REFRESH_MINUTES = 10;

/**
 * SnapTrade quote refresh (UTC cron): at :05 past every hour from 07:05 to
 * 20:05, Monday to Friday. That spans Xetra and LSE (07:00/08:00 to 15:30/
 * 16:30 UTC) and NYSE/Nasdaq (13:30/14:30 to 20:00/21:00 UTC) in summer and
 * winter time; outside it the price would not move. 14 runs a day.
 */
export const SNAPTRADE_QUOTES_CRON = "5 7-20 * * 1-5";

/** Symbols per SnapTrade quotes request (comma-separated ids). */
export const QUOTE_BATCH_SIZE = 50;

/**
 * A stored live price older than this is not applied: the refresh writes a
 * holding only from a price read in the same run or the one before.
 */
export const LIVE_PRICE_MAX_AGE_MS = 30 * 60_000;

// ═══════════════════════════════════════════════════════════════
// Provider payloads
// ═══════════════════════════════════════════════════════════════

/** One stored live price. */
export interface LivePrice {
  symbol: string;
  /** Price per unit in `currency` */
  price: number;
  currency: string;
}

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Every EUR price on Bitpanda's ticker, read the way the sync reads it
 * (normalize.ts priceFromTicker), so a refresh and a sync agree.
 */
export function tickerPrices(
  ticker: Record<string, Record<string, string>>,
): LivePrice[] {
  const prices: LivePrice[] = [];
  for (const symbol of Object.keys(ticker)) {
    const price = priceFromTicker(ticker, symbol);
    if (isPrice(price)) {
      prices.push({ symbol: symbol.toUpperCase(), price, currency: "EUR" });
    }
  }
  return prices;
}

/** The fields of a SnapTrade quote (SymbolsQuotesInner) the refresh reads. */
export interface SnaptradeQuoteLike {
  symbol?: {
    id?: string | null;
    symbol?: string | null;
    currency?: { code?: string | null } | null;
  } | null;
  last_trade_price?: number | null;
  bid_price?: number | null;
  ask_price?: number | null;
}

/** A quote's price: the last trade, else the bid/ask midpoint. */
export function quotePrice(quote: SnaptradeQuoteLike): number | undefined {
  if (isPrice(quote.last_trade_price)) return quote.last_trade_price;
  if (isPrice(quote.bid_price) && isPrice(quote.ask_price)) {
    return (quote.bid_price + quote.ask_price) / 2;
  }
  return undefined;
}

/**
 * Quotes by SnapTrade universal symbol id, each with its currency. A quote
 * without an id, a price or a currency is dropped.
 */
export function quotePricesById(
  quotes: readonly SnaptradeQuoteLike[],
): Map<string, LivePrice> {
  const byId = new Map<string, LivePrice>();
  for (const quote of quotes) {
    const id = quote.symbol?.id;
    const currency = quote.symbol?.currency?.code;
    const price = quotePrice(quote);
    if (!id || !currency || price === undefined) continue;
    byId.set(id, {
      symbol: quote.symbol?.symbol ?? id,
      price,
      currency,
    });
  }
  return byId;
}

/** Split `items` into batches of at most `size`. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Applying a price
// ═══════════════════════════════════════════════════════════════

/**
 * Whether two currency codes name the same unit (GBp and GBX are both
 * pence; GBP is pounds). A quote in another unit than the position is not
 * applied: converting it would need the position's own FX handling.
 */
export function sameCurrencyUnit(a: string, b: string): boolean {
  const x = normalizeCurrency(a);
  const y = normalizeCurrency(b);
  return x !== null && y !== null && x.code === y.code && x.divisor === y.divisor;
}

/**
 * Whether a new price is plausible next to the stored one: within a factor
 * of 10 either way. A larger jump is far more often a unit mix-up (pence
 * for pounds, a quote for another listing) than a market move, and the
 * next full sync settles it.
 */
export function plausiblePriceMove(
  previous: number | undefined,
  next: number,
): boolean {
  if (!isPrice(next)) return false;
  if (!isPrice(previous)) return true;
  const ratio = next / previous;
  return ratio <= 10 && ratio >= 0.1;
}

/**
 * The fields a broker position is patched with at a new price in its own
 * currency: value, P/L and the base-currency fields, as the sync computes
 * them (brokers.ts replaceAccountHoldings).
 */
export function repricedPositionFields(
  position: { quantity: number; totalCostBasis?: number; currency: string },
  price: number,
  rates: FxRates,
) {
  const marketValue = roundMoney(position.quantity * price);
  const priced = {
    marketValue,
    totalCostBasis: position.totalCostBasis,
    currency: position.currency,
  };
  return {
    currentPrice: price,
    marketValue,
    ...positionProfitLoss(priced),
    ...positionBaseFields(priced, rates),
  };
}

/**
 * The fields a Bitpanda holding is patched with at a new EUR ticker price,
 * as the sync computes them (bitpanda.ts syncHoldings).
 */
export function repricedBitpandaFields(
  quantity: number,
  price: number,
  now: number,
) {
  const priced = resolveHoldingPrice({
    quantity,
    livePrice: price,
    previous: undefined,
    now,
  });
  return {
    currentPrice: priced.currentPrice,
    marketValue: priced.marketValue,
    valueInBaseCurrency: priced.marketValue,
    priceStatus: priced.priceStatus,
    priceAsOf: priced.priceAsOf,
  };
}
