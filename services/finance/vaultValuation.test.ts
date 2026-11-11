import { describe, it, expect } from "vitest";

import {
  SPOT_PRICE_MAX_AGE_MS,
  SPOT_PRICE_MAX_FUTURE_SKEW_MS,
  TROY_OUNCE_GRAMS,
  parseLatestMetalPrices,
  valueVaultItem,
} from "@/convex/lib/priceCalculations";

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
