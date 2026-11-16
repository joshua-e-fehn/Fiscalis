/**
 * Securities depots seen only through the bank account that pays for them.
 *
 * Some banks (DKB) settle every depot trade against the current account,
 * and the booking text carries the whole trade:
 *
 *   DKB AG - Depot 0511391062 Wertp.Abrechn. 16.11.2026 000002823074800
 *   WKN A2N812 Gesch.Art KV Stück 2,0000 BIT GL.TECH.LEAD. R-I ISIN
 *   DE000A2N8127
 *
 * A sale reads the same with Gesch.Art VV; DKB may book it to another of
 * the user's accounts (the Tagesgeldkonto), so a depot is keyed by its
 * number, never by the account.
 *
 * parseSecurityTrade reads that text; depotPositions folds the trades of
 * one depot into holdings (units and an average cost). Which price values
 * a holding is chosen from Yahoo listings by conservativeListing.
 *
 * What the account cannot show stays unknown: trades before the bank
 * history starts, transfers between depots, splits and fund mergers.
 * A sale of more units than the trades bought is such a gap; the holding
 * is then dropped rather than guessed.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

export type SecuritySide = "buy" | "sell";

export interface SecurityTrade {
  /** The depot number at the bank */
  depot: string;
  /** Trade date (YYYY-MM-DD) */
  tradeDate: string;
  /** The bank's reference number of the settlement */
  reference: string;
  wkn: string;
  isin: string;
  /** The bank's short name of the security */
  name: string;
  side: SecuritySide;
  /** Units traded, positive */
  quantity: number;
}

/**
 * Gesch.Art codes of a DKB settlement, as seen in real bookings: KV a
 * purchase, VV a sale. Any other code is not a trade we read.
 */
const SIDE_BY_CODE: Record<string, SecuritySide> = { KV: "buy", VV: "sell" };

const TRADE_TEXT =
  /Depot\s+(\d+)\s+Wertp\.?\s*Abrechn\.?\s+(\d{2})\.(\d{2})\.(\d{4})\s+(\d+)\s+WKN\s+([A-Z0-9]{6})\s+Gesch\.?\s*Art\s+([A-Z]{2})\s+St(?:ü|ue|u)ck\s+([\d.]*\d(?:,\d+)?)\s+(.+?)\s+ISIN\s+([A-Z]{2}[A-Z0-9]{9}\d)/i;

/** A German number ("1.234,5000") as a number; NaN when unreadable. */
function germanNumber(text: string): number {
  return Number(text.replace(/\./g, "").replace(",", "."));
}

/** The trade a booking text describes, or null when it is not one. */
export function parseSecurityTrade(text: string): SecurityTrade | null {
  const match = TRADE_TEXT.exec(text);
  if (!match) return null;
  const [, depot, day, month, year, reference, wkn, code, units, name, isin] =
    match;
  const side = SIDE_BY_CODE[code.toUpperCase()];
  const quantity = germanNumber(units);
  if (!side || !Number.isFinite(quantity) || quantity <= 0) return null;
  return {
    depot,
    tradeDate: `${year}-${month}-${day}`,
    reference,
    wkn: wkn.toUpperCase(),
    isin: isin.toUpperCase(),
    name: name.trim(),
    side,
    quantity,
  };
}

/** A parsed trade with the cash it moved on the account. */
export interface SettledSecurityTrade extends SecurityTrade {
  /** Cash paid (buy) or received (sell), positive, fees and taxes included */
  cash: number;
  currency: string;
}

export interface DepotPosition {
  depot: string;
  isin: string;
  wkn: string;
  name: string;
  quantity: number;
  /** Average cost of the units held, in `currency` (fees included) */
  cost: number;
  currency: string;
  /** Cash per unit of the latest buy, the fallback price */
  lastBuyPrice: number | null;
  lastTradeDate: string;
}

/** Units below this count as none (rounding of the bank's 4 decimals). */
const QUANTITY_EPSILON = 1e-6;

/**
 * The holdings the trades leave, per depot and ISIN, oldest trade first.
 * A buy adds its units and cash; a sale removes units at the average cost.
 * A sale of more than is held means trades are missing: that holding is
 * dropped, and so is one sold down to zero. Trades in another currency
 * than the holding's first are skipped.
 */
export function depotPositions(
  trades: readonly SettledSecurityTrade[],
): DepotPosition[] {
  const sorted = [...trades].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      a.reference.localeCompare(b.reference),
  );
  const positions = new Map<string, DepotPosition>();
  for (const trade of sorted) {
    const key = `${trade.depot}:${trade.isin}`;
    const current = positions.get(key);
    if (current && current.currency !== trade.currency) continue;
    if (trade.side === "buy") {
      positions.set(key, {
        depot: trade.depot,
        isin: trade.isin,
        wkn: trade.wkn,
        name: trade.name,
        quantity: (current?.quantity ?? 0) + trade.quantity,
        cost: (current?.cost ?? 0) + trade.cash,
        currency: trade.currency,
        lastBuyPrice: trade.cash / trade.quantity,
        lastTradeDate: trade.tradeDate,
      });
      continue;
    }
    if (!current || trade.quantity > current.quantity + QUANTITY_EPSILON) {
      positions.delete(key);
      continue;
    }
    const remaining = current.quantity - trade.quantity;
    if (remaining <= QUANTITY_EPSILON) {
      positions.delete(key);
      continue;
    }
    positions.set(key, {
      ...current,
      quantity: remaining,
      cost: current.cost * (remaining / current.quantity),
      lastTradeDate: trade.tradeDate,
    });
  }
  return [...positions.values()];
}

/** The key of a depot holding that survives re-syncs (snapshot flows). */
export function depotPositionKey(depot: string, isin: string): string {
  return `depot:${depot}:${isin}`;
}

// ═══════════════════════════════════════════════════════════════
// Prices (Yahoo Finance listings of an ISIN)
// ═══════════════════════════════════════════════════════════════

/** One exchange listing of a security, as read from Yahoo. */
export interface SecurityListing {
  symbol: string;
  price: number;
  currency: string;
  /** When the price was set (ms) */
  marketTime: number;
  /** Yahoo's quoteType: EQUITY, ETF, MUTUALFUND, ... */
  quoteType?: string;
}

/** A listing whose last price is older than this is not used. */
export const LISTING_MAX_AGE_MS = 7 * 86_400_000;

/** The currency a holding is preferably priced in. */
const PREFERRED_CURRENCY = "EUR";

/** A minor-unit quote (pence) in its major currency. */
function majorUnit(listing: SecurityListing): SecurityListing {
  if (listing.currency === "GBp" || listing.currency === "GBX") {
    return { ...listing, currency: "GBP", price: listing.price / 100 };
  }
  return listing;
}

/**
 * The listing that values a holding: the lowest recent price, so the
 * value is never the optimistic one (owner's choice, 2026-11-16). Listings
 * in EUR are preferred; without one, the lowest in the currency of the
 * first listing Yahoo ranks. Null when no listing has a recent price.
 */
export function conservativeListing(
  listings: readonly SecurityListing[],
  now: number,
): SecurityListing | null {
  const usable = listings
    .map(majorUnit)
    .filter(
      (l) =>
        Number.isFinite(l.price) &&
        l.price > 0 &&
        now - l.marketTime <= LISTING_MAX_AGE_MS,
    );
  if (usable.length === 0) return null;
  const currency = usable.some((l) => l.currency === PREFERRED_CURRENCY)
    ? PREFERRED_CURRENCY
    : usable[0].currency;
  return usable
    .filter((l) => l.currency === currency)
    .reduce((low, l) => (l.price < low.price ? l : low));
}

/**
 * The equities subcategory of a security from the quote types of its
 * listings: a fund when any listing calls it one (exchanges list active
 * funds as ETFs too), else an ETF, else a stock.
 */
export function securitySubcategory(
  quoteTypes: readonly (string | undefined)[],
): "funds" | "etfs" | "stocks" {
  const types = new Set(quoteTypes.map((t) => t?.toUpperCase()));
  if (types.has("MUTUALFUND")) return "funds";
  if (types.has("ETF")) return "etfs";
  return "stocks";
}
