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
 * The snapshot writer books a holding that appears as money in at its whole
 * value (aggregate.ts sourceFlowFromHoldings), which keeps performance
 * honest but would make connecting an account already owned look like new
 * investing. So the caller passes baselines: the days a source gained
 * holdings that were already owned (a broker or Bitpanda connection added,
 * a manual asset recorded, a vault opening balance). On the snapshot day
 * that covers a baseline, that source's flow is left out of the invested
 * lot; it stays out of gains as well, since gains are change less flow.
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

/** A day a source gained holdings that were already owned. */
export interface LotBaseline {
  /** UTC day, YYYY-MM-DD */
  date: string;
  /** The snapshot source, aggregate.ts HoldingSource (e.g. "bitpanda") */
  source: string;
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
export function investmentLots(
  snapshots: readonly SnapshotForLots[],
  baselines: readonly LotBaseline[] = [],
): InvestmentLots {
  const days = dailySnapshots(snapshots);
  const invested: Lot[] = [];
  const gains: Lot[] = [];
  const estimatedDates: string[] = [];
  const owned = ownedSourcesByDay(days, baselines);
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1].categoryBreakdown;
    const cur = days[i].categoryBreakdown;
    if (!prev || !cur) continue;
    const sources = owned.get(i) ?? new Set<string>();
    let flow = 0;
    let ownedFlow = 0;
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
      for (const source of sources) ownedFlow += sourceFlow(before, after, source);
    }
    const date = days[i].date;
    flow = roundMoney(flow);
    const gain = roundMoney(change - flow);
    const added = roundMoney(flow - ownedFlow);
    if (added !== 0) invested.push({ date, amount: added });
    if (gain !== 0) gains.push({ date, amount: gain });
    if (estimated) estimatedDates.push(date);
  }
  return { invested, gains, estimatedDates };
}

/** A source's value across the goal categories of one row. */
function sourceValue(row: SnapshotForLots, source: string): number {
  let value = 0;
  for (const c of row.categoryBreakdown ?? []) {
    if (!(GOAL_INVESTMENT_CATEGORIES as readonly string[]).includes(c.category)) continue;
    value += c.sources?.find((s) => s.source === source)?.value ?? 0;
  }
  return value;
}

/**
 * Per day index, the sources whose flow that day moved holdings already
 * owned: the day covering each baseline, and, for a reconnect, the day
 * the same source last dropped to nothing before it (the disconnect), so
 * removing and re-adding an account nets out instead of leaving its whole
 * value as money taken out.
 */
function ownedSourcesByDay(
  days: readonly SnapshotForLots[],
  baselines: readonly LotBaseline[],
): Map<number, Set<string>> {
  const owned = new Map<number, Set<string>>();
  const mark = (i: number, source: string) => {
    const set = owned.get(i) ?? new Set<string>();
    set.add(source);
    owned.set(i, set);
  };
  for (const b of baselines) {
    const j = days.findIndex((d, i) => i > 0 && d.date >= b.date && days[i - 1].date < b.date);
    if (j < 1) continue;
    mark(j, b.source);
    // Walk back over the days the source held nothing to the one it emptied
    for (let i = j - 1; i >= 1; i--) {
      if (sourceValue(days[i], b.source) !== 0) break;
      if (sourceValue(days[i - 1], b.source) !== 0) {
        mark(i, b.source);
        break;
      }
    }
  }
  return owned;
}

/**
 * A source's flow within a category between two rows: the one the writer
 * stored, else its change in value (a source that appears brings its value).
 */
function sourceFlow(
  before: SnapshotCategoryEntry | undefined,
  after: SnapshotCategoryEntry | undefined,
  source: string,
): number {
  const cur = after?.sources?.find((s) => s.source === source);
  if (cur?.netFlow !== undefined) return cur.netFlow;
  const prev = before?.sources?.find((s) => s.source === source);
  return (cur?.value ?? 0) - (prev?.value ?? 0);
}
