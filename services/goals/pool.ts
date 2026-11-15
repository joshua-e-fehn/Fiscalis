/**
 * The shared pool of one goal metric, replayed from its dated lots and the
 * purchases charged to it (ENG-256).
 *
 * Every metric (new money invested, gains, each attested counter) keeps one
 * pool shared by all goals. Lots stay signed and dated: a goal sees the net
 * of every lot dated on or after its start, so a withdrawal or a loss
 * lowers every goal open at that time, and a goal started after a loss
 * does not count the recovery from it as new. Replayed in date order:
 *
 * - a positive lot first repays the pool's debt, and the rest is kept;
 * - a negative lot (a withdrawal, a loss) is kept as it is;
 * - a purchase draws what its goal's window holds (at most its charge)
 *   from the oldest positive lots dated on or after the goal's start (the
 *   ones younger goals cannot use anyway); the part of its charge the
 *   window cannot cover (a goal bought before it was earned) becomes debt.
 *
 * Debt is only repaid by later lots, so no goal sees new money again until
 * the pool is out of debt. Lots of a day come before that day's purchases.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import { roundMoney } from "../finance/financeService";
import type { Lot } from "./lots";

/** A purchase's charge to this pool. */
export interface PoolCharge {
  /** Identifies the charge in the result (a purchase id) */
  id: string;
  /** UTC day of the purchase, YYYY-MM-DD */
  date: string;
  /** Purchase time, orders purchases of the same day */
  at: number;
  /** UTC day the goal started: only lots dated on or after it may pay */
  startDate: string;
  /** Amount to draw, > 0 */
  amount: number;
}

export interface PoolState {
  /** Lots still in the pool, oldest first, signed */
  lots: Lot[];
  /** Owed by the pool, repaid by later lots, ≥ 0 */
  debt: number;
  /** Per charge: what the lots paid and what became debt */
  charges: Map<string, { drawn: number; shortfall: number }>;
}

const EPS = 1e-9;

type Event =
  | { type: "lot"; date: string; amount: number }
  | ({ type: "charge" } & PoolCharge);

/** Replay a metric's pool from its lots and charges. */
export function replayPool(lots: readonly Lot[], charges: readonly PoolCharge[]): PoolState {
  const events: Event[] = [
    ...lots.map((l) => ({ type: "lot" as const, ...l })),
    ...charges.map((c) => ({ type: "charge" as const, ...c })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.type === b.type ? 0 : a.type === "lot" ? -1 : 1) ||
      (a.type === "charge" && b.type === "charge" ? a.at - b.at : 0),
  );

  const kept: Lot[] = [];
  let debt = 0;
  const results = new Map<string, { drawn: number; shortfall: number }>();

  for (const e of events) {
    if (e.type === "lot") {
      let amount = e.amount;
      if (amount > 0) {
        const repay = Math.min(debt, amount);
        debt -= repay;
        amount -= repay;
      }
      if (Math.abs(amount) > EPS) kept.push({ date: e.date, amount });
      continue;
    }
    const window = kept
      .filter((l) => l.date >= e.startDate)
      .reduce((sum, l) => sum + l.amount, 0);
    const drawable = Math.max(0, Math.min(e.amount, window));
    let need = drawable;
    for (const lot of kept) {
      if (need <= EPS) break;
      if (lot.date < e.startDate || lot.amount <= 0) continue;
      const used = Math.min(lot.amount, need);
      lot.amount -= used;
      need -= used;
    }
    for (let i = kept.length - 1; i >= 0; i--) {
      if (Math.abs(kept[i].amount) <= EPS) kept.splice(i, 1);
    }
    const shortfall = e.amount - drawable > EPS ? e.amount - drawable : 0;
    debt += shortfall;
    results.set(e.id, {
      drawn: roundMoney(drawable),
      shortfall: roundMoney(shortfall),
    });
  }

  return {
    lots: kept.map((l) => ({ date: l.date, amount: roundMoney(l.amount) })),
    debt: roundMoney(debt),
    charges: results,
  };
}

/**
 * What a goal that started on `startDate` can use from a replayed pool: the
 * net of its window, negative when withdrawals or losses exceed it.
 */
export function availableSince(state: Pick<PoolState, "lots">, startDate: string): number {
  return roundMoney(
    state.lots.filter((l) => l.date >= startDate).reduce((sum, l) => sum + l.amount, 0),
  );
}
