/**
 * Bank depot holdings: a securities trade settled on a bank account is
 * tagged when the sync stores it, and becomes a holding valued at the
 * stored Yahoo price, or at cost without one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { INTRUDER, NOW, OWNER, newTest, type TestConvex } from "./setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const BUY =
  "DKB AG - Depot 0511391062 Wertp.Abrechn. 16.11.2026 000002823074800 WKN A2N812 Gesch.Art KV Stück 2,0000 BIT GL.TECH.LEAD. R-I ISIN DE000A2N8127";

const txn = (id: string, name: string, amount: number, pending = false) => ({
  itemId: "item_1",
  accountId: "acc_1",
  plaidTransactionId: id,
  amount,
  currency: "EUR",
  date: "2026-11-16",
  name,
  pending,
});

async function sync(t: TestConvex, upserts: ReturnType<typeof txn>[]) {
  await t.mutation(internal.banking.applyTransactionChanges, {
    userId: OWNER,
    upserts,
    removed: [],
  });
}

const depotRows = async (t: TestConvex, userId = OWNER) =>
  (
    await t.withIdentity({ subject: userId }).query(api.portfolio.getUnifiedPositions, {})
  ).filter((p) => p.source === "bankDepot");

describe("bank depot holdings", () => {
  it("tags only trade bookings when the sync stores them", async () => {
    const t = newTest();
    await sync(t, [txn("t1", BUY, 1760.32), txn("t2", "Rundfunk ARD", 55.08)]);
    const rows = await t.run((ctx) => ctx.db.query("plaidTransactions").collect());
    expect(rows.find((r) => r.plaidTransactionId === "t1")?.securityIsin).toBe(
      "DE000A2N8127",
    );
    expect(rows.find((r) => r.plaidTransactionId === "t2")?.securityIsin).toBeUndefined();
    expect(await t.query(internal.assetPrices.heldSecurityIsins, {})).toEqual([
      "DE000A2N8127",
    ]);
  });

  it("counts a holding at cost until a price is stored, then at the price", async () => {
    const t = newTest();
    // Pending and posted copies of one settlement count once
    await sync(t, [txn("t1", BUY, 1760.32, true), txn("t2", BUY, 1760.32)]);

    const [atCost] = await depotRows(t);
    expect(atCost).toMatchObject({
      category: "equities",
      quantity: 2,
      valueInBaseCurrency: 1760.32,
      costBasis: 1760.32,
    });
    expect(atCost.unrealizedPL).toBeUndefined();

    await t.mutation(internal.assetPrices.storeSecurityPrices, {
      prices: [
        {
          isin: "DE000A2N8127",
          ticker: "HJ35.F",
          price: 849.5,
          currency: "EUR",
          quoteType: "MUTUALFUND",
        },
      ],
    });
    const [priced] = await depotRows(t);
    expect(priced).toMatchObject({
      subcategory: "funds",
      valueInBaseCurrency: 1699,
      currentPrice: 849.5,
      costBasis: 1760.32,
    });
    expect(priced.unrealizedPL).toBeCloseTo(-61.32, 2);
    expect(await depotRows(t, INTRUDER)).toEqual([]);
  });
});
