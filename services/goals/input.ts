/**
 * The input rules of goals, trackers and tracker entries (ENG-258):
 * validated and normalized here, stored by frontend/convex/goals.ts.
 *
 * A goal is priced in one of the display currencies; its rule passes
 * rules.ts parseRule. A tracker is something the user attests: a count
 * (workouts) or a measurement (10 km time). An entry is one dated record of
 * a tracker, never in the future.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

import { isDisplayCurrency, type DisplayCurrency } from "../finance/displayCurrency";
import type { UserErrorCode } from "../i18n/userErrorCodes";
import { parseRule, type RuleNode } from "./rules";

export const GOAL_NAME_MAX = 120;
export const GOAL_DESCRIPTION_MAX = 500;
export const GOAL_PRICE_MAX = 1e9;
export const TRACKER_UNIT_MAX = 24;
export const ENTRY_NOTE_MAX = 200;
/** Most entries one log call may add at once (a counter's +N) */
export const ENTRY_COUNT_MAX = 1000;

/** Days after the user's first goal during which new goals may be backdated (launch import). */
export const GOAL_IMPORT_DAYS = 14;
/** The earliest start a backdated goal may have. */
export const GOAL_EARLIEST_START = "2000-01-01";

/**
 * Until when (ms) a new goal may be backdated: GOAL_IMPORT_DAYS after the
 * user's first goal was created, or from `now` when they have none yet.
 */
export function backdateOpenUntil(
  goals: readonly { createdAt: number }[],
  now: number = Date.now(),
): number {
  const first = goals.reduce((min, g) => Math.min(min, g.createdAt), now);
  return first + GOAL_IMPORT_DAYS * 86_400_000;
}

export type GoalStatus = "active" | "bought" | "archived";
export type TrackerKind = "count" | "measurement";

export interface GoalInput {
  name: string;
  description?: string;
  currency: string;
  price: number;
  rule: unknown;
}

export interface NormalizedGoal {
  name: string;
  description?: string;
  currency: DisplayCurrency;
  price: number;
  rule: RuleNode;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's UTC day, YYYY-MM-DD (the snapshot days, portfolioSnapshots.ts). */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whether `date` is a real YYYY-MM-DD day. */
export function isDay(date: string): boolean {
  return DAY.test(date) && utcDay(Date.parse(`${date}T00:00:00Z`) || 0) === date;
}

function name(value: string, required: UserErrorCode, tooLong: UserErrorCode, max = GOAL_NAME_MAX) {
  const trimmed = value.trim();
  if (!trimmed) return { error: required };
  if (trimmed.length > max) return { error: tooLong };
  return { value: trimmed };
}

/** A price in a goal's currency: positive, at most GOAL_PRICE_MAX. */
export function validPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0 && price <= GOAL_PRICE_MAX;
}

/** The goal to store, or the first error. Tracker ownership is checked by the caller. */
export function normalizeGoal(
  input: GoalInput,
): { ok: true; goal: NormalizedGoal } | { ok: false; error: UserErrorCode; reason?: string } {
  const n = name(input.name, "goalNameRequired", "goalNameTooLong");
  if (n.error) return { ok: false, error: n.error };
  const description = input.description?.trim() || undefined;
  if (description && description.length > GOAL_DESCRIPTION_MAX) {
    return { ok: false, error: "goalNameTooLong" };
  }
  if (!isDisplayCurrency(input.currency)) return { ok: false, error: "goalCurrencyInvalid" };
  if (!validPrice(input.price)) return { ok: false, error: "goalPriceInvalid" };
  const rule = parseRule(input.rule);
  if (!rule.ok) {
    return { ok: false, error: "goalRuleInvalid", reason: `${rule.path || "rule"}: ${rule.reason}` };
  }
  return {
    ok: true,
    goal: {
      name: n.value!,
      description,
      currency: input.currency,
      price: Math.round(input.price * 100) / 100,
      rule: rule.rule,
    },
  };
}

/** A tracker's name and unit, trimmed, or the first error. */
export function normalizeTracker(input: {
  name: string;
  unit?: string;
}): { ok: true; name: string; unit?: string } | { ok: false; error: UserErrorCode } {
  const n = name(input.name, "goalTrackerNameRequired", "goalTrackerNameTooLong");
  if (n.error) return { ok: false, error: n.error };
  const unit = input.unit?.trim() || undefined;
  if (unit && unit.length > TRACKER_UNIT_MAX) return { ok: false, error: "goalTrackerNameTooLong" };
  return { ok: true, name: n.value!, unit };
}

/**
 * One entry of a tracker, or the first error: a count adds a whole number
 * of 1..ENTRY_COUNT_MAX, a measurement records any finite reading. The day
 * may not lie after `today`.
 */
export function normalizeEntry(
  kind: TrackerKind,
  input: { date: string; value: number; note?: string },
  today: string,
): { ok: true; date: string; value: number; note?: string } | { ok: false; error: UserErrorCode } {
  if (!isDay(input.date) || input.date > today) return { ok: false, error: "goalEntryDateInvalid" };
  const v = input.value;
  const valid =
    kind === "count"
      ? Number.isInteger(v) && v >= 1 && v <= ENTRY_COUNT_MAX
      : Number.isFinite(v) && Math.abs(v) <= GOAL_PRICE_MAX;
  if (!valid) return { ok: false, error: "goalEntryValueInvalid" };
  const note = input.note?.trim() || undefined;
  if (note && note.length > ENTRY_NOTE_MAX) return { ok: false, error: "goalEntryValueInvalid" };
  return { ok: true, date: input.date, value: v, note };
}
