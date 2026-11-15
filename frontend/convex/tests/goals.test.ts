/**
 * Goals (ENG-258): progress from the owner's own pools, owner-checked
 * trackers in rules, logged rule changes, purchases charged at the real
 * price with early-buy debt, and the guards on deleting.
 */
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { INTRUDER, OWNER, newTest, seedUser } from "./setup.helpers";

const TODAY = new Date().toISOString().slice(0, 10);

async function seeded() {
  const t = newTest();
  await seedUser(t, OWNER);
  await seedUser(t, INTRUDER);
  return {
    t,
    owner: t.withIdentity({ subject: OWNER }),
    intruder: t.withIdentity({ subject: INTRUDER }),
  };
}

type Client = Awaited<ReturnType<typeof seeded>>["owner"];

async function listed(client: Client) {
  const list = await client.query(api.goals.list, { today: TODAY });
  if (!list) throw new Error("no list");
  return list;
}

async function trip(client: Client) {
  const goal = (await listed(client)).goals.find((g) => g.name === "Lisbon trip");
  if (!goal) throw new Error("no trip");
  return goal;
}

async function workouts(client: Client) {
  const tracker = (await listed(client)).trackers.find((t) => t.name === "Workouts");
  if (!tracker) throw new Error("no tracker");
  return tracker;
}

describe("goals", () => {
  it("lists the seeded goals with their evaluated checks", async () => {
    const { owner } = await seeded();
    const list = await listed(owner);
    expect(list.goals.map((g) => g.name)).toEqual(["Lisbon trip", "Watch"]);
    const goal = await trip(owner);
    expect(goal.evaluation?.leaves.map((l) => l.kind)).toEqual(["invested", "counter", "checklist"]);
    const counter = goal.evaluation!.leaves[1];
    expect(counter).toMatchObject({ current: 4, target: 20, satisfied: false });
    expect(goal.evaluation?.satisfied).toBe(false);
    expect(list.trackers.find((t) => t.name === "Workouts")).toMatchObject({ entryCount: 4, total: 4 });
  });

  it("refuses a rule naming another user's tracker", async () => {
    const { owner, intruder } = await seeded();
    const tracker = await workouts(owner);
    await expect(
      intruder.mutation(api.goals.create, {
        name: "Theirs",
        currency: "EUR",
        price: 100,
        rule: { kind: "counter", trackerId: tracker._id, count: 5 },
      }),
    ).rejects.toThrow(/goalTrackerNotFound/);
  });

  it("refuses a counter check on a measurement tracker", async () => {
    const { owner } = await seeded();
    const trackerId = await owner.mutation(api.goals.createTracker, {
      name: "10 km",
      kind: "measurement",
      unit: "min",
    });
    await expect(
      owner.mutation(api.goals.create, {
        name: "Shoes",
        currency: "EUR",
        price: 150,
        rule: { kind: "counter", trackerId, count: 5 },
      }),
    ).rejects.toThrow(/goalRuleInvalid/);
  });

  it("refuses an invalid rule", async () => {
    const { owner } = await seeded();
    await expect(
      owner.mutation(api.goals.create, {
        name: "Bad",
        currency: "EUR",
        price: 100,
        rule: { kind: "invested", target: { kind: "priceMultiple", multiple: 0 } },
      }),
    ).rejects.toThrow(/goalRuleInvalid/);
  });

  it("logs a rule change with the rule before it", async () => {
    const { owner } = await seeded();
    const goal = await trip(owner);
    await owner.mutation(api.goals.update, {
      goalId: goal._id,
      name: goal.name,
      currency: "EUR",
      price: 1500,
      rule: { kind: "invested", target: { kind: "priceMultiple", multiple: 5 } },
    });
    const after = await trip(owner);
    const change = after.history.find((h) => h.kind === "ruleChanged");
    expect(change?.before).toEqual(goal.rule);
    expect(after.history.some((h) => h.kind === "priceChanged")).toBe(false);
  });

  it("ticks a checklist step", async () => {
    const { owner } = await seeded();
    const goal = await trip(owner);
    await owner.mutation(api.goals.setChecklistItem, {
      goalId: goal._id,
      checklistItemId: "flights",
      done: true,
    });
    expect((await trip(owner)).evaluation?.leaves[2]).toMatchObject({ satisfied: true });
    await expect(
      owner.mutation(api.goals.setChecklistItem, {
        goalId: goal._id,
        checklistItemId: "nope",
        done: true,
      }),
    ).rejects.toThrow(/goalChecklistItemNotFound/);
  });

  it("buys a goal early, records the shortfall as debt and keeps it", async () => {
    const { owner } = await seeded();
    const goal = await trip(owner);
    const preview = await owner.query(api.goals.purchasePreview, { goalId: goal._id, price: 1500, today: TODAY });
    expect(preview?.earned).toBe(false);
    const { earned } = await owner.mutation(api.goals.buy, { goalId: goal._id, price: 1500 });
    expect(earned).toBe(false);
    const list = await listed(owner);
    const bought = list.goals.find((g) => g._id === goal._id)!;
    expect(bought.status).toBe("bought");
    expect(bought.purchase?.charges.map((c) => c.metric).sort()).toEqual(
      ["counter:" + (await workouts(owner))._id, "invested"].sort(),
    );
    expect(list.debts.length).toBeGreaterThan(0);
    await expect(owner.mutation(api.goals.remove, { goalId: goal._id })).rejects.toThrow(
      /goalBoughtCannotDelete/,
    );
    await expect(
      owner.mutation(api.goals.update, {
        goalId: goal._id,
        name: "x",
        currency: "EUR",
        price: 1,
        rule: goal.rule,
      }),
    ).rejects.toThrow(/goalNotActive/);
  });

  it("keeps a tracker a goal uses, and deletes an unused one with its entries", async () => {
    const { owner, t } = await seeded();
    const used = await workouts(owner);
    await expect(owner.mutation(api.goals.removeTracker, { trackerId: used._id })).rejects.toThrow(
      /goalTrackerInUse/,
    );
    const unused = (await listed(owner)).trackers.find((x) => x.name === "Meditation")!;
    await owner.mutation(api.goals.logEntry, {
      trackerId: unused._id,
      date: "2026-11-01",
      value: 1,
    });
    await owner.mutation(api.goals.removeTracker, { trackerId: unused._id });
    const left = await t.run((ctx) =>
      ctx.db
        .query("goalEntries")
        .withIndex("by_tracker", (q) => q.eq("trackerId", unused._id as Id<"goalTrackers">))
        .collect(),
    );
    expect(left).toEqual([]);
  });

  it("refuses an entry dated in the future or with a fractional count", async () => {
    const { owner } = await seeded();
    const tracker = await workouts(owner);
    await expect(
      owner.mutation(api.goals.logEntry, { trackerId: tracker._id, date: "2999-01-01", value: 1 }),
    ).rejects.toThrow(/goalEntryDateInvalid/);
    await expect(
      owner.mutation(api.goals.logEntry, { trackerId: tracker._id, date: "2026-11-01", value: 1.5 }),
    ).rejects.toThrow(/goalEntryValueInvalid/);
  });

  it("returns nothing to a signed-out caller", async () => {
    const { t } = await seeded();
    expect(await t.query(api.goals.list, { today: TODAY })).toBeNull();
  });

  it("backdates a new goal only during the launch import", async () => {
    const { owner, t } = await seeded();
    const rule = { kind: "cooldown", days: 1 };
    const id = await owner.mutation(api.goals.create, {
      name: "Old plan",
      currency: "EUR",
      price: 100,
      rule,
      startDate: "2026-01-01",
    });
    const goal = (await listed(owner)).goals.find((g) => g._id === id)!;
    expect(goal.startDate).toBe("2026-01-01");
    expect(goal.history[0].after).toEqual({ backdatedTo: "2026-01-01" });
    await expect(
      owner.mutation(api.goals.create, { name: "Future", currency: "EUR", price: 1, rule, startDate: "2999-01-01" }),
    ).rejects.toThrow(/goalStartDateInvalid/);
    // Close the window: the first goal was created long ago
    await t.run(async (ctx) => {
      const first = await ctx.db.get(id);
      await ctx.db.patch(id, { createdAt: (first?.createdAt ?? 0) - 30 * 86_400_000 });
    });
    await expect(
      owner.mutation(api.goals.create, { name: "Late", currency: "EUR", price: 1, rule, startDate: "2026-01-01" }),
    ).rejects.toThrow(/goalBackdateClosed/);
  });
});
