/**
 * The vault ledger: `vaultTransactions` are the source of truth for what a
 * vault item holds. Replaying an item's transactions gives its quantity
 * over time, its average cost, its realized P/L and the dated flows the
 * continuous performance strategy needs. `vaultItems.quantity` and
 * `vaultItems.purchasePricePerUnit` are cached projections of the replay,
 * written by the same mutation that changes the ledger.
 *
 * Conventions:
 * - Cost is average cost per item: a buy adds its cost to the pool, a sale
 *   or gift removes `quantity × average cost`; realized P/L of a sale is
 *   `quantity × (proceeds per unit − average cost)`.
 * - All amounts are converted to the base currency (EUR) with the caller's
 *   `toBase`, so one item can mix purchase and sale currencies.
 * - A transaction without a date is an opening balance held since before
 *   any range (D3): it is never dated at record creation.
 * - A price is unknown only on an opening balance (an item entered without
 *   a purchase price); the item's cost is then unknown until it is sold out.
 *
 * Framework-free so the Convex bundle, Next.js and vitest can all import it.
 */

import type { HoldingData } from "../performance/types";

export type VaultTransactionType =
  | "buy"
  | "sell"
  | "gift_received"
  | "gift_given";

export interface LedgerTransaction {
  transactionType: VaultTransactionType;
  quantity: number;
  /** Per unit in `currency`; null/undefined: unknown (opening balance only) */
  pricePerUnit?: number | null;
  currency: string;
  /** ISO date; null/undefined: held since before any range (D3) */
  transactionDate?: string | null;
  /** Tie-breaker for transactions on the same day */
  createdAt?: number;
}

/** `amount` in `currency` expressed in EUR, or null when it cannot be. */
export type ToBaseAmount = (amount: number, currency: string) => number | null;

/** A dated change of the quantity held, as the history engine consumes it. */
export interface LedgerLot {
  /** When the quantity changed; null: held since before any range */
  timestamp: number | null;
  /** Signed: positive when bought or received, negative when sold or given */
  quantity: number;
  /**
   * EUR per unit of money moved: the cost of a buy, the proceeds of a sale.
   * Null for gifts and unknown prices: the flow is then the lot's value on
   * its date.
   */
  flowPricePerUnit: number | null;
  /** EUR cost per unit added to (or removed from) the cost basis; null unknown */
  costPerUnit: number | null;
}

export interface ItemLedger {
  /** Quantity held after the last transaction */
  quantity: number;
  /** EUR per unit held; null when nothing is held or the cost is unknown */
  averageCost: number | null;
  /** EUR cost of what is held (0 when nothing is); null when unknown */
  costBasis: number | null;
  /** EUR realized P/L of the sales whose cost and proceeds are known */
  realizedProfitLoss: number;
  /** False when a sale's cost or proceeds are unknown */
  realizedComplete: boolean;
  /** EUR cost of the units sold (the base of the realized P/L) */
  soldCost: number;
  /** In ledger order */
  lots: LedgerLot[];
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

const EPSILON = 1e-9;

export function isAcquisition(type: VaultTransactionType): boolean {
  return type === "buy" || type === "gift_received";
}

/** Quantity change of a transaction: + for buys/gifts received, − otherwise. */
export function signedQuantity(tx: LedgerTransaction): number {
  return isAcquisition(tx.transactionType) ? tx.quantity : -tx.quantity;
}

/** The transaction date as a timestamp; undefined without one. */
export function ledgerTimestamp(
  date: string | null | undefined,
): number | undefined {
  if (!date) return undefined;
  const ts = Date.parse(date);
  if (!Number.isFinite(ts)) {
    throw new LedgerError(`Invalid transaction date: ${date}`);
  }
  return ts;
}

/**
 * Validate what a mutation is about to write: quantity > 0, price ≥ 0 (or
 * unknown), a parseable date. Throws LedgerError.
 */
export function validateTransactionInput(tx: {
  quantity: number;
  pricePerUnit?: number | null;
  transactionDate?: string | null;
}): void {
  if (!Number.isFinite(tx.quantity) || tx.quantity <= 0) {
    throw new LedgerError("Quantity must be greater than 0");
  }
  if (
    tx.pricePerUnit != null &&
    (!Number.isFinite(tx.pricePerUnit) || tx.pricePerUnit < 0)
  ) {
    throw new LedgerError("Price per unit cannot be negative");
  }
  ledgerTimestamp(tx.transactionDate);
}

/** Ledger order: undated opening balances first, then by date, then creation. */
export function sortLedger<T extends LedgerTransaction>(txs: readonly T[]): T[] {
  return [...txs].sort((a, b) => {
    const ta = ledgerTimestamp(a.transactionDate) ?? -Infinity;
    const tb = ledgerTimestamp(b.transactionDate) ?? -Infinity;
    if (ta !== tb) return ta - tb;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

/**
 * Replay an item's transactions in ledger order. Throws LedgerError when a
 * transaction is invalid or the quantity held would become negative.
 */
export function replayLedger(
  txs: readonly LedgerTransaction[],
  toBase: ToBaseAmount,
): ItemLedger {
  let quantity = 0;
  /** Null: some unit held has an unknown cost */
  let cost: number | null = 0;
  let realizedProfitLoss = 0;
  let realizedComplete = true;
  let soldCost = 0;
  const lots: LedgerLot[] = [];

  for (const tx of sortLedger(txs)) {
    validateTransactionInput(tx);
    const timestamp = ledgerTimestamp(tx.transactionDate) ?? null;
    const unitAmount =
      tx.pricePerUnit != null ? toBase(tx.pricePerUnit, tx.currency) : null;

    if (isAcquisition(tx.transactionType)) {
      cost = cost !== null && unitAmount !== null
        ? cost + tx.quantity * unitAmount
        : null;
      quantity += tx.quantity;
      lots.push({
        timestamp,
        quantity: tx.quantity,
        flowPricePerUnit: tx.transactionType === "buy" ? unitAmount : null,
        costPerUnit: unitAmount,
      });
      continue;
    }

    if (tx.quantity > quantity + EPSILON) {
      throw new LedgerError(
        "Cannot sell or give away more than is held at that date",
      );
    }
    const averageCost = cost !== null && quantity > 0 ? cost / quantity : null;
    if (tx.transactionType === "sell") {
      if (averageCost !== null && unitAmount !== null) {
        realizedProfitLoss += tx.quantity * (unitAmount - averageCost);
        soldCost += tx.quantity * averageCost;
      } else {
        realizedComplete = false;
      }
    }
    quantity -= tx.quantity;
    cost = cost !== null && averageCost !== null
      ? cost - tx.quantity * averageCost
      : null;
    if (quantity <= EPSILON) {
      // Sold out: the next buy starts a new, known cost pool
      quantity = 0;
      cost = 0;
    }
    lots.push({
      timestamp,
      quantity: -tx.quantity,
      flowPricePerUnit: tx.transactionType === "sell" ? unitAmount : null,
      costPerUnit: averageCost,
    });
  }

  return {
    quantity,
    averageCost: quantity > 0 && cost !== null ? cost / quantity : null,
    costBasis: quantity > 0 ? cost : 0,
    realizedProfitLoss,
    realizedComplete,
    soldCost,
    lots,
  };
}

// ═══════════════════════════════════════════════════════════════
// Opening balances and the cached item projection
// ═══════════════════════════════════════════════════════════════

export interface VaultItemFields {
  quantity: number;
  purchasePricePerUnit?: number | null;
  purchaseDate?: string | null;
  purchaseCurrency?: string | null;
}

/**
 * The opening balance an item stored before every change went through the
 * ledger is missing: the cached quantity minus what the transactions add
 * up to, at the item's purchase price and date (undated when it has none,
 * or when that date lies after a recorded transaction). Null when the
 * ledger already accounts for the whole quantity (or for more of it, which
 * an opening balance cannot fix).
 */
export function missingOpeningTransaction(
  item: VaultItemFields,
  txs: readonly LedgerTransaction[],
): (LedgerTransaction & { isOpening: true }) | null {
  const recorded = txs.reduce((sum, tx) => sum + signedQuantity(tx), 0);
  const missing = item.quantity - recorded;
  if (missing <= EPSILON) return null;

  const purchased = ledgerTimestampOrUndefined(item.purchaseDate);
  const earliest = txs.reduce<number | undefined>((min, tx) => {
    const ts = ledgerTimestampOrUndefined(tx.transactionDate);
    return ts === undefined ? min : min === undefined ? ts : Math.min(min, ts);
  }, undefined);
  const dated =
    purchased !== undefined && (earliest === undefined || purchased <= earliest);

  return {
    transactionType: "buy",
    quantity: missing,
    pricePerUnit: item.purchasePricePerUnit ?? null,
    currency: item.purchaseCurrency ?? "EUR",
    transactionDate: dated ? item.purchaseDate : null,
    isOpening: true,
  };
}

function ledgerTimestampOrUndefined(date: string | null | undefined) {
  try {
    return ledgerTimestamp(date);
  } catch {
    return undefined;
  }
}

/**
 * The item's cached fields as the ledger defines them: quantity held and
 * average cost in EUR (absent when unknown).
 */
export function itemProjection(ledger: ItemLedger): {
  quantity: number;
  purchasePricePerUnit: number | undefined;
  purchaseCurrency: "EUR";
} {
  return {
    quantity: ledger.quantity,
    purchasePricePerUnit: ledger.averageCost ?? undefined,
    purchaseCurrency: "EUR",
  };
}

// ═══════════════════════════════════════════════════════════════
// Sale preview and totals
// ═══════════════════════════════════════════════════════════════

export interface SaleProfitLoss {
  proceeds: number;
  /** Average cost of the units sold; null when the item's cost is unknown */
  costBasis: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
}

/**
 * P/L of selling `quantity` units at `pricePerUnit` against the item's
 * average cost, as `replayLedger` realizes it.
 */
export function saleProfitLoss(
  averageCost: number | null | undefined,
  quantity: number,
  pricePerUnit: number,
): SaleProfitLoss {
  const proceeds = quantity * pricePerUnit;
  if (averageCost == null) {
    return { proceeds, costBasis: null, profitLoss: null, profitLossPercent: null };
  }
  const costBasis = quantity * averageCost;
  const profitLoss = proceeds - costBasis;
  return {
    proceeds,
    costBasis,
    profitLoss,
    profitLossPercent: costBasis > 0 ? (profitLoss / costBasis) * 100 : null,
  };
}

/** Sum of several sale previews; P/L null when any one's cost is unknown. */
export function sumSaleProfitLoss(sales: readonly SaleProfitLoss[]): SaleProfitLoss {
  const proceeds = sales.reduce((sum, s) => sum + s.proceeds, 0);
  if (sales.some((s) => s.costBasis === null)) {
    return { proceeds, costBasis: null, profitLoss: null, profitLossPercent: null };
  }
  const costBasis = sales.reduce((sum, s) => sum + (s.costBasis ?? 0), 0);
  const profitLoss = proceeds - costBasis;
  return {
    proceeds,
    costBasis,
    profitLoss,
    profitLossPercent: costBasis > 0 ? (profitLoss / costBasis) * 100 : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// History engine input
// ═══════════════════════════════════════════════════════════════

/**
 * An item's lots as continuous-strategy holdings: the quantity held at t is
 * the sum of the lots dated at or before t, each purchase or sale is a flow
 * at its EUR price (gifts at their value that day), and the cost line moves
 * by each lot's cost.
 */
export function ledgerHoldings(
  item: {
    id: string;
    metalType: string;
    fineWeightGrams: number;
    sellPremium: number;
  },
  lots: readonly LedgerLot[],
): HoldingData[] {
  return lots.map((lot, i) => ({
    id: `${item.id}:${i}`,
    assetType: item.metalType,
    quantity: lot.quantity,
    fineWeightGrams: item.fineWeightGrams,
    sellPremium: item.sellPremium,
    purchaseDate: lot.timestamp ?? undefined,
    purchasePricePerUnit: lot.flowPricePerUnit ?? undefined,
    purchaseCurrency: "EUR",
    costPerUnit: lot.costPerUnit,
  }));
}
