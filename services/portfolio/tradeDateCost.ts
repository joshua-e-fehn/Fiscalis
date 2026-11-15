/**
 * Cost basis of a foreign-currency broker position in the base currency
 * (EUR) at the exchange rates of its trade dates.
 *
 * A broker reports the cost basis in the position's own currency
 * (totalCostBasis, e.g. USD). Converting all of it at today's rate
 * (services/finance/currency.ts positionBaseFields) books every exchange
 * rate move since the purchase as a change of cost, so the EUR P/L leaves
 * out the currency gain or loss while the snapshot flows, which convert
 * each trade at the rate of its date (flows.ts snaptradeActivityFlow),
 * include it. Here the position's trades are replayed instead: each buy
 * adds its native amount and that amount at the rate of its trade date,
 * a sell removes its share of both, and the EUR cost is the reported
 * native cost at the resulting blended rate. The broker stays the
 * authority on the native amount (fees, corporate actions it folds in);
 * the trades only say when the money went in.
 *
 * When the trades do not explain the position (no trades synced, units
 * transferred in, a split, a trade in another currency, a day without a
 * rate), the trade dates are unknown: the cost falls back to today's rate
 * and is flagged `estimated`.
 *
 * Framework-free: imported by the Convex loader (lib/netWorth.ts) and vitest.
 */

import type { ToBaseOn } from "./flows";

/** A synced SnapTrade activity (brokerTransactions row), as read here. */
export interface BrokerTrade {
  /** BUY | SELL | DIVIDEND | ...; only BUY and SELL move the cost book */
  type: string;
  quantity?: number | null;
  price?: number | null;
  /** Total amount, stored with either sign */
  amount: number;
  currency: string;
  /** ISO 8601 */
  tradeDate: string;
}

export interface TradeDateCost {
  /** Cost basis in the base currency */
  base: number;
  /** Converted at today's rate, because the trade dates are unknown */
  estimated: boolean;
}

/** Units held beyond (or short of) the trades' that are still rounding. */
const QUANTITY_TOLERANCE = 0.001;

/**
 * Native and EUR cost of the units the trades still account for, replayed
 * in date order (average cost: a sell removes its share of both). Null
 * when a trade cannot be costed: a BUY or SELL in another currency, a buy
 * without an amount or a rate.
 */
function replayCostBook(
  trades: readonly BrokerTrade[],
  currency: string,
  toBaseOn: ToBaseOn,
): { quantity: number; native: number; base: number } | null {
  const ordered = trades
    .filter((t) => {
      const type = t.type.toUpperCase();
      return type === "BUY" || type === "SELL";
    })
    .map((t) => ({ t, at: Date.parse(t.tradeDate) }))
    .sort((a, b) => a.at - b.at);
  const book = { quantity: 0, native: 0, base: 0 };
  for (const { t, at } of ordered) {
    if (!Number.isFinite(at)) return null;
    if (t.currency.toUpperCase() !== currency) return null;
    const quantity = Math.abs(t.quantity ?? 0);
    if (!(quantity > 0)) return null;
    if (t.type.toUpperCase() === "BUY") {
      // Some brokers report no amount on a trade: units × price instead
      const total = Math.abs(
        t.amount !== 0 ? t.amount : quantity * (t.price ?? 0),
      );
      if (!(total > 0)) return null;
      const base = toBaseOn(total, currency, t.tradeDate);
      if (base === null) return null;
      book.quantity += quantity;
      book.native += total;
      book.base += base;
    } else {
      // A sale of more than the book holds: units came in untraded
      if (quantity > book.quantity * (1 + QUANTITY_TOLERANCE)) return null;
      const kept = Math.max(0, 1 - quantity / book.quantity);
      book.quantity *= kept;
      book.native *= kept;
      book.base *= kept;
    }
  }
  return book;
}

/**
 * The EUR cost basis of a broker position from its own trades (see the
 * module comment), else `todayBase` (its cost at today's rate) flagged
 * estimated. `trades` are the account's activities for the position's
 * symbol; `toBaseOn` converts at the rate of a date (the nearest earlier
 * mirrored day, convex/fxRates.ts loadFxRates `asOf`). A position in the
 * base currency, or without a cost, is returned as `todayBase`, exact.
 */
export function tradeDateCostBasis(
  position: { quantity: number; totalCostBasis: number; currency: string },
  trades: readonly BrokerTrade[],
  toBaseOn: ToBaseOn,
  todayBase: number,
  baseCurrency = "EUR",
): TradeDateCost {
  const currency = position.currency.toUpperCase();
  const estimated = { base: todayBase, estimated: true };
  if (currency === baseCurrency || position.totalCostBasis === 0) {
    return { base: todayBase, estimated: false };
  }
  const book = replayCostBook(trades, currency, toBaseOn);
  if (book === null || !(book.native > 0) || !(book.quantity > 0)) {
    return estimated;
  }
  const held = Math.abs(position.quantity);
  if (Math.abs(held - book.quantity) > book.quantity * QUANTITY_TOLERANCE) {
    return estimated;
  }
  return {
    base: position.totalCostBasis * (book.base / book.native),
    estimated: false,
  };
}
