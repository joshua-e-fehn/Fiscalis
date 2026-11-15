import { describe, expect, it } from "vitest";

import { backdateOpenUntil, GOAL_IMPORT_DAYS, isDay, normalizeEntry, normalizeGoal, normalizeTracker } from "./input";

const rule = { kind: "cooldown", days: 30 };

describe("normalizeGoal", () => {
  it("trims, rounds the price and parses the rule", () => {
    expect(
      normalizeGoal({ name: "  Car ", description: " ", currency: "USD", price: 999.999, rule }),
    ).toEqual({
      ok: true,
      goal: { name: "Car", description: undefined, currency: "USD", price: 1000, rule },
    });
  });

  it.each([
    [{ name: " " }, "goalNameRequired"],
    [{ name: "x".repeat(121) }, "goalNameTooLong"],
    [{ currency: "JPY" }, "goalCurrencyInvalid"],
    [{ price: 0 }, "goalPriceInvalid"],
    [{ price: Number.POSITIVE_INFINITY }, "goalPriceInvalid"],
    [{ rule: { kind: "cooldown", days: 0 } }, "goalRuleInvalid"],
  ])("rejects %j", (patch, error) => {
    const r = normalizeGoal({ name: "Car", currency: "EUR", price: 10, rule, ...patch });
    expect(r).toMatchObject({ ok: false, error });
  });
});

describe("normalizeTracker", () => {
  it("trims the name and drops an empty unit", () => {
    expect(normalizeTracker({ name: " Gym ", unit: " " })).toEqual({ ok: true, name: "Gym", unit: undefined });
  });

  it("rejects an empty name", () => {
    expect(normalizeTracker({ name: "" })).toEqual({ ok: false, error: "goalTrackerNameRequired" });
  });
});

describe("normalizeEntry", () => {
  const today = "2026-11-15";

  it("accepts a whole count and any finite reading", () => {
    expect(normalizeEntry("count", { date: today, value: 3 }, today)).toMatchObject({ ok: true, value: 3 });
    expect(normalizeEntry("measurement", { date: today, value: 49.5 }, today)).toMatchObject({ ok: true });
  });

  it.each([
    ["count", { date: "2026-11-16", value: 1 }, "goalEntryDateInvalid"],
    ["count", { date: "2026-02-30", value: 1 }, "goalEntryDateInvalid"],
    ["count", { date: today, value: 0 }, "goalEntryValueInvalid"],
    ["count", { date: today, value: 2.5 }, "goalEntryValueInvalid"],
    ["measurement", { date: today, value: Number.NaN }, "goalEntryValueInvalid"],
  ] as const)("rejects a %s entry %j", (kind, input, error) => {
    expect(normalizeEntry(kind, input, today)).toEqual({ ok: false, error });
  });
});

describe("isDay", () => {
  it("accepts real days only", () => {
    expect(isDay("2024-02-29")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-1-01")).toBe(false);
  });
});

describe("backdateOpenUntil", () => {
  const DAY = 86_400_000;
  it("opens the launch import for GOAL_IMPORT_DAYS after the first goal", () => {
    expect(backdateOpenUntil([{ createdAt: 5 * DAY }, { createdAt: 2 * DAY }], 100 * DAY)).toBe(
      (2 + GOAL_IMPORT_DAYS) * DAY,
    );
  });

  it("is open from now for a user without goals", () => {
    expect(backdateOpenUntil([], 10 * DAY)).toBe((10 + GOAL_IMPORT_DAYS) * DAY);
  });
});
