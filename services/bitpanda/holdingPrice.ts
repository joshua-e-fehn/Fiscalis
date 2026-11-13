/**
 * Price of a Bitpanda holding across syncs.
 *
 * Bitpanda's ticker sometimes has no EUR price for a held asset (a delisted
 * coin, a ticker outage). Writing that through would value the holding at
 * nothing and drop it from net worth until the next good sync. Instead the
 * holding keeps the last price a sync saw, flagged stale with the time it
 * was priced, so net worth's `asOf` moves back to it
 * (frontend/convex/lib/netWorth.ts). A holding that was never priced stays
 * unvalued (`marketValue` undefined, never 0) and is flagged missing.
 */

import { roundMoney } from "../finance/financeService";

/** live: priced by this sync; stale: an earlier sync's price; missing: never priced */
export type HoldingPriceStatus = "live" | "stale" | "missing";

export interface HoldingPrice {
  /** EUR price per unit (the EUR rate for a fiat holding) */
  currentPrice: number | undefined;
  /** quantity × currentPrice in EUR, rounded to cents */
  marketValue: number | undefined;
  priceStatus: HoldingPriceStatus;
  /** When currentPrice was priced (ms); undefined when missing */
  priceAsOf: number | undefined;
}

/** The stored row of the same holding, from the sync before this one. */
export interface PreviousHoldingPrice {
  currentPrice?: number;
  /** When its price was taken; rows stored before priceAsOf existed pass their lastSyncAt */
  priceAsOf?: number;
}

function isPrice(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/**
 * Resolve a holding's price for this sync: the live ticker price when there
 * is one, else the previous row's price (stale), else none (missing).
 */
export function resolveHoldingPrice({
  quantity,
  livePrice,
  previous,
  now,
}: {
  quantity: number;
  livePrice: number | undefined;
  previous: PreviousHoldingPrice | undefined;
  now: number;
}): HoldingPrice {
  if (isPrice(livePrice)) {
    return {
      currentPrice: livePrice,
      marketValue: roundMoney(quantity * livePrice),
      priceStatus: "live",
      priceAsOf: now,
    };
  }
  if (previous && isPrice(previous.currentPrice)) {
    return {
      currentPrice: previous.currentPrice,
      marketValue: roundMoney(quantity * previous.currentPrice),
      priceStatus: "stale",
      priceAsOf: previous.priceAsOf,
    };
  }
  return {
    currentPrice: undefined,
    marketValue: undefined,
    priceStatus: "missing",
    priceAsOf: undefined,
  };
}
