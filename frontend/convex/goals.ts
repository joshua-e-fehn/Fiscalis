/**
 * Goals: earned purchases (ENG-256, ENG-258). A goal (a car, a vacation)
 * has a price and a rule that must be met before it is bought; the rule's
 * checks read new money invested, gains, net worth, the goal's age, and
 * trackers the user attests (counts, measurements, checklists).
 *
 * Nothing here stores a pool. evaluate() rebuilds every pool on read from
 * the daily snapshots (services/goals/lots.ts), a live figure for today
 * (lib/netWorth.ts computeNetWorth, like the snapshot writer) and the
 * tracker entries, then replays the purchases (services/goals/evaluate.ts).
 * A purchase stores what it drew from each pool, decided at the price
 * actually paid (planPurchase); a goal bought before its rule was met
 * leaves its shortfall as debt that later new money repays first.
 *
 * Every function derives the user from the auth token and checks ownership
 * (lib/auth.ts); a missing and a foreign document read the same. Money is
 * in EUR, a goal's price and fixed amounts in its own currency.
 */

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import { userError } from "./lib/userError";
import { computeNetWorth } from "./lib/netWorth";
import { loadFxRates } from "./fxRates";
import {
  GOAL_EARLIEST_START,
  normalizeEntry,
  normalizeGoal,
  normalizeTracker,
  backdateOpenUntil,
  isDay,
  utcDay,
  validPrice,
  type GoalInput,
} from "../../services/goals/input";
import { investmentLots, type LotBaseline } from "../../services/goals/lots";
import {
  evaluateGoals,
  planPurchase,
  type EvaluationInput,
  type GoalForEvaluation,
  type MetricKey,
} from "../../services/goals/evaluate";
import {
  parseRule,
  ruleChecklistItemIds,
  ruleLeaves,
  ruleTrackerIds,
  sameRule,
  type RuleNode,
} from "../../services/goals/rules";

// ═══════════════════════════════════════════════════════════════
// Loading
// ═══════════════════════════════════════════════════════════════

/** EUR per unit of each currency the goals use (EUR is 1). */
async function goalRates(ctx: QueryCtx, currencies: readonly string[]) {
  const foreign = [...new Set(currencies)].filter((c) => c !== "EUR");
  const rates = foreign.length ? await loadFxRates(ctx, { currencies: foreign }) : {};
  return (currency: string) =>
    currency === "EUR" ? 1 : (rates[currency]?.eurPerUnit ?? null);
}

/**
 * The days a source gained holdings already owned (services/goals/lots.ts
 * LotBaseline): a broker or Bitpanda connection added, a manual asset
 * recorded, a vault row dated before the day it was entered.
 */
async function loadBaselines(ctx: QueryCtx, userId: string): Promise<LotBaseline[]> {
  const [brokers, bitpanda, manual, vault] = await Promise.all([
    ctx.db.query("brokerConnections").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("bitpandaConnections").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("manualAssets").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("vaultTransactions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  return [
    ...brokers.map((c) => ({ date: utcDay(c.createdAt), source: "brokerPosition" })),
    ...bitpanda.map((c) => ({ date: utcDay(c.createdAt), source: "bitpanda" })),
    ...manual.map((a) => ({ date: utcDay(a.createdAt), source: "manualAsset" })),
    ...vault
      .filter((t) => t.transactionDate && t.transactionDate.slice(0, 10) < utcDay(t.createdAt))
      .map((t) => ({ date: utcDay(t.createdAt), source: "vault" })),
  ];
}

type SnapshotRow = Pick<Doc<"portfolioSnapshots">, "date" | "timestamp" | "categoryBreakdown">;

interface Loaded {
  input: EvaluationInput;
  goals: Doc<"goals">[];
  trackers: Doc<"goalTrackers">[];
  entries: Doc<"goalEntries">[];
  /** Days whose money moved had to be estimated */
  estimatedDays: number;
}

function toEvaluationGoal(
  goal: Doc<"goals">,
  rate: number,
): GoalForEvaluation | null {
  const rule = parseRule(goal.rule);
  if (!rule.ok) return null;
  return {
    id: goal._id,
    status: goal.status,
    startDate: goal.startDate,
    price: goal.price,
    rate,
    rule: rule.rule,
    checklistDone: goal.checklistDone.map((c) => c.itemId),
    purchase: goal.purchase && {
      date: goal.purchase.date,
      at: goal.purchase.at,
      charges: goal.purchase.charges.map((c) => ({
        metric: c.metric as MetricKey,
        amount: c.amount,
      })),
    },
  };
}

/** Days of snapshots read before the earliest goal start, to find the row before it. */
const LOOKBACK_DAYS = 31;

/**
 * Everything evaluation needs, with today's figures computed live.
 * `today` is the caller's UTC day (a query passes the client's, so a cached
 * result does not keep yesterday after midnight; a mutation its own).
 * Snapshots are read only from shortly before the earliest goal start: no
 * goal can use a lot dated before its start, so older days never matter.
 */
async function load(ctx: QueryCtx, userId: string, today: string): Promise<Loaded> {
  const now = Date.now();
  const [goals, trackers, entries] = await Promise.all([
    ctx.db.query("goals").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("goalTrackers").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("goalEntries").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  const earliest = goals.reduce<string | null>(
    (min, g) => (min === null || g.startDate < min ? g.startDate : min),
    null,
  );
  let netWorth: number | null = null;
  let rows: SnapshotRow[] = [];
  let baselines: LotBaseline[] = [];
  if (earliest !== null) {
    const from = utcDay(Date.parse(`${earliest}T00:00:00Z`) - LOOKBACK_DAYS * 86_400_000);
    const [snapshots, owned] = await Promise.all([
      ctx.db
        .query("portfolioSnapshots")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", from))
        .collect(),
      loadBaselines(ctx, userId),
    ]);
    baselines = owned;
    rows = snapshots
      .filter((s) => s.date < today)
      .map((s) => ({ date: s.date, timestamp: s.timestamp, categoryBreakdown: s.categoryBreakdown }));
    // Today's lot from the live portfolio, against the newest earlier day,
    // the way the snapshot writer computes it (portfolioSnapshots.ts)
    const previous = [...snapshots].reverse().find((s) => s.date < today);
    const live = await computeNetWorth(ctx, userId, previous);
    netWorth = live.netWorth;
    rows.push({ date: today, timestamp: now, categoryBreakdown: live.categoryBreakdown });
  }
  const lots = investmentLots(rows, baselines);

  const rateOf = await goalRates(ctx, goals.map((g) => g.currency));
  const evaluable = goals.flatMap((g) => {
    const rate = rateOf(g.currency);
    const e = rate === null ? null : toEvaluationGoal(g, rate);
    return e ? [e] : [];
  });

  return {
    input: {
      today,
      investedLots: lots.invested,
      gainsLots: lots.gains,
      netWorth,
      trackers: new Map(trackers.map((t) => [t._id as string, { kind: t.kind }])),
      entries: entries.map((e) => ({ trackerId: e.trackerId, date: e.date, value: e.value })),
      goals: evaluable,
    },
    goals,
    trackers,
    entries,
    estimatedDays: lots.estimatedDates.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════════════

/**
 * The user's goals (newest first) with their progress, eligibility and
 * purchase, their trackers with entry totals, and each pool's debt.
 */
export const list = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const today = isDay(args.today) ? args.today : utcDay(Date.now());
    const loaded = await load(ctx, userId, today);
    const result = evaluateGoals(loaded.input);
    const byId = new Map(result.goals.map((g) => [g.id, g]));
    const rateOf = new Map(loaded.input.goals.map((g) => [g.id, g.rate]));
    return {
      today: loaded.input.today,
      backdateUntil: backdateOpenUntil(loaded.goals),
      estimatedDays: loaded.estimatedDays,
      debts: result.debts,
      goals: [...loaded.goals]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((g) => ({
          _id: g._id,
          name: g.name,
          description: g.description,
          currency: g.currency,
          price: g.price,
          rate: rateOf.get(g._id) ?? null,
          rule: g.rule as RuleNode,
          startDate: g.startDate,
          status: g.status,
          checklistDone: g.checklistDone.map((c) => c.itemId),
          purchase: g.purchase,
          history: g.history,
          createdAt: g.createdAt,
          evaluation: byId.get(g._id) ?? null,
        })),
      trackers: loaded.trackers
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((t) => {
          const own = loaded.entries.filter((e) => e.trackerId === t._id);
          const latest = own.reduce<Doc<"goalEntries"> | null>(
            (best, e) => (!best || e.date > best.date || (e.date === best.date && e.createdAt > best.createdAt) ? e : best),
            null,
          );
          return {
            _id: t._id,
            name: t.name,
            kind: t.kind,
            unit: t.unit,
            entryCount: own.length,
            total: own.reduce((s, e) => s + e.value, 0),
            latest: latest && { date: latest.date, value: latest.value },
          };
        }),
    };
  },
});

/** A tracker's entries, newest first (at most 100). Empty when not the caller's. */
export const entries = query({
  args: { trackerId: v.id("goalTrackers") },
  handler: async (ctx, { trackerId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const tracker = await getOwnedDoc(ctx, userId, trackerId);
    if (!tracker) return [];
    const rows = await ctx.db
      .query("goalEntries")
      .withIndex("by_tracker", (q) => q.eq("trackerId", trackerId))
      .collect();
    return rows
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .slice(0, 100)
      .map((e) => ({ _id: e._id, date: e.date, value: e.value, note: e.note }));
  },
});

/**
 * What buying a goal now at `price` (its currency) would draw from each
 * pool, and whether the rule is met at that price. Null when not the
 * caller's goal or not active.
 */
export const purchasePreview = query({
  args: { goalId: v.id("goals"), price: v.number(), today: v.string() },
  handler: async (ctx, { goalId, price, today }) => {
    const userId = await getUserId(ctx);
    if (!userId || !validPrice(price)) return null;
    const goal = await getOwnedDoc(ctx, userId, goalId);
    if (!goal || goal.status !== "active") return null;
    const { input } = await load(ctx, userId, isDay(today) ? today : utcDay(Date.now()));
    if (!input.goals.some((g) => g.id === goalId)) return null;
    const plan = planPurchase(input, goalId, price);
    return { earned: plan.earned, charges: plan.charges, leaves: plan.result.leaves };
  },
});

// ═══════════════════════════════════════════════════════════════
// Goals
// ═══════════════════════════════════════════════════════════════

const goalFields = {
  name: v.string(),
  description: v.optional(v.string()),
  currency: v.string(),
  price: v.number(),
  rule: v.any(),
};

async function requireOwnedGoal(ctx: MutationCtx, goalId: Id<"goals">) {
  const userId = await requireUserId(ctx);
  const goal = await getOwnedDoc(ctx, userId, goalId);
  if (!goal) userError("goalNotFound");
  return { userId, goal };
}

async function requireActiveGoal(ctx: MutationCtx, goalId: Id<"goals">) {
  const owned = await requireOwnedGoal(ctx, goalId);
  if (owned.goal.status !== "active") userError("goalNotActive");
  return owned;
}

/**
 * The goal to store: validated, with every tracker its rule names one of
 * the caller's own and of the kind the check reads.
 */
async function toStoredGoal(ctx: MutationCtx, userId: string, input: GoalInput) {
  const result = normalizeGoal(input);
  if (!result.ok) userError(result.error);
  const { goal } = result;
  for (const id of ruleTrackerIds(goal.rule)) {
    const trackerId = ctx.db.normalizeId("goalTrackers", id);
    const tracker = trackerId && (await getOwnedDoc(ctx, userId, trackerId));
    if (!tracker) userError("goalTrackerNotFound");
    const wanted = ruleLeaves(goal.rule)
      .filter((l) => "trackerId" in l && l.trackerId === id)
      .map((l) => (l.kind === "measurement" ? "measurement" : "count"));
    if (wanted.some((kind) => kind !== tracker.kind)) userError("goalRuleInvalid");
  }
  return goal;
}

/**
 * Create a goal. It starts today; during the launch import (the first
 * GOAL_IMPORT_DAYS after the user's first goal) `startDate` may move it
 * back to when the user actually began working toward it.
 */
export const create = mutation({
  args: { ...goalFields, startDate: v.optional(v.string()) },
  handler: async (ctx, { startDate, ...args }) => {
    const userId = await requireUserId(ctx);
    const goal = await toStoredGoal(ctx, userId, args);
    const now = Date.now();
    const today = utcDay(now);
    let start = today;
    if (startDate !== undefined && startDate !== today) {
      if (!isDay(startDate) || startDate > today || startDate < GOAL_EARLIEST_START) {
        userError("goalStartDateInvalid");
      }
      const existing = await ctx.db
        .query("goals")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      if (now >= backdateOpenUntil(existing, now)) userError("goalBackdateClosed");
      start = startDate;
    }
    return await ctx.db.insert("goals", {
      userId,
      ...goal,
      startDate: start,
      status: "active",
      checklistDone: [],
      history: [
        start === today ? { at: now, kind: "created" } : { at: now, kind: "created", after: { backdatedTo: start } },
      ],
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Replace an active goal's name, description, price and rule with the
 * editor's. Each change is logged in its history; a rule change keeps the
 * rule before it, so a loosened rule stays visible.
 */
export const update = mutation({
  args: { goalId: v.id("goals"), ...goalFields },
  handler: async (ctx, { goalId, ...input }) => {
    const { userId, goal } = await requireActiveGoal(ctx, goalId);
    const next = await toStoredGoal(ctx, userId, input);
    const now = Date.now();
    const history = [...goal.history];
    if (next.name !== goal.name) {
      history.push({ at: now, kind: "renamed", before: goal.name, after: next.name });
    }
    if (next.price !== goal.price || next.currency !== goal.currency) {
      history.push({
        at: now,
        kind: "priceChanged",
        before: { price: goal.price, currency: goal.currency },
        after: { price: next.price, currency: next.currency },
      });
    }
    const before = parseRule(goal.rule);
    if (!before.ok || !sameRule(before.rule, next.rule)) {
      history.push({ at: now, kind: "ruleChanged", before: goal.rule, after: next.rule });
    }
    const items = new Set(ruleChecklistItemIds(next.rule));
    await ctx.db.patch(goalId, {
      ...next,
      description: next.description,
      checklistDone: goal.checklistDone.filter((c) => items.has(c.itemId)),
      history,
      updatedAt: now,
    });
  },
});

/** Tick or untick one step of an active goal's checklist. */
export const setChecklistItem = mutation({
  args: { goalId: v.id("goals"), checklistItemId: v.string(), done: v.boolean() },
  handler: async (ctx, { goalId, checklistItemId, done }) => {
    const { goal } = await requireActiveGoal(ctx, goalId);
    const rule = parseRule(goal.rule);
    if (!rule.ok || !ruleChecklistItemIds(rule.rule).includes(checklistItemId)) {
      userError("goalChecklistItemNotFound");
    }
    const rest = goal.checklistDone.filter((c) => c.itemId !== checklistItemId);
    await ctx.db.patch(goalId, {
      checklistDone: done ? [...rest, { itemId: checklistItemId, at: Date.now() }] : rest,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark an active goal bought at the price actually paid (its currency).
 * The rule is evaluated at that price against the pools as they are now;
 * what the pools cannot cover becomes debt, and the purchase is recorded
 * as bought before earned.
 */
export const buy = mutation({
  args: { goalId: v.id("goals"), price: v.number() },
  handler: async (ctx, { goalId, price }) => {
    const { userId, goal } = await requireActiveGoal(ctx, goalId);
    if (!validPrice(price)) userError("goalPriceInvalid");
    const { input } = await load(ctx, userId, utcDay(Date.now()));
    if (!input.goals.some((g) => g.id === goalId)) {
      userError(parseRule(goal.rule).ok ? "exchangeRateUnavailable" : "goalRuleInvalid");
    }
    const plan = planPurchase(input, goalId, price);
    const now = Date.now();
    const purchase = {
      date: input.today,
      at: now,
      price: Math.round(price * 100) / 100,
      earned: plan.earned,
      charges: plan.charges,
    };
    await ctx.db.patch(goalId, {
      status: "bought",
      purchase,
      history: [...goal.history, { at: now, kind: "bought", after: purchase }],
      updatedAt: now,
    });
    return { earned: plan.earned };
  },
});

export const archive = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const { goal } = await requireActiveGoal(ctx, goalId);
    const now = Date.now();
    await ctx.db.patch(goalId, {
      status: "archived",
      history: [...goal.history, { at: now, kind: "archived" }],
      updatedAt: now,
    });
  },
});

/** Bring an archived goal back; it keeps its start date. */
export const restore = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const { goal } = await requireOwnedGoal(ctx, goalId);
    if (goal.status !== "archived") userError("goalNotActive");
    const now = Date.now();
    await ctx.db.patch(goalId, {
      status: "active",
      history: [...goal.history, { at: now, kind: "restored" }],
      updatedAt: now,
    });
  },
});

/** Delete a goal that was never bought (a purchase stays in the pools). */
export const remove = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const { goal } = await requireOwnedGoal(ctx, goalId);
    if (goal.status === "bought") userError("goalBoughtCannotDelete");
    await ctx.db.delete(goalId);
  },
});

// ═══════════════════════════════════════════════════════════════
// Trackers and entries
// ═══════════════════════════════════════════════════════════════

async function requireOwnedTracker(ctx: MutationCtx, trackerId: Id<"goalTrackers">) {
  const userId = await requireUserId(ctx);
  const tracker = await getOwnedDoc(ctx, userId, trackerId);
  if (!tracker) userError("goalTrackerNotFound");
  return { userId, tracker };
}

export const createTracker = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal("count"), v.literal("measurement")),
    unit: v.optional(v.string()),
  },
  handler: async (ctx, { name, kind, unit }) => {
    const userId = await requireUserId(ctx);
    const t = normalizeTracker({ name, unit });
    if (!t.ok) userError(t.error);
    return await ctx.db.insert("goalTrackers", {
      userId,
      name: t.name,
      kind,
      unit: t.unit,
      createdAt: Date.now(),
    });
  },
});

export const updateTracker = mutation({
  args: { trackerId: v.id("goalTrackers"), name: v.string(), unit: v.optional(v.string()) },
  handler: async (ctx, { trackerId, name, unit }) => {
    await requireOwnedTracker(ctx, trackerId);
    const t = normalizeTracker({ name, unit });
    if (!t.ok) userError(t.error);
    await ctx.db.patch(trackerId, { name: t.name, unit: t.unit });
  },
});

/** Delete a tracker no goal's rule names, with its entries. */
export const removeTracker = mutation({
  args: { trackerId: v.id("goalTrackers") },
  handler: async (ctx, { trackerId }) => {
    const { userId } = await requireOwnedTracker(ctx, trackerId);
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const inUse = goals.some((g) => {
      const rule = parseRule(g.rule);
      return rule.ok && ruleTrackerIds(rule.rule).includes(trackerId);
    });
    if (inUse) userError("goalTrackerInUse");
    const rows = await ctx.db
      .query("goalEntries")
      .withIndex("by_tracker", (q) => q.eq("trackerId", trackerId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(trackerId);
  },
});

/** Log one attested entry: a count's +N or a measurement's reading. */
export const logEntry = mutation({
  args: {
    trackerId: v.id("goalTrackers"),
    date: v.string(),
    value: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { trackerId, ...input }) => {
    const { userId, tracker } = await requireOwnedTracker(ctx, trackerId);
    const now = Date.now();
    // Entries are dated by the user's own day, up to UTC+14 ahead of the server's
    const entry = normalizeEntry(tracker.kind, input, utcDay(now + 14 * 3_600_000));
    if (!entry.ok) userError(entry.error);
    return await ctx.db.insert("goalEntries", {
      userId,
      trackerId,
      date: entry.date,
      value: entry.value,
      note: entry.note,
      createdAt: now,
    });
  },
});

export const removeEntry = mutation({
  args: { entryId: v.id("goalEntries") },
  handler: async (ctx, { entryId }) => {
    const userId = await requireUserId(ctx);
    const entry = await getOwnedDoc(ctx, userId, entryId);
    if (!entry) userError("goalEntryNotFound");
    await ctx.db.delete(entryId);
  },
});
