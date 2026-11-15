/**
 * The shared pool of one goal metric, replayed from its dated lots and the
 * purchases charged to it (ENG-256).
 *
 * Every metric (new money invested, gains, each attested counter) keeps one
 * pool shared by all goals. Replayed in date order:
 *
 * - a positive lot first repays the pool's debt, and the rest is kept with
 *   its date;
 * - a negative lot (a withdrawal, a loss) takes from the newest kept lots
 *   first; what they cannot cover becomes debt;
 * - a purchase draws its charge from the oldest lots dated on or after its
 *   goal's start (the ones younger goals cannot use anyway); what they
 *   cannot cover (a goal bought before it was earned) becomes debt.
 *
 * Debt is only repaid by later lots, so a goal sees new money again once
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
  /** Lots still in the pool, oldest first, each > 0 */
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
      if (e.amount > 0) {
        const repay = Math.min(debt, e.amount);
        debt -= repay;
        const rest = e.amount - repay;
        if (rest > EPS) kept.push({ date: e.date, amount: rest });
      } else if (e.amount < 0) {
        let take = -e.amount;
        while (take > EPS && kept.length > 0) {
          const newest = kept[kept.length - 1];
          const used = Math.min(newest.amount, take);
          newest.amount -= used;
          take -= used;
          if (newest.amount <= EPS) kept.pop();
        }
        if (take > EPS) debt += take;
      }
      continue;
    }
    let need = e.amount;
    for (const lot of kept) {
      if (need <= EPS) break;
      if (lot.date < e.startDate) continue;
      const used = Math.min(lot.amount, need);
      lot.amount -= used;
      need -= used;
    }
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].amount <= EPS) kept.splice(i, 1);
    }
    const shortfall = need > EPS ? need : 0;
    debt += shortfall;
    results.set(e.id, {
      drawn: roundMoney(e.amount - shortfall),
      shortfall: roundMoney(shortfall),
    });
  }

  return {
    lots: kept.map((l) => ({ date: l.date, amount: roundMoney(l.amount) })),
    debt: roundMoney(debt),
    charges: results,
  };
}

/** What a goal that started on `startDate` can use from a replayed pool. */
export function availableSince(state: Pick<PoolState, "lots">, startDate: string): number {
  return roundMoney(
    state.lots.filter((l) => l.date >= startDate).reduce((sum, l) => sum + l.amount, 0),
  );
}
