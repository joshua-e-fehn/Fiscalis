/**
 * Goal evaluation: progress, eligibility and purchase charges (ENG-256).
 *
 * evaluateGoals replays every metric's shared pool (pool.ts) from its lots
 * (lots.ts for money and gains, attested counter entries) and the charges
 * of the goals already bought, then evaluates each open goal's rule
 * (rules.ts) against what its own start date lets it use. planPurchase
 * evaluates one goal at the price actually paid, against the same pools,
 * and returns the charges to store with the purchase.
 *
 * Deterministic: the same data always gives the same verdict.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import { roundMoney } from "../finance/financeService";
import type { Lot } from "./lots";
import { availableSince, replayPool, type PoolState } from "./pool";
import {
  isGroup,
  type RuleLeaf,
  type RuleNode,
  type RuleTarget,
} from "./rules";

// ═══════════════════════════════════════════════════════════════
// Inputs
// ═══════════════════════════════════════════════════════════════

/** A pool: "invested", "gains", or one attested counter tracker. */
export type MetricKey = "invested" | "gains" | `counter:${string}`;

export function counterMetric(trackerId: string): MetricKey {
  return `counter:${trackerId}`;
}

export interface MetricCharge {
  metric: MetricKey;
  amount: number;
}

export interface GoalPurchase {
  /** UTC day bought, YYYY-MM-DD */
  date: string;
  /** When it was recorded, orders purchases of one day */
  at: number;
  /** What the purchase draws from each pool (planPurchase) */
  charges: readonly MetricCharge[];
}

export interface GoalForEvaluation {
  id: string;
  status: "active" | "bought" | "archived";
  /** UTC day the goal started, YYYY-MM-DD */
  startDate: string;
  /** Price in the goal's currency */
  price: number;
  /** EUR per unit of the goal's currency, for price and fixed amounts */
  rate: number;
  rule: RuleNode;
  /** Ticked checklist item ids */
  checklistDone: readonly string[];
  purchase?: GoalPurchase;
}

export interface TrackerEntry {
  trackerId: string;
  /** UTC day, YYYY-MM-DD */
  date: string;
  /** A counter's +N, or a measurement's reading */
  value: number;
}

export interface TrackerInfo {
  kind: "count" | "measurement";
}

export interface EvaluationInput {
  /** UTC day, YYYY-MM-DD */
  today: string;
  investedLots: readonly Lot[];
  gainsLots: readonly Lot[];
  /** Latest net worth, EUR; null when there is none */
  netWorth: number | null;
  trackers: ReadonlyMap<string, TrackerInfo>;
  entries: readonly TrackerEntry[];
  goals: readonly GoalForEvaluation[];
}

// ═══════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════

export type LeafUnit = "money" | "count" | "days" | "periods" | "items" | "value";

export interface LeafResult {
  /** Position in the tree, e.g. "1.0" (child 1 of the root, then child 0) */
  path: string;
  kind: RuleLeaf["kind"];
  /** Where it stands, in `unit` (money in EUR) */
  current: number;
  /** What it needs, in `unit` (money in EUR); for an atMost measurement the ceiling */
  target: number;
  unit: LeafUnit;
  satisfied: boolean;
  /** 0..1 */
  progress: number;
  /** Consumed on purchase (invested, gains, counter) */
  consumable: boolean;
}

export interface RuleResult {
  satisfied: boolean;
  /** 0..1 */
  progress: number;
  /** What buying now would draw, per pool, along the branches chosen */
  charges: MetricCharge[];
  leaves: LeafResult[];
}

export interface GoalEvaluation extends RuleResult {
  id: string;
  /** For a bought goal: what its purchase drew and what became debt */
  purchase?: {
    charges: { metric: MetricKey; amount: number; drawn: number; shortfall: number }[];
    earned: boolean;
  };
}

export interface EvaluationResult {
  goals: GoalEvaluation[];
  /** Debt per pool after every purchase, > 0 only */
  debts: MetricCharge[];
}

// ═══════════════════════════════════════════════════════════════
// Dates
// ═══════════════════════════════════════════════════════════════

const DAY_MS = 86_400_000;

function dayMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (UTC days). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS);
}

/** The key of the week (its Monday) or month a day falls in. */
export function periodKey(date: string, period: "week" | "month"): string {
  if (period === "month") return date.slice(0, 7);
  const ms = dayMs(date);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return isoDay(ms - weekday * DAY_MS);
}

/** Every period key from the one `from` falls in to the one `to` falls in. */
function periodKeys(from: string, to: string, period: "week" | "month"): string[] {
  const keys: string[] = [];
  if (period === "week") {
    for (let ms = dayMs(periodKey(from, "week")); ms <= dayMs(to); ms += 7 * DAY_MS) {
      keys.push(isoDay(ms));
    }
    return keys;
  }
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) break;
    keys.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

// ═══════════════════════════════════════════════════════════════
// Rule evaluation
// ═══════════════════════════════════════════════════════════════

export interface RuleContext {
  /** Price in EUR */
  priceEur: number;
  /** EUR per unit of the goal's currency */
  rate: number;
  startDate: string;
  today: string;
  /** What this goal may use from a pool */
  available: (metric: MetricKey) => number;
  netWorth: number | null;
  /** A tracker's entries dated on or after the start, oldest first */
  entries: (trackerId: string) => readonly TrackerEntry[];
  checklistDone: ReadonlySet<string>;
}

const EPS = 1e-6;

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

function targetEur(target: RuleTarget, ctx: RuleContext): number {
  return roundMoney(
    target.kind === "priceMultiple" ? target.multiple * ctx.priceEur : target.amount * ctx.rate,
  );
}

function mergeCharges(lists: readonly MetricCharge[][]): MetricCharge[] {
  const sums = new Map<MetricKey, number>();
  for (const list of lists) {
    for (const c of list) sums.set(c.metric, (sums.get(c.metric) ?? 0) + c.amount);
  }
  return [...sums].map(([metric, amount]) => ({ metric, amount: roundMoney(amount) }));
}

function fits(charges: readonly MetricCharge[], ctx: RuleContext): boolean {
  return charges.every((c) => c.amount <= ctx.available(c.metric) + EPS);
}

function longestStreak(
  entries: readonly TrackerEntry[],
  leaf: Extract<RuleLeaf, { kind: "streak" }>,
  ctx: RuleContext,
): number {
  const perPeriod = new Map<string, number>();
  for (const e of entries) {
    const key = periodKey(e.date, leaf.period);
    perPeriod.set(key, (perPeriod.get(key) ?? 0) + e.value);
  }
  let run = 0;
  let best = 0;
  for (const key of periodKeys(ctx.startDate, ctx.today, leaf.period)) {
    if ((perPeriod.get(key) ?? 0) >= leaf.perPeriod - EPS) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

function evaluateLeaf(
  leaf: RuleLeaf,
  path: string,
  ctx: RuleContext,
): RuleResult {
  const result = (
    current: number,
    target: number,
    unit: LeafUnit,
    charges: MetricCharge[] = [],
    satisfied = current >= target - EPS,
    progress = clamp01(current / target),
  ): RuleResult => ({
    satisfied,
    progress: satisfied ? 1 : progress,
    charges,
    leaves: [
      {
        path,
        kind: leaf.kind,
        current: unit === "money" ? roundMoney(current) : current,
        target,
        unit,
        satisfied,
        progress: satisfied ? 1 : progress,
        consumable: charges.length > 0,
      },
    ],
  });

  switch (leaf.kind) {
    case "invested":
    case "gains": {
      const target = targetEur(leaf.target, ctx);
      return result(ctx.available(leaf.kind), target, "money", [
        { metric: leaf.kind, amount: target },
      ]);
    }
    case "netWorth":
      return result(ctx.netWorth ?? 0, roundMoney(leaf.amount * ctx.rate), "money");
    case "cooldown":
      return result(Math.max(0, daysBetween(ctx.startDate, ctx.today)), leaf.days, "days");
    case "counter": {
      const metric = counterMetric(leaf.trackerId);
      return result(ctx.available(metric), leaf.count, "count", [
        { metric, amount: leaf.count },
      ]);
    }
    case "streak":
      return result(longestStreak(ctx.entries(leaf.trackerId), leaf, ctx), leaf.periods, "periods");
    case "checklist": {
      const done = leaf.items.filter((i) => ctx.checklistDone.has(i.id)).length;
      return result(done, leaf.items.length, "items");
    }
    case "measurement": {
      const values = ctx.entries(leaf.trackerId).map((e) => e.value);
      const atLeast = leaf.comparison === "atLeast";
      if (values.length === 0) return result(0, leaf.value, "value", [], false, 0);
      const reading =
        leaf.basis === "latest"
          ? values[values.length - 1]
          : atLeast
            ? Math.max(...values)
            : Math.min(...values);
      const satisfied = atLeast ? reading >= leaf.value - EPS : reading <= leaf.value + EPS;
      const progress = atLeast
        ? clamp01(reading / leaf.value)
        : reading <= 0
          ? 1
          : clamp01(leaf.value / reading);
      return result(reading, leaf.value, "value", [], satisfied, progress);
    }
  }
}

/** Most satisfying charge sets a node keeps (bounds the search). */
const MAX_OPTIONS = 64;

/** A node's result plus every way (up to MAX_OPTIONS) it is met that fits the pools. */
type Evaluated = RuleResult & { options: MetricCharge[][] };

/**
 * The charge sets of picking one option from each list, merged, that fit
 * the pools together, in order, at most MAX_OPTIONS.
 */
function fittingProducts(lists: readonly MetricCharge[][][], ctx: RuleContext): MetricCharge[][] {
  let acc: MetricCharge[][] = [[]];
  for (const list of lists) {
    const next: MetricCharge[][] = [];
    for (const base of acc) {
      for (const option of list) {
        const merged = mergeCharges([base, option]);
        if (fits(merged, ctx)) next.push(merged);
        if (next.length >= MAX_OPTIONS) break;
      }
      if (next.length >= MAX_OPTIONS) break;
    }
    acc = next;
    if (acc.length === 0) break;
  }
  return acc;
}

function evaluateNode(node: RuleNode, ctx: RuleContext, path: string): Evaluated {
  if (!isGroup(node)) {
    const r = evaluateLeaf(node, path, ctx);
    return { ...r, options: r.satisfied ? [r.charges] : [] };
  }
  const children = node.children.map((child, i) =>
    evaluateNode(child, ctx, path === "" ? String(i) : `${path}.${i}`),
  );
  const leaves = children.flatMap((c) => c.leaves);

  if (node.kind === "all") {
    const options = children.every((c) => c.options.length > 0)
      ? fittingProducts(children.map((c) => c.options), ctx)
      : [];
    if (options.length > 0) {
      return { satisfied: true, progress: 1, charges: options[0], leaves, options };
    }
    const charges = mergeCharges(children.map((c) => c.charges));
    const mean = children.reduce((s, c) => s + c.progress, 0) / children.length;
    return {
      satisfied: false,
      progress: unmetProgress(mean, charges, ctx),
      charges,
      leaves,
      options: [],
    };
  }

  // Every combination (in child order) of `need` met children whose
  // options fit together; an `any` is a combination of one
  const need = node.kind === "any" ? 1 : node.count;
  const metIdx = children.flatMap((c, i) => (c.options.length > 0 ? [i] : []));
  const options: MetricCharge[][] = [];
  forEachCombination(metIdx, need, (idx) => {
    for (const o of fittingProducts(idx.map((i) => children[i].options), ctx)) {
      options.push(o);
      if (options.length >= MAX_OPTIONS) return false;
    }
    return true;
  });
  if (options.length > 0) {
    return { satisfied: true, progress: 1, charges: options[0], leaves, options };
  }
  // Unmet: an early purchase charges the `need` children closest to done
  const closest = children
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.progress - a.c.progress || a.i - b.i)
    .slice(0, need)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c);
  const charges = mergeCharges(closest.map((c) => c.charges));
  const mean = closest.reduce((s, c) => s + c.progress, 0) / need;
  return {
    satisfied: false,
    progress: unmetProgress(mean, charges, ctx),
    charges,
    leaves,
    options: [],
  };
}

/**
 * Evaluate a rule tree for one goal. It is met when some choice of
 * branches, across every level, is met with charges that fit the pools
 * together; its charges are the first such choice in rule order.
 */
export function evaluateRule(node: RuleNode, ctx: RuleContext, path = ""): RuleResult {
  const { satisfied, progress, charges, leaves } = evaluateNode(node, ctx, path);
  return { satisfied, progress, charges, leaves };
}

/**
 * Progress of an unmet group: its children's mean, but no more than the
 * share of its combined charges the pools can cover (two checks on one pool
 * may each be met alone and not together), and never shown as done.
 */
function unmetProgress(mean: number, charges: readonly MetricCharge[], ctx: RuleContext): number {
  let covered = 1;
  for (const c of charges) {
    if (c.amount > 0) covered = Math.min(covered, clamp01(ctx.available(c.metric) / c.amount));
  }
  return Math.min(mean, covered, 0.99);
}

/** Call `visit` with each `k`-subset of `items` in lexicographic order until it returns false. */
function forEachCombination(
  items: readonly number[],
  k: number,
  visit: (subset: number[]) => boolean,
): void {
  if (k > items.length) return;
  const pick: number[] = [];
  const walk = (from: number): boolean => {
    if (pick.length === k) return visit([...pick]);
    for (let i = from; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i]);
      const go = walk(i + 1);
      pick.pop();
      if (!go) return false;
    }
    return true;
  };
  walk(0);
}

// ═══════════════════════════════════════════════════════════════
// Pools and goals
// ═══════════════════════════════════════════════════════════════

/** Every pool's lots: money, gains and each counter tracker's entries. */
function metricLots(input: Pick<EvaluationInput, "investedLots" | "gainsLots" | "trackers" | "entries">) {
  const lots = new Map<MetricKey, Lot[]>([
    ["invested", [...input.investedLots]],
    ["gains", [...input.gainsLots]],
  ]);
  for (const e of input.entries) {
    if (input.trackers.get(e.trackerId)?.kind !== "count") continue;
    const metric = counterMetric(e.trackerId);
    const list = lots.get(metric) ?? [];
    list.push({ date: e.date, amount: e.value });
    lots.set(metric, list);
  }
  return lots;
}

/** Every metric's pool, replayed with the purchases of `goals`. */
export function replayPools(
  input: Pick<EvaluationInput, "investedLots" | "gainsLots" | "trackers" | "entries">,
  goals: readonly GoalForEvaluation[],
): Map<MetricKey, PoolState> {
  const lots = metricLots(input);
  const charges = new Map<MetricKey, Parameters<typeof replayPool>[1][number][]>();
  for (const g of goals) {
    if (g.status !== "bought" || !g.purchase) continue;
    for (const c of g.purchase.charges) {
      if (c.amount <= 0) continue;
      const list = charges.get(c.metric) ?? [];
      list.push({
        id: g.id,
        date: g.purchase.date,
        at: g.purchase.at,
        startDate: g.startDate,
        amount: c.amount,
      });
      charges.set(c.metric, list);
    }
  }
  const metrics = new Set<MetricKey>([...lots.keys(), ...charges.keys()]);
  return new Map(
    [...metrics].map((m) => [m, replayPool(lots.get(m) ?? [], charges.get(m) ?? [])]),
  );
}

function contextFor(
  goal: GoalForEvaluation,
  priceInGoalCurrency: number,
  input: EvaluationInput,
  pools: ReadonlyMap<MetricKey, PoolState>,
): RuleContext {
  const byTracker = new Map<string, TrackerEntry[]>();
  for (const e of input.entries) {
    if (e.date < goal.startDate) continue;
    const list = byTracker.get(e.trackerId) ?? [];
    list.push(e);
    byTracker.set(e.trackerId, list);
  }
  for (const list of byTracker.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return {
    priceEur: roundMoney(priceInGoalCurrency * goal.rate),
    rate: goal.rate,
    startDate: goal.startDate,
    today: input.today,
    available: (metric) => {
      const pool = pools.get(metric);
      return pool ? availableSince(pool, goal.startDate) : 0;
    },
    netWorth: input.netWorth,
    entries: (trackerId) => byTracker.get(trackerId) ?? [],
    checklistDone: new Set(goal.checklistDone),
  };
}

/** Progress and eligibility of every goal, and each pool's debt. */
export function evaluateGoals(input: EvaluationInput): EvaluationResult {
  const pools = replayPools(input, input.goals);
  const goals = input.goals.map((goal): GoalEvaluation => {
    const result = evaluateRule(goal.rule, contextFor(goal, goal.price, input, pools));
    if (goal.status !== "bought" || !goal.purchase) return { id: goal.id, ...result };
    const charges = goal.purchase.charges.map((c) => {
      const r = pools.get(c.metric)?.charges.get(goal.id);
      return {
        metric: c.metric,
        amount: c.amount,
        drawn: r?.drawn ?? 0,
        shortfall: r?.shortfall ?? c.amount,
      };
    });
    return {
      id: goal.id,
      ...result,
      purchase: { charges, earned: charges.every((c) => c.shortfall <= EPS) },
    };
  });
  const debts: MetricCharge[] = [];
  for (const [metric, pool] of pools) {
    if (pool.debt > EPS) debts.push({ metric, amount: pool.debt });
  }
  return { goals, debts };
}

/**
 * What buying `goalId` today at `price` (its currency) would draw: the
 * rule re-evaluated at the real price against the pools as they are now.
 * `earned` is false when the rule is not met; the charges are then those of
 * the branches closest to it, and what the pools cannot cover becomes debt.
 */
export function planPurchase(
  input: EvaluationInput,
  goalId: string,
  price: number,
): { earned: boolean; charges: MetricCharge[]; result: RuleResult } {
  const goal = input.goals.find((g) => g.id === goalId);
  if (!goal) throw new Error(`goal ${goalId} not in input`);
  const pools = replayPools(input, input.goals);
  const result = evaluateRule(goal.rule, contextFor(goal, price, input, pools));
  return {
    earned: result.satisfied,
    charges: result.charges.filter((c) => c.amount > 0),
    result,
  };
}
