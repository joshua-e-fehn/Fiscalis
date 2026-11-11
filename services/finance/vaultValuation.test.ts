/** Tests for services/finance/metals.ts: vault valuation, spot prices, premiums, summary. */
import { describe, it, expect } from "vitest";

import {
  SPOT_PRICE_MAX_AGE_MS,
  SPOT_PRICE_MAX_FUTURE_SKEW_MS,
  TROY_OUNCE_GRAMS,
  DEFAULT_BUY_PREMIUM,
  convertAtSpotRates,
  freshSpotPerOunce,
  parseLatestMetalPrices,
  resolvePremiums,
  summarizeMetalItems,
  valueMetalItem,
  valueVaultItem,
} from "./metals";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const oneOzGold = { fineWeightGrams: TROY_OUNCE_GRAMS, quantity: 2 };
const spot = (eurPerOunce: number, ageMs = 0) => ({
  metalType: "gold" as const,
  eurPerOunce,
  sourceTimestamp: NOW - ageMs,
});

describe("valueVaultItem", () => {
  it("values at spot × fine oz × (1 + sellPremium) × quantity", () => {
    const r = valueVaultItem(
      { ...oneOzGold, sellPremium: -0.02, purchasePricePerUnit: 2000 },
      spot(3000),
      NOW,
    );
    expect(r.pricedAtSpot).toBe(true);
    expect(r.value).toBeCloseTo(3000 * 0.98 * 2, 6);
    expect(r.cost).toBe(4000);
  });

  it("treats a missing sellPremium as selling at spot (dashboard default)", () => {
    expect(valueVaultItem(oneOzGold, spot(3000), NOW).value).toBeCloseTo(6000, 6);
  });

  it("falls back to purchase price without a spot price", () => {
    const r = valueVaultItem(
      { ...oneOzGold, purchasePricePerUnit: 2000 },
      undefined,
      NOW,
    );
    expect(r).toEqual({ value: 4000, cost: 4000, pricedAtSpot: false });
  });

  it("reports an unknown cost as null, not 0", () => {
    expect(valueVaultItem(oneOzGold, spot(3000), NOW).cost).toBeNull();
    expect(valueVaultItem(oneOzGold, undefined, NOW)).toEqual({
      value: 0,
      cost: null,
      pricedAtSpot: false,
    });
  });

  it("falls back to purchase price when the spot price is stale", () => {
    const item = { ...oneOzGold, purchasePricePerUnit: 2000 };
    expect(
      valueVaultItem(item, spot(3000, SPOT_PRICE_MAX_AGE_MS), NOW).pricedAtSpot,
    ).toBe(true);
    expect(
      valueVaultItem(item, spot(3000, SPOT_PRICE_MAX_AGE_MS + 1), NOW).value,
    ).toBe(4000);
  });

  it("does not treat a future-dated spot price as fresh", () => {
    const item = { ...oneOzGold, purchasePricePerUnit: 1 };
    const future = { ...spot(3000), sourceTimestamp: NOW + SPOT_PRICE_MAX_FUTURE_SKEW_MS + 1 };
    expect(valueVaultItem(item, future, NOW).pricedAtSpot).toBe(false);
  });

  it("ignores non-positive or non-finite spot prices", () => {
    const item = { ...oneOzGold, purchasePricePerUnit: 1 };
    expect(valueVaultItem(item, spot(0), NOW).pricedAtSpot).toBe(false);
    expect(valueVaultItem(item, spot(NaN), NOW).pricedAtSpot).toBe(false);
  });
});

describe("parseLatestMetalPrices", () => {
  const payload = {
    gold: { eur: 3632.65, usd: 4200, chf: null },
    silver: { eur: 47.44, usd: 55, chf: null },
    platinum: { eur: 1404.37, usd: 1600, chf: null },
    palladium: { eur: 972.91, usd: 1100, chf: null },
    exchangeRates: { eurToUsd: 1.16, eurToChf: 0.94 },
    timestamp: "2026-11-11T11:48:00.000Z",
  };

  it("extracts EUR prices with the upstream timestamp", () => {
    const prices = parseLatestMetalPrices(payload, NOW);
    expect(prices).toHaveLength(4);
    expect(prices[0]).toEqual({
      metalType: "gold",
      eurPerOunce: 3632.65,
      sourceTimestamp: Date.parse("2026-11-11T11:48:00.000Z"),
    });
  });

  it("drops invalid metal entries and keeps the rest", () => {
    const prices = parseLatestMetalPrices(
      { ...payload, silver: { eur: "47" }, platinum: { eur: -1 }, palladium: null },
      NOW,
    );
    expect(prices.map((p) => p.metalType)).toEqual(["gold"]);
  });

  it("rejects payloads without a valid timestamp or object shape", () => {
    expect(parseLatestMetalPrices({ ...payload, timestamp: "nope" }, NOW)).toEqual([]);
    expect(parseLatestMetalPrices(null, NOW)).toEqual([]);
    expect(parseLatestMetalPrices("x", NOW)).toEqual([]);
  });

  it("rejects a timestamp beyond the allowed future skew", () => {
    const future = new Date(NOW + SPOT_PRICE_MAX_FUTURE_SKEW_MS + 1).toISOString();
    expect(parseLatestMetalPrices({ ...payload, timestamp: future }, NOW)).toEqual([]);
  });
});

describe("resolvePremiums", () => {
  it("takes the first number in each candidate list", () => {
    expect(
      resolvePremiums({ buy: [undefined, 0.05, 0.07], sell: [null, -0.01] }),
    ).toEqual({ buyPremium: 0.05, sellPremium: -0.01 });
  });

  it("keeps an explicit 0 instead of falling through", () => {
    expect(resolvePremiums({ buy: [0], sell: [0] })).toEqual({
      buyPremium: 0,
      sellPremium: 0,
    });
  });

  it("defaults to a 3% buy premium and selling at spot", () => {
    expect(resolvePremiums({})).toEqual({
      buyPremium: DEFAULT_BUY_PREMIUM,
      sellPremium: 0,
    });
    expect(DEFAULT_BUY_PREMIUM).toBe(0.03);
  });
});

describe("freshSpotPerOunce", () => {
  it("applies the same staleness window as valueVaultItem", () => {
    expect(freshSpotPerOunce(3000, NOW - SPOT_PRICE_MAX_AGE_MS, NOW)).toBe(3000);
    expect(freshSpotPerOunce(3000, NOW - SPOT_PRICE_MAX_AGE_MS - 1, NOW)).toBeNull();
    expect(
      freshSpotPerOunce(3000, NOW + SPOT_PRICE_MAX_FUTURE_SKEW_MS + 1, NOW),
    ).toBeNull();
    expect(freshSpotPerOunce(null, NOW, NOW)).toBeNull();
    expect(freshSpotPerOunce(3000, null, NOW)).toBeNull();
  });
});

describe("valueMetalItem", () => {
  const item = {
    fineWeightGrams: TROY_OUNCE_GRAMS,
    quantity: 2,
    buyPremium: 0.05,
    sellPremium: -0.02,
    purchasePricePerUnit: 2500,
  };

  it("values at fresh spot with per-unit buy/sell prices and P/L", () => {
    const v = valueMetalItem(item, { pricePerOunce: 3000, sourceTimestamp: NOW }, NOW);
    expect(v.pricedAtSpot).toBe(true);
    expect(v.currentBuyPrice).toBeCloseTo(3150, 6);
    expect(v.currentSellPrice).toBeCloseTo(2940, 6);
    expect(v.marketValue).toBeCloseTo(5880, 6);
    expect(v.meltValue).toBeCloseTo(6000, 6);
    expect(v.buyPremiumValue).toBeCloseTo(300, 6);
    expect(v.sellPremiumValue).toBeCloseTo(-120, 6);
    expect(v.totalCost).toBe(5000);
    expect(v.profitLoss).toBeCloseTo(880, 6);
    expect(v.profitLossPercent).toBeCloseTo(17.6, 6);
  });

  it("matches the server valuation (valueVaultItem)", () => {
    const v = valueMetalItem(item, { pricePerOunce: 3000, sourceTimestamp: NOW }, NOW);
    expect(v.marketValue).toBeCloseTo(
      valueVaultItem(item, spot(3000), NOW).value,
      9,
    );
  });

  it("falls back to cost with no P/L when the spot price is stale", () => {
    const v = valueMetalItem(
      item,
      { pricePerOunce: 3000, sourceTimestamp: NOW - SPOT_PRICE_MAX_AGE_MS - 1 },
      NOW,
    );
    expect(v.pricedAtSpot).toBe(false);
    expect(v.marketValue).toBe(5000);
    expect(v.currentSellPrice).toBe(0);
    expect(v.profitLoss).toBeNull();
    expect(v.profitLossPercent).toBeNull();
  });
});

describe("summarizeMetalItems", () => {
  const valued = (
    metalType: string,
    marketValue: number,
    totalCost: number | null,
  ) => ({
    metalType,
    fineWeightGrams: 10,
    quantity: 1,
    marketValue,
    meltValue: marketValue,
    totalCost,
  });

  it("computes P/L only over items with a purchase price", () => {
    const s = summarizeMetalItems([
      valued("gold", 1200, 1000),
      valued("gold", 800, null),
      valued("silver", 0, 50),
    ]);
    expect(s.gold.marketValue).toBe(2000);
    expect(s.gold.totalCost).toBe(1000);
    expect(s.gold.profitLoss).toBe(200);
    expect(s.gold.profitLossPercent).toBe(20);
    expect(s.gold.coverage).toBe(0.6);
    // a worthless item with a cost is a loss, not ignored
    expect(s.silver.profitLoss).toBe(-50);
    expect(s.totalCost).toBe(1050);
    expect(s.totalProfitLoss).toBe(150);
    expect(s.allocation.gold).toBe(100);
    expect(s.platinum).toMatchObject({ itemCount: 0, totalCost: null, coverage: null });
  });

  it("leaves items without a fresh spot price out of cost and P/L", () => {
    // gold valued at spot; silver fell back to its cost (no fresh spot)
    const s = summarizeMetalItems([
      { ...valued("gold", 1200, 1000), pricedAtSpot: true },
      { ...valued("silver", 500, 500), pricedAtSpot: false },
    ]);
    expect(s.totalMarketValue).toBe(1700);
    expect(s.totalCost).toBe(1000);
    expect(s.unrealizedProfitLoss).toBe(200);
    expect(s.coverage).toBeCloseTo(1200 / 1700, 10);
    expect(s.pricedAtSpot).toBe(false);
    expect(s.silver).toMatchObject({ totalCost: null, profitLoss: null, coverage: 0 });
  });

  it("has an unknown P/L when no item has a fresh spot price", () => {
    const s = summarizeMetalItems([
      { ...valued("gold", 1000, 1000), pricedAtSpot: false },
    ]);
    expect(s.totalMarketValue).toBe(1000);
    expect(s.unrealizedProfitLoss).toBeNull();
    expect(s.totalProfitLoss).toBeNull();
    expect(s.coverage).toBe(0);
  });

  it("has no cost or P/L when no item has a purchase price", () => {
    const s = summarizeMetalItems([valued("gold", 500, null)]);
    expect(s.totalCost).toBeNull();
    expect(s.totalProfitLoss).toBeNull();
    expect(s.coverage).toBe(0);
  });
});

describe("convertAtSpotRates", () => {
  const rates = { eurToUsd: 2, eurToChf: 0.5 };

  it("leaves an amount in the same currency unchanged", () => {
    expect(convertAtSpotRates(100, "eur", "EUR", null)).toBe(100);
  });

  it("converts an EUR cost to the display currency", () => {
    // A USD 200 purchase stored as EUR 100 is USD 200 again in a USD view
    expect(convertAtSpotRates(100, "EUR", "usd", rates)).toBe(200);
    expect(convertAtSpotRates(100, "EUR", "chf", rates)).toBe(50);
  });

  it("converts between two non-EUR currencies through EUR", () => {
    expect(convertAtSpotRates(200, "USD", "CHF", rates)).toBe(50);
  });

  it("is null without a usable rate", () => {
    expect(convertAtSpotRates(100, "EUR", "USD", { eurToUsd: null, eurToChf: 1 })).toBeNull();
    expect(convertAtSpotRates(100, "EUR", "USD", undefined)).toBeNull();
    expect(convertAtSpotRates(100, "GBP", "EUR", rates)).toBeNull();
  });
});
