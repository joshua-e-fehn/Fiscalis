import { describe, expect, it } from "vitest";

import { resolveHoldingPrice } from "./holdingPrice";

const NOW = Date.UTC(2026, 10, 12, 9, 0, 0);
const YESTERDAY = Date.UTC(2026, 10, 11, 9, 0, 0);

describe("resolveHoldingPrice", () => {
  it("uses the live ticker price and values the holding at it", () => {
    expect(
      resolveHoldingPrice({
        quantity: 0.5,
        livePrice: 61234.567,
        previous: { currentPrice: 60000, priceAsOf: YESTERDAY },
        now: NOW,
      }),
    ).toEqual({
      currentPrice: 61234.567,
      marketValue: 30617.28,
      priceStatus: "live",
      priceAsOf: NOW,
    });
  });

  it("keeps the last known price, flagged stale with its own time, when the ticker has none", () => {
    expect(
      resolveHoldingPrice({
        quantity: 3,
        livePrice: undefined,
        previous: { currentPrice: 2.125, priceAsOf: YESTERDAY },
        now: NOW,
      }),
    ).toEqual({
      currentPrice: 2.125,
      marketValue: 6.38,
      priceStatus: "stale",
      priceAsOf: YESTERDAY,
    });
  });

  it("revalues a stale price at this sync's quantity", () => {
    expect(
      resolveHoldingPrice({
        quantity: 10,
        livePrice: undefined,
        previous: { currentPrice: 4, priceAsOf: YESTERDAY },
        now: NOW,
      }).marketValue,
    ).toBe(40);
  });

  it("treats a zero, negative or non-finite ticker price as no price", () => {
    for (const livePrice of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveHoldingPrice({
          quantity: 2,
          livePrice,
          previous: { currentPrice: 5, priceAsOf: YESTERDAY },
          now: NOW,
        }),
      ).toEqual({
        currentPrice: 5,
        marketValue: 10,
        priceStatus: "stale",
        priceAsOf: YESTERDAY,
      });
    }
  });

  it("leaves the value undefined, not 0, when no price was ever known", () => {
    const missing = {
      currentPrice: undefined,
      marketValue: undefined,
      priceStatus: "missing",
      priceAsOf: undefined,
    };
    expect(
      resolveHoldingPrice({
        quantity: 7,
        livePrice: undefined,
        previous: undefined,
        now: NOW,
      }),
    ).toEqual(missing);
    expect(
      resolveHoldingPrice({
        quantity: 7,
        livePrice: undefined,
        previous: { currentPrice: undefined, priceAsOf: YESTERDAY },
        now: NOW,
      }),
    ).toEqual(missing);
  });

  it("keeps a stale price without a time when the previous row had none", () => {
    expect(
      resolveHoldingPrice({
        quantity: 1,
        livePrice: undefined,
        previous: { currentPrice: 1.5 },
        now: NOW,
      }),
    ).toEqual({
      currentPrice: 1.5,
      marketValue: 1.5,
      priceStatus: "stale",
      priceAsOf: undefined,
    });
  });
});
