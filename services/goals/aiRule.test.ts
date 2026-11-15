import { describe, expect, it } from "vitest";

import { parseDraft, ruleAuthoringMessages, withCreatedTrackers } from "./aiRule";

const trackers = [{ id: "gym", name: "Workouts", kind: "count" as const }];

const reply = (obj: unknown, wrap = (s: string) => s) => wrap(JSON.stringify(obj));

describe("ruleAuthoringMessages", () => {
  it("puts everything in one user message with the trackers and the text", () => {
    const [message, ...rest] = ruleAuthoringMessages({
      text: "  invest 3x and 150 workouts  ",
      currency: "EUR",
      language: "English",
      trackers,
    });
    expect(rest).toEqual([]);
    expect(message.role).toBe("user");
    expect(message.content).toContain('id "gym": Workouts (count)');
    expect(message.content).toContain("invest 3x and 150 workouts\n");
  });
});

describe("parseDraft", () => {
  it("accepts a valid rule, tolerating a code fence", () => {
    const r = parseDraft(
      reply(
        {
          rule: { kind: "counter", trackerId: "gym", count: 150 },
          summary: " 150 workouts ",
          newTrackers: [],
          unsupported: [],
        },
        (s) => "```json\n" + s + "\n```",
      ),
      trackers,
    );
    expect(r).toEqual({
      ok: true,
      draft: {
        rule: { kind: "counter", trackerId: "gym", count: 150 },
        summary: "150 workouts",
        newTrackers: [],
        unsupported: [],
      },
    });
  });

  it("keeps declared new trackers the rule uses", () => {
    const r = parseDraft(
      reply({
        rule: { kind: "streak", trackerId: "new:1", perPeriod: 3, period: "week", periods: 12 },
        summary: "",
        newTrackers: [
          { ref: "new:1", name: "Jogging", kind: "count", unit: "runs" },
          { ref: "new:2", name: "Unused", kind: "count" },
        ],
      }),
      trackers,
    );
    expect(r.ok && r.draft.newTrackers).toEqual([{ ref: "new:1", name: "Jogging", kind: "count", unit: "runs" }]);
  });

  it.each([
    ["prose", "Sure! What would you like?", /not a JSON object/],
    ["an invalid rule", reply({ rule: { kind: "cooldown", days: 0 } }), /days/],
    ["an unknown tracker", reply({ rule: { kind: "counter", trackerId: "x", count: 1 } }), /Unknown trackerId/],
    [
      "a measurement check on a count tracker",
      reply({
        rule: { kind: "measurement", trackerId: "gym", comparison: "atMost", value: 1, basis: "best" },
      }),
      /needs a measurement tracker/,
    ],
  ])("rejects %s with a reason for the repair", (_, content, reason) => {
    const r = parseDraft(content, trackers);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });
});

describe("withCreatedTrackers", () => {
  it("replaces placeholder tracker ids", () => {
    expect(
      withCreatedTrackers(
        { kind: "all", children: [{ kind: "counter", trackerId: "new:1", count: 2 }, { kind: "cooldown", days: 1 }] },
        new Map([["new:1", "abc"]]),
      ),
    ).toEqual({ kind: "all", children: [{ kind: "counter", trackerId: "abc", count: 2 }, { kind: "cooldown", days: 1 }] });
  });
});
