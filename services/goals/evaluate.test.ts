import { describe, expect, it } from "vitest";

import {
  counterMetric,
  daysBetween,
  evaluateGoals,
  periodKey,
  planPurchase,
  type EvaluationInput,
  type GoalForEvaluation,
} from "./evaluate";
import type { RuleNode } from "./rules";

const tenTimes: RuleNode = {
  kind: "invested",
  target: { kind: "priceMultiple", multiple: 10 },
};

function goal(overrides: Partial<GoalForEvaluation> = {}): GoalForEvaluation {
  return {
    id: "trip",
    status: "active",
    startDate: "2026-01-01",
    price: 1000,
    rate: 1,
    rule: tenTimes,
    checklistDone: [],
    ...overrides,
  };
}

function input(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    today: "2026-06-01",
    investedLots: [],
    gainsLots: [],
    netWorth: null,
    trackers: new Map(),
    entries: [],
    goals: [goal()],
    ...overrides,
  };
}

function only(result: ReturnType<typeof evaluateGoals>, id = "trip") {
  const g = result.goals.find((x) => x.id === id);
  if (!g) throw new Error(id);
  return g;
}

describe("dates", () => {
  it("counts whole UTC days", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("keys weeks by their Monday and months by YYYY-MM", () => {
    expect(periodKey("2026-11-15", "week")).toBe("2026-11-09"); // a Sunday
    expect(periodKey("2026-11-09", "week")).toBe("2026-11-09");
    expect(periodKey("2026-11-15", "month")).toBe("2026-11");
  });
});

describe("invested", () => {
  it("needs ten times the price in new money since the start", () => {
    const before = evaluateGoals(
      input({ investedLots: [{ date: "2025-12-31", amount: 50_000 }, { date: "2026-02-01", amount: 6000 }] }),
    );
    const leaf = only(before).leaves[0];
    expect(leaf).toMatchObject({ current: 6000, target: 10_000, satisfied: false, progress: 0.6 });
    expect(only(before).satisfied).toBe(false);

    const after = evaluateGoals(
      input({ investedLots: [{ date: "2026-02-01", amount: 6000 }, { date: "2026-03-01", amount: 4000 }] }),
    );
    expect(only(after).satisfied).toBe(true);
  });

  it("converts a goal priced in another currency", () => {
    const r = evaluateGoals(
      input({
        goals: [goal({ price: 1000, rate: 0.9 })],
        investedLots: [{ date: "2026-02-01", amount: 9000 }],
      }),
    );
    expect(only(r).leaves[0].target).toBe(9000);
    expect(only(r).satisfied).toBe(true);
  });

  it("lets new money count for every open goal", () => {
    const r = evaluateGoals(
      input({
        goals: [goal(), goal({ id: "bike", startDate: "2026-03-01" })],
        investedLots: [{ date: "2026-02-01", amount: 5000 }, { date: "2026-04-01", amount: 5000 }],
      }),
    );
    expect(only(r, "trip").leaves[0].current).toBe(10_000);
    expect(only(r, "bike").leaves[0].current).toBe(5000);
  });

  it("removes what an earlier purchase consumed from the shared pool", () => {
    const r = evaluateGoals(
      input({
        goals: [
          goal({
            id: "car",
            status: "bought",
            startDate: "2026-01-01",
            purchase: { date: "2026-03-01", at: 1, charges: [{ metric: "invested", amount: 8000 }] },
          }),
          goal({ startDate: "2026-01-15" }),
        ],
        investedLots: [{ date: "2026-02-01", amount: 10_000 }, { date: "2026-04-01", amount: 3000 }],
      }),
    );
    expect(only(r, "trip").leaves[0].current).toBe(5000);
    expect(only(r, "car").purchase).toEqual({
      charges: [{ metric: "invested", amount: 8000, drawn: 8000, shortfall: 0 }],
      earned: true,
    });
  });
});

describe("gains", () => {
  it("counts gains since the start, losses included", () => {
    const r = evaluateGoals(
      input({
        goals: [goal({ rule: { kind: "gains", target: { kind: "priceMultiple", multiple: 1 } } })],
        gainsLots: [
          { date: "2025-12-01", amount: 5000 },
          { date: "2026-02-01", amount: 1500 },
          { date: "2026-03-01", amount: -700 },
        ],
      }),
    );
    expect(only(r).leaves[0]).toMatchObject({ current: 800, target: 1000, satisfied: false });
  });
});

describe("conditions", () => {
  it("checks net worth and cooldown without consuming them", () => {
    const rule: RuleNode = {
      kind: "all",
      children: [
        { kind: "netWorth", amount: 50_000 },
        { kind: "cooldown", days: 30 },
      ],
    };
    const r = evaluateGoals(
      input({ today: "2026-01-20", netWorth: 60_000, goals: [goal({ rule })] }),
    );
    expect(only(r).leaves.map((l) => l.satisfied)).toEqual([true, false]);
    expect(only(r).charges).toEqual([]);
    expect(only(r).progress).toBeCloseTo((1 + 19 / 30) / 2);
  });

  it("ticks checklist items", () => {
    const rule: RuleNode = {
      kind: "checklist",
      items: [
        { id: "a", label: "Quotes" },
        { id: "b", label: "Test drive" },
      ],
    };
    const r = evaluateGoals(input({ goals: [goal({ rule, checklistDone: ["a"] })] }));
    expect(only(r).leaves[0]).toMatchObject({ current: 1, target: 2, satisfied: false });
  });
});

describe("attested trackers", () => {
  const trackers = new Map([
    ["gym", { kind: "count" as const }],
    ["run", { kind: "measurement" as const }],
  ]);

  it("counts a counter's entries since the start and consumes them", () => {
    const rule: RuleNode = { kind: "counter", trackerId: "gym", count: 3 };
    const entries = [
      { trackerId: "gym", date: "2025-12-31", value: 10 },
      { trackerId: "gym", date: "2026-01-02", value: 1 },
      { trackerId: "gym", date: "2026-01-05", value: 2 },
    ];
    const r = evaluateGoals(input({ trackers, entries, goals: [goal({ rule })] }));
    expect(only(r).satisfied).toBe(true);
    expect(only(r).charges).toEqual([{ metric: counterMetric("gym"), amount: 3 }]);
  });

  it("finds the longest run of weeks meeting the cadence", () => {
    const rule: RuleNode = {
      kind: "streak",
      trackerId: "gym",
      perPeriod: 2,
      period: "week",
      periods: 3,
    };
    const day = (d: string) => ({ trackerId: "gym", date: d, value: 1 });
    const entries = [
      // week of 5 Jan: 2, week of 12 Jan: 2, week of 19 Jan: 1 (breaks), then two good weeks
      day("2026-01-05"), day("2026-01-06"),
      day("2026-01-12"), day("2026-01-13"),
      day("2026-01-19"),
      day("2026-01-26"), day("2026-01-27"),
      day("2026-02-02"), day("2026-02-03"),
    ];
    const r = evaluateGoals(
      input({ today: "2026-02-04", trackers, entries, goals: [goal({ rule, startDate: "2026-01-05" })] }),
    );
    expect(only(r).leaves[0]).toMatchObject({ current: 2, target: 3, satisfied: false });
  });

  it("reads the best or latest measurement", () => {
    const entries = [
      { trackerId: "run", date: "2026-02-01", value: 52 },
      { trackerId: "run", date: "2026-03-01", value: 49 },
      { trackerId: "run", date: "2026-04-01", value: 51 },
    ];
    const rule = (basis: "best" | "latest"): RuleNode => ({
      kind: "measurement",
      trackerId: "run",
      comparison: "atMost",
      value: 50,
      basis,
    });
    const best = evaluateGoals(input({ trackers, entries, goals: [goal({ rule: rule("best") })] }));
    const latest = evaluateGoals(input({ trackers, entries, goals: [goal({ rule: rule("latest") })] }));
    expect(only(best).leaves[0]).toMatchObject({ current: 49, satisfied: true });
    expect(only(latest).leaves[0]).toMatchObject({ current: 51, satisfied: false });
  });

  it("has no progress on a measurement without readings", () => {
    const rule: RuleNode = {
      kind: "measurement",
      trackerId: "run",
      comparison: "atLeast",
      value: 10,
      basis: "best",
    };
    const r = evaluateGoals(input({ trackers, goals: [goal({ rule })] }));
    expect(only(r).leaves[0]).toMatchObject({ satisfied: false, progress: 0 });
  });
});

describe("groups", () => {
  const trackers = new Map([["gym", { kind: "count" as const }]]);
  const gym = (n: number) =>
    Array.from({ length: n }, () => ({ trackerId: "gym", date: "2026-02-01", value: 1 }));

  it("requires two checks on one pool to fit together", () => {
    const rule: RuleNode = {
      kind: "all",
      children: [
        { kind: "invested", target: { kind: "amount", amount: 6000 } },
        { kind: "invested", target: { kind: "amount", amount: 6000 } },
      ],
    };
    const r = evaluateGoals(
      input({ investedLots: [{ date: "2026-02-01", amount: 10_000 }], goals: [goal({ rule })] }),
    );
    expect(only(r).leaves.every((l) => l.satisfied)).toBe(true);
    expect(only(r).satisfied).toBe(false);
  });

  it("charges the first satisfied branch of an any", () => {
    const rule: RuleNode = {
      kind: "any",
      children: [
        tenTimes,
        { kind: "counter", trackerId: "gym", count: 3 },
      ],
    };
    const r = evaluateGoals(input({ trackers, entries: gym(3), goals: [goal({ rule })] }));
    expect(only(r).satisfied).toBe(true);
    expect(only(r).charges).toEqual([{ metric: counterMetric("gym"), amount: 3 }]);
  });

  it("charges the closest branch of an unmet any", () => {
    const rule: RuleNode = {
      kind: "any",
      children: [tenTimes, { kind: "counter", trackerId: "gym", count: 10 }],
    };
    const r = evaluateGoals(
      input({
        trackers,
        entries: gym(8),
        investedLots: [{ date: "2026-02-01", amount: 2000 }],
        goals: [goal({ rule })],
      }),
    );
    expect(only(r).satisfied).toBe(false);
    expect(only(r).progress).toBeCloseTo(0.8);
    expect(only(r).charges).toEqual([{ metric: counterMetric("gym"), amount: 10 }]);
  });

  it("needs n of the children for atLeast", () => {
    const rule: RuleNode = {
      kind: "atLeast",
      count: 2,
      children: [
        tenTimes,
        { kind: "counter", trackerId: "gym", count: 3 },
        { kind: "cooldown", days: 10 },
      ],
    };
    const r = evaluateGoals(input({ trackers, entries: gym(3), goals: [goal({ rule })] }));
    expect(only(r).satisfied).toBe(true);
    expect(only(r).charges).toEqual([{ metric: counterMetric("gym"), amount: 3 }]);
  });
});

describe("planPurchase", () => {
  it("re-evaluates at the real price", () => {
    const base = input({ investedLots: [{ date: "2026-02-01", amount: 10_000 }] });
    expect(planPurchase(base, "trip", 1000)).toMatchObject({
      earned: true,
      charges: [{ metric: "invested", amount: 10_000 }],
    });
    expect(planPurchase(base, "trip", 1200)).toMatchObject({
      earned: false,
      charges: [{ metric: "invested", amount: 12_000 }],
    });
  });

  it("makes an early purchase's shortfall debt that later new money repays first", () => {
    const r = evaluateGoals(
      input({
        goals: [
          goal({
            id: "early",
            status: "bought",
            purchase: { date: "2026-02-15", at: 1, charges: [{ metric: "invested", amount: 10_000 }] },
          }),
          goal({ id: "next", startDate: "2026-03-01" }),
        ],
        investedLots: [
          { date: "2026-02-01", amount: 4000 },
          { date: "2026-03-01", amount: 7000 },
        ],
      }),
    );
    expect(only(r, "early").purchase?.earned).toBe(false);
    expect(only(r, "early").purchase?.charges[0]).toMatchObject({ drawn: 4000, shortfall: 6000 });
    // March's 7000 repays the 6000 first
    expect(only(r, "next").leaves[0].current).toBe(1000);
    expect(r.debts).toEqual([]);
  });

  it("reports outstanding debt", () => {
    const r = evaluateGoals(
      input({
        goals: [
          goal({
            status: "bought",
            purchase: { date: "2026-02-15", at: 1, charges: [{ metric: "invested", amount: 10_000 }] },
          }),
        ],
      }),
    );
    expect(r.debts).toEqual([{ metric: "invested", amount: 10_000 }]);
  });
});
