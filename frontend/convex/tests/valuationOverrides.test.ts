/**
 * Per-asset valuation overrides (ENG-239): an override values a holding in
 * every net-worth figure, follows it across a re-sync, and is gone once
 * cleared; invalid input and cash are rejected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { NOW, OWNER, newTest, seedUser, type TestConvex } from "./setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const position = (t: TestConvex, symbol: string) =>
  t.run(async (ctx) =>
    (await ctx.db.query("brokerPositions").collect()).find((p) => p.symbol === symbol)!,
  );
const unified = (t: TestConvex, symbol: string) =>
  t
    .withIdentity({ subject: OWNER })
    .query(api.portfolio.getUnifiedPositions, {})
    .then((rows) => rows.find((r) => r.symbol === symbol)!);

describe("valuation overrides", () => {
  it("values a holding by its override until it is cleared", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    const owner = t.withIdentity({ subject: OWNER });
    const sap = await position(t, "SAP");
    const ref = { source: "brokerPosition" as const, id: sap._id };

    expect((await unified(t, "SAP")).valuation).toEqual({ kind: "live", canOverride: true });

    await owner.mutation(api.valuationOverrides.set, {
      holding: ref,
      kind: "manualPrice",
      pricePerUnit: 200,
      currency: "EUR",
      asOf: "2026-11-10",
    });
    const overridden = await unified(t, "SAP");
    expect(overridden.valueInBaseCurrency).toBe(6000);
    expect(overridden.currentPrice).toBe(200);
    expect(overridden.valuation?.kind).toBe("manualPrice");
    expect(overridden.valuation?.override?.asOf).toBe("2026-11-10");

    // A re-sync replaces the row; the override follows the holding's key
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...doc } = await ctx.db.get(sap._id).then((d) => d!);
      void _creationTime;
      await ctx.db.delete(_id);
      await ctx.db.insert("brokerPositions", doc);
    });
    expect((await unified(t, "SAP")).valueInBaseCurrency).toBe(6000);

    const resynced = await position(t, "SAP");
    await owner.mutation(api.valuationOverrides.clear, {
      holding: { source: "brokerPosition", id: resynced._id },
    });
    expect((await unified(t, "SAP")).valueInBaseCurrency).toBe(6900);
  });

  it("rejects invalid input and cash", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    const owner = t.withIdentity({ subject: OWNER });
    const sap = await position(t, "SAP");
    await expect(
      owner.mutation(api.valuationOverrides.set, {
        holding: { source: "brokerPosition", id: sap._id },
        kind: "markToModel",
        pricePerUnit: 100,
        currency: "EUR",
        asOf: "2026-11-01",
      }),
    ).rejects.toThrow(/valuationRateInvalid/);
    await t.run((ctx) => ctx.db.patch(sap._id, { investmentCategory: "cash" }));
    await expect(
      owner.mutation(api.valuationOverrides.set, {
        holding: { source: "brokerPosition", id: sap._id },
        kind: "manualPrice",
        pricePerUnit: 100,
        currency: "EUR",
        asOf: "2026-11-01",
      }),
    ).rejects.toThrow(/valuationNotSupported/);
  });
});
