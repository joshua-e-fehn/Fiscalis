/**
 * Exact external flows from the providers' trade logs (D21).
 *
 * A snapshot's flow is otherwise derived holding by holding from the change
 * in cost basis (aggregate.ts holdingNetFlow), which estimates a sale's
 * proceeds at the previous value. Where a source keeps a dated trade log,
 * the money actually paid or received is known instead:
 *
 * - Bitpanda: bitpandaTransactions, the fiat amount at the rate of the
 *   transaction date;
 * - vault: vaultTransactions, quantity × pricePerUnitBase (EUR at the rate
 *   of the transaction date), so a sale's proceeds are the actual ones;
 * - SnapTrade: brokerTransactions, the account activities synced from the
 *   broker, at the rate of the trade date.
 *
 * Each trade is mapped to the key of the holding it moved (the snapshot
 * holding key, NormalizedHolding.key), and tradeFlowsBetween sums them per
 * key over the interval between two snapshots. A holding held at the
 * previous snapshot with a trade in the interval takes that exact flow; one
 * without, or one that appeared since (its full value came in), keeps the
 * cost proxy (aggregate.ts sourceFlowFromHoldings).
 *
 * Framework-free: imported by Convex functions and vitest.
 */

/** One dated flow into a holding, from a provider's trade log. */
export interface TradeFlow {
  /** Snapshot key of the holding the trade moved (NormalizedHolding.key) */
  key: string;
  /** When the trade happened (ISO date or date-time; a bare date is UTC midnight) */
  date: string;
  /**
   * Money put in (> 0, a purchase) or taken out (< 0, a sale), in the base
   * currency; 0 for a trade that moves no money (a reward, a split); null
   * when the amount or its exchange rate is unknown.
   */
  amount: number | null;
}

/** A provider amount in the base currency at the rate of `date`; null without a rate. */
export type ToBaseOn = (
  amount: number,
  currency: string,
  date: string,
) => number | null;

/**
 * Net exact flow per holding key over the trades dated in (from, to] (ms).
 * A key with a trade of unknown amount in the interval is left out, so its
 * holding falls back to the cost proxy rather than taking a partial sum.
 */
export function tradeFlowsBetween(
  flows: readonly TradeFlow[],
  from: number,
  to: number,
): Map<string, number> {
  const sums = new Map<string, number>();
  const unknown = new Set<string>();
  for (const f of flows) {
    const t = Date.parse(f.date);
    if (!Number.isFinite(t) || t <= from || t > to) continue;
    if (f.amount === null || !Number.isFinite(f.amount)) {
      unknown.add(f.key);
      continue;
    }
    sums.set(f.key, (sums.get(f.key) ?? 0) + f.amount);
  }
  for (const key of unknown) sums.delete(key);
  return sums;
}

// ═══════════════════════════════════════════════════════════════
// Holding keys (the identity a holding keeps across provider syncs)
// ═══════════════════════════════════════════════════════════════

/** Key of a SnapTrade position: positions are replaced on every sync, the account and symbol stay. */
export function brokerPositionKey(accountId: string, symbol: string): string {
  return `brokerPosition:${accountId}:${symbol}`;
}

/** Key of a Bitpanda holding: holdings are replaced on every sync, the connection and asset stay. */
export function bitpandaHoldingKey(
  connectionId: string,
  assetType: string,
  symbol: string,
): string {
  return `bitpanda:${connectionId}:${assetType}:${symbol.toUpperCase()}`;
}

/**
 * The holding key each Bitpanda (connection, symbol) trades into, from the
 * keys of the holdings held now and at the previous snapshot (a holding
 * sold out is only in the latter). A transaction's asset type uses another
 * vocabulary than the holding's (commodity vs metal), so trades are matched
 * on connection and symbol only, the way their average cost is
 * (categorySummary.ts averageCostPerUnit). A symbol held under two asset
 * types is ambiguous and left out.
 */
export function bitpandaTradeKeys(
  holdingKeys: Iterable<string>,
): Map<string, string> {
  const keys = new Map<string, string | null>();
  for (const key of new Set(holdingKeys)) {
    const parts = key.split(":");
    if (parts[0] !== "bitpanda" || parts.length < 4) continue;
    const at = `${parts[1]}:${parts.slice(3).join(":")}`;
    keys.set(at, keys.has(at) ? null : key);
  }
  return new Map(
    [...keys].filter((e): e is [string, string] => e[1] !== null),
  );
}

// ═══════════════════════════════════════════════════════════════
// Trade logs → flows
// ═══════════════════════════════════════════════════════════════

/**
 * A signed base amount from a provider's total, which may be stored with
 * either sign: its absolute value, converted, null when absent or zero.
 */
function signedBase(
  sign: 1 | -1,
  total: number | null | undefined,
  currency: string,
  date: string,
  toBaseOn: ToBaseOn,
): number | null {
  if (total == null || !Number.isFinite(total) || total === 0) return null;
  const base = toBaseOn(Math.abs(total), currency, date);
  return base === null ? null : sign * base;
}

/**
 * The flow of one Bitpanda transaction (bitpandaTransactions row) into the
 * holding `keys` resolves it to (bitpandaTradeKeys); null when it moves no
 * holding of a flow-adjusted kind it can be matched to, or carries no flow
 * information (a transfer between own wallets, "other").
 */
export function bitpandaTradeFlow(
  tx: {
    connectionId: string;
    type: string;
    symbol: string;
    amount: number;
    currency: string;
    transactionDate: string;
  },
  keys: ReadonlyMap<string, string>,
  toBaseOn: ToBaseOn,
): TradeFlow | null {
  const key = keys.get(`${tx.connectionId}:${tx.symbol.toUpperCase()}`);
  if (key === undefined) return null;
  const at = (amount: number | null): TradeFlow => ({
    key,
    date: tx.transactionDate,
    amount,
  });
  const money = (sign: 1 | -1) =>
    signedBase(sign, tx.amount, tx.currency, tx.transactionDate, toBaseOn);
  switch (tx.type) {
    case "buy":
    case "deposit":
      return at(money(1));
    case "sell":
    case "withdrawal":
      return at(money(-1));
    case "reward":
      // Units received for nothing: performance, not money put in
      return at(0);
    default:
      return null;
  }
}

/**
 * The flow of one vault ledger row (vaultTransactions) into its item: the
 * quantity at its EUR price of the transaction date, so a sale counts its
 * actual proceeds. A gift moves the metal at its stated value. Null for a
 * row without a date (an opening balance held before any range).
 */
export function vaultTradeFlow(tx: {
  vaultItemId: string;
  transactionType: "buy" | "sell" | "gift_received" | "gift_given";
  quantity: number;
  pricePerUnitBase?: number | null;
  transactionDate?: string | null;
}): TradeFlow | null {
  if (!tx.transactionDate) return null;
  const sign =
    tx.transactionType === "buy" || tx.transactionType === "gift_received"
      ? 1
      : -1;
  const price = tx.pricePerUnitBase;
  return {
    key: tx.vaultItemId,
    date: tx.transactionDate,
    amount:
      price == null || !Number.isFinite(price)
        ? null
        : sign * Math.abs(tx.quantity) * price,
  };
}

/** SnapTrade activity types that change a position without money moving in or out. */
const SNAPTRADE_NO_FLOW_TYPES = new Set(["REI", "STOCK_DIVIDEND", "SPLIT"]);
/** SnapTrade activity types that move a position by an amount that is not known. */
const SNAPTRADE_UNKNOWN_FLOW_TYPES = new Set([
  "TRANSFER",
  "EXTERNAL_ASSET_TRANSFER_IN",
  "EXTERNAL_ASSET_TRANSFER_OUT",
  "ADJUSTMENT",
]);

/**
 * The flow of one SnapTrade account activity (brokerTransactions row) into
 * its position: a BUY is money in at its amount, a SELL money out, at the
 * rate of the trade date; a reinvested dividend, stock dividend or split is
 * no flow; a transfer of units has no known amount. Null for an activity
 * without a symbol (cash: contributions, withdrawals, dividends, fees),
 * since cash is not flow-adjusted, and for any other type.
 */
export function snaptradeActivityFlow(
  tx: {
    accountId: string;
    type: string;
    symbol?: string | null;
    amount: number;
    quantity?: number | null;
    price?: number | null;
    currency: string;
    tradeDate: string;
  },
  toBaseOn: ToBaseOn,
): TradeFlow | null {
  if (!tx.symbol) return null;
  const type = tx.type.toUpperCase();
  const at = (amount: number | null): TradeFlow => ({
    key: brokerPositionKey(tx.accountId, tx.symbol!),
    date: tx.tradeDate,
    amount,
  });
  // Some brokers report no amount on a trade: units × price instead
  const total =
    tx.amount !== 0
      ? tx.amount
      : tx.quantity != null && tx.price != null
        ? tx.quantity * tx.price
        : null;
  if (type === "BUY" || type === "SELL") {
    return at(
      signedBase(type === "BUY" ? 1 : -1, total, tx.currency, tx.tradeDate, toBaseOn),
    );
  }
  if (SNAPTRADE_NO_FLOW_TYPES.has(type)) return at(0);
  if (SNAPTRADE_UNKNOWN_FLOW_TYPES.has(type)) return at(null);
  return null;
}
