/**
 * Live prices (ENG-239): the refresh mutations re-price only what a feed
 * covers, at a fresh and plausible price, and never another user's rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { NOW, OWNER, newTest, seedUser, type TestConvex } from "./setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const holding = (t: TestConvex, symbol: string) =>
  t.run(async (ctx) =>
    (await ctx.db.query("bitpandaHoldings").collect()).find((h) => h.symbol === symbol)!,
  );
const position = (t: TestConvex, symbol: string) =>
  t.run(async (ctx) =>
    (await ctx.db.query("brokerPositions").collect()).find((p) => p.symbol === symbol)!,
  );

describe("Bitpanda ticker refresh", () => {
  it("re-prices covered holdings at a fresh, plausible price", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    await t.mutation(internal.assetPrices.storeBitpandaTicker, {
      prices: [
        { symbol: "BTC", price: 90000, currency: "EUR" },
        // Ten times the stored price: taken for a unit error, not applied
        { symbol: "ETH", price: 29001, currency: "EUR" },
      ],
    });
    await t.mutation(internal.assetPrices.repriceBitpandaHoldings, { cursor: null });

    const btc = await holding(t, "BTC");
    expect(btc.currentPrice).toBe(90000);
    expect(btc.marketValue).toBe(10800);
    expect(btc.valueInBaseCurrency).toBe(10800);
    expect(btc.priceStatus).toBe("live");
    expect((await holding(t, "ETH")).currentPrice).toBe(2900);
  });

  it("ignores a stored price older than the refresh window", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    await t.mutation(internal.assetPrices.storeBitpandaTicker, {
      prices: [{ symbol: "BTC", price: 90000, currency: "EUR" }],
    });
    vi.setSystemTime(NOW + 31 * 60_000);
    await t.mutation(internal.assetPrices.repriceBitpandaHoldings, { cursor: null });
    expect((await holding(t, "BTC")).currentPrice).toBe(82000);
  });
});

describe("SnapTrade quote refresh", () => {
  it("re-prices quotable positions in their own currency", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    const sap = await position(t, "SAP");
    await t.run((ctx) => ctx.db.patch(sap._id, { symbolId: "sym-sap" }));

    const targets = await t.query(internal.assetPrices.quoteTargets, { cursor: null });
    expect(targets.targets).toEqual([
      {
        userId: OWNER,
        accounts: [
          { accountId: sap.accountId, snaptradeAccountId: expect.any(String), symbolIds: ["sym-sap"] },
        ],
      },
    ]);

    // A USD quote for a EUR position is not applied
    await t.mutation(internal.assetPrices.applySnaptradeQuotes, {
      userId: OWNER,
      accountId: sap.accountId,
      quotes: [{ symbolId: "sym-sap", ticker: "SAP", price: 250, currency: "USD" }],
    });
    expect((await position(t, "SAP")).currentPrice).toBe(230);

    const result = await t.mutation(internal.assetPrices.applySnaptradeQuotes, {
      userId: OWNER,
      accountId: sap.accountId,
      quotes: [{ symbolId: "sym-sap", ticker: "SAP", price: 240, currency: "EUR" }],
    });
    expect(result.repriced).toBe(1);
    const repriced = await position(t, "SAP");
    expect(repriced.marketValue).toBe(7200);
    expect(repriced.valueInBaseCurrency).toBe(7200);
    expect(repriced.unrealizedPL).toBe(7200 - 30 * 160);
  });

  it("never writes another user's account", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    const sap = await position(t, "SAP");
    const result = await t.mutation(internal.assetPrices.applySnaptradeQuotes, {
      userId: "user_other",
      accountId: sap.accountId,
      quotes: [{ symbolId: "sym-sap", ticker: "SAP", price: 240, currency: "EUR" }],
    });
    expect(result.repriced).toBe(0);
  });
});
