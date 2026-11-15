/**
 * Pies (ENG-189): drift over the owner's own holdings, and slices may only
 * name the caller's holdings (a foreign holding key reads as missing).
 */
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { INTRUDER, OWNER, newTest, seedUser } from "./setup.helpers";

async function seeded() {
  const t = newTest();
  await seedUser(t, OWNER);
  await seedUser(t, INTRUDER);
  return { t, owner: t.withIdentity({ subject: OWNER }), intruder: t.withIdentity({ subject: INTRUDER }) };
}

describe("pies", () => {
  it("lists the seeded pie with weights from the owner's holdings", async () => {
    const { owner } = await seeded();
    const [pie] = await owner.query(api.pies.list, {});
    expect(pie.name).toBe("Core & Satellite");
    expect(pie.totalValue).toBeGreaterThan(0);
    const actual = pie.slices.reduce((sum, s) => sum + (s.actualWeight ?? 0), 0);
    expect(actual).toBeCloseTo(100, 6);
    for (const slice of pie.slices) {
      expect(slice.drift).toBeCloseTo((slice.actualWeight ?? 0) - slice.targetWeight, 6);
    }
  });

  it("creates a pie that names the caller's own holdings", async () => {
    const { owner } = await seeded();
    const [holding] = await owner.query(api.pies.holdings, {});
    await owner.mutation(api.pies.create, {
      name: "Single",
      slices: [{ weight: 100, target: { kind: "holdings", holdingKeys: [holding.key] } }],
    });
    const pies = await owner.query(api.pies.list, {});
    const single = pies.find((p) => p.name === "Single")!;
    expect(single.slices[0].actualWeight).toBe(100);
    expect(single.totalValue).toBeCloseTo(holding.value, 6);
  });

  it("refuses another user's holding keys", async () => {
    const { owner, intruder } = await seeded();
    const ownerKeys = (await owner.query(api.pies.holdings, {})).map((h) => h.key);
    const intruderKeys = new Set((await intruder.query(api.pies.holdings, {})).map((h) => h.key));
    const foreign = ownerKeys.find((k) => !intruderKeys.has(k))!;
    expect(foreign).toBeDefined();
    await expect(
      intruder.mutation(api.pies.create, {
        name: "Theirs",
        slices: [{ weight: 100, target: { kind: "holdings", holdingKeys: [foreign] } }],
      }),
    ).rejects.toThrow(/pieHoldingNotFound/);
  });

  it("refuses weights that do not sum to 100", async () => {
    const { owner } = await seeded();
    await expect(
      owner.mutation(api.pies.create, {
        name: "Short",
        slices: [{ weight: 90, target: { kind: "category", category: "equities" } }],
      }),
    ).rejects.toThrow(/pieWeightsNotHundred/);
  });
});
