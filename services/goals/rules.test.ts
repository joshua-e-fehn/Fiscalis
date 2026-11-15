import { describe, expect, it } from "vitest";

import {
  parseRule,
  RULE_LIMITS,
  ruleChecklistItemIds,
  ruleLeaves,
  ruleTrackerIds,
  sameRule,
  type RuleNode,
} from "./rules";

const invested = { kind: "invested", target: { kind: "priceMultiple", multiple: 10 } };
const workouts = { kind: "counter", trackerId: "t1", count: 150 };

function parsed(value: unknown): RuleNode {
  const r = parseRule(value);
  if (!r.ok) throw new Error(`${r.path}: ${r.reason}`);
  return r.rule;
}

describe("parseRule", () => {
  it("accepts every leaf kind inside groups", () => {
    const rule = parsed({
      kind: "all",
      children: [
        invested,
        { kind: "gains", target: { kind: "amount", amount: 500 } },
        { kind: "netWorth", amount: 100_000 },
        { kind: "cooldown", days: 30 },
        {
          kind: "any",
          children: [
            workouts,
            { kind: "streak", trackerId: "t1", perPeriod: 3, period: "week", periods: 12 },
          ],
        },
        { kind: "checklist", items: [{ id: "a", label: " Get 3 quotes " }] },
        {
          kind: "atLeast",
          count: 1,
          children: [
            {
              kind: "measurement",
              trackerId: "t2",
              comparison: "atMost",
              value: 50,
              basis: "best",
            },
          ],
        },
      ],
    });
    expect(ruleLeaves(rule)).toHaveLength(8);
    expect(ruleTrackerIds(rule)).toEqual(["t1", "t2"]);
    expect(ruleChecklistItemIds(rule)).toEqual(["a"]);
  });

  it("trims labels and strips unknown fields", () => {
    const rule = parsed({
      kind: "checklist",
      extra: true,
      items: [{ id: " a ", label: " Quotes ", note: "x" }],
    });
    expect(rule).toEqual({ kind: "checklist", items: [{ id: "a", label: "Quotes" }] });
  });

  it.each([
    [{ kind: "nope" }, "kind"],
    [{ kind: "invested", target: { kind: "priceMultiple", multiple: 0 } }, "target.multiple"],
    [{ kind: "invested", target: { kind: "priceMultiple", multiple: -1 } }, "target.multiple"],
    [{ kind: "invested", target: { kind: "amount", amount: Number.NaN } }, "target.amount"],
    [{ kind: "cooldown", days: 1.5 }, "days"],
    [{ kind: "counter", trackerId: "", count: 3 }, "trackerId"],
    [{ kind: "streak", trackerId: "t", perPeriod: 1, period: "day", periods: 2 }, "period"],
    [{ kind: "checklist", items: [] }, "items"],
    [{ kind: "all", children: [] }, "children"],
    [{ kind: "atLeast", count: 3, children: [invested, workouts] }, "count"],
    [{ kind: "any", children: [invested, { kind: "netWorth" }] }, "children[1].amount"],
  ])("rejects %j at %s", (value, path) => {
    const r = parseRule(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.path).toBe(path);
  });

  it("limits nesting depth", () => {
    let node: unknown = invested;
    for (let i = 0; i <= RULE_LIMITS.maxDepth; i++) node = { kind: "all", children: [node] };
    expect(parseRule(node).ok).toBe(false);
  });

  it("limits the number of checks", () => {
    const many = Array.from({ length: 3 }, () => ({
      kind: "all",
      children: Array.from({ length: 8 }, () => invested),
    }));
    const r = parseRule({ kind: "all", children: many });
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate checklist item ids", () => {
    const r = parseRule({
      kind: "all",
      children: [
        { kind: "checklist", items: [{ id: "a", label: "One" }] },
        { kind: "checklist", items: [{ id: "a", label: "Two" }] },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(parseRule(null).ok).toBe(false);
    expect(parseRule("invested").ok).toBe(false);
    expect(parseRule([invested]).ok).toBe(false);
  });
});

describe("sameRule", () => {
  it("compares parsed trees structurally", () => {
    expect(sameRule(parsed(invested), parsed({ ...invested }))).toBe(true);
    expect(sameRule(parsed(invested), parsed(workouts))).toBe(false);
  });
});
