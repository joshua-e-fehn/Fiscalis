/**
 * The dated lots of the tracked goal metrics, read from the daily
 * portfolio snapshots (ENG-256).
 *
 * Between two consecutive days, for every investment category:
 *
 * - invested lot = the net external flow into the category, the money put
 *   in (> 0) or taken out (< 0). This is the flow the snapshot writer
 *   stores from the providers' trade logs (services/portfolio/flows.ts),
 *   read through aggregate.ts snapshotCategoryFlow like the performance
 *   charts, so goals and performance agree on what was money moved;
 * - gains lot = the change in value less that flow, the performance.
 *
 * Summed over the categories, moving money between investments (selling
 * one ETF to buy another) nets out, while selling to cash is money out.
 * Each lot is dated by the later day. A lot whose flow had to be estimated
 * (rows without stored flows) is flagged, so the UI can say so.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import {
  snapshotCategoryFlow,
  type SnapshotCategoryEntry,
} from "../portfolio/aggregate";
import { roundMoney } from "../finance/financeService";

/**
 * The categories whose new money and gains count for goals: market
 * investments held at brokers, Bitpanda and the vault. Cash (saving is not
 * investing), liabilities, and manually appraised real estate and
 * collectibles are left out; so is "unclassified".
 */
export const GOAL_INVESTMENT_CATEGORIES = [
  "equities",
  "bonds",
  "crypto",
  "commodities",
] as const;

/** One dated amount of a metric: money in EUR, or an attested count. */
export interface Lot {
  /** UTC day, YYYY-MM-DD */
  date: string;
  /** Signed: > 0 adds to the pool, < 0 takes from it */
  amount: number;
}

export interface SnapshotForLots {
  date: string;
  timestamp: number;
  categoryBreakdown?: readonly SnapshotCategoryEntry[];
}

export interface InvestmentLots {
  invested: Lot[];
  gains: Lot[];
  /** Days whose flow was estimated rather than derived */
  estimatedDates: string[];
}

/** The newest snapshot of each day, oldest day first. */
export function dailySnapshots<T extends SnapshotForLots>(snapshots: readonly T[]): T[] {
  const byDay = new Map<string, T>();
  for (const s of snapshots) {
    const kept = byDay.get(s.date);
    if (!kept || s.timestamp > kept.timestamp) byDay.set(s.date, s);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The invested and gains lots of each day after the first snapshot. A day
 * whose row (or the previous one) has no category breakdown yields no lot:
 * nothing about it can be split into money and performance.
 */
export function investmentLots(snapshots: readonly SnapshotForLots[]): InvestmentLots {
  const days = dailySnapshots(snapshots);
  const invested: Lot[] = [];
  const gains: Lot[] = [];
  const estimatedDates: string[] = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1].categoryBreakdown;
    const cur = days[i].categoryBreakdown;
    if (!prev || !cur) continue;
    let flow = 0;
    let change = 0;
    let estimated = false;
    for (const category of GOAL_INVESTMENT_CATEGORIES) {
      const before = prev.find((c) => c.category === category);
      const after = cur.find((c) => c.category === category);
      if (!before && !after) continue;
      const f = snapshotCategoryFlow(before, after);
      flow += f.amount;
      estimated ||= f.estimated;
      change += (after?.value ?? 0) - (before?.value ?? 0);
    }
    const date = days[i].date;
    flow = roundMoney(flow);
    const gain = roundMoney(change - flow);
    if (flow !== 0) invested.push({ date, amount: flow });
    if (gain !== 0) gains.push({ date, amount: gain });
    if (estimated) estimatedDates.push(date);
  }
  return { invested, gains, estimatedDates };
}
