import { describe, it, expect } from "vitest";

import {
  summarizeUnrealizedProfitLoss,
  sumCostCoveredValue,
} from "./unrealizedProfitLoss";

describe("summarizeUnrealizedProfitLoss", () => {
  it("computes P/L over cost-bearing categories only (NW-2 scenario)", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 50_000, costBasis: null }, // cash
      { value: 100_000, costBasis: 80_000 }, // broker equities
      { value: 20_000, costBasis: null }, // Bitpanda crypto
      { value: 10_000, costBasis: 8_000 }, // vault metals
    ]);

    expect(r.costBasis).toBe(88_000);
    expect(r.coveredValue).toBe(110_000);
    expect(r.profitLoss).toBe(22_000);
    expect(r.profitLossPercent).toBeCloseTo(25, 10);
    expect(r.coverage).toBeCloseTo(110_000 / 180_000, 10);
  });

  it("does not count cash as profit (RD-1 scenario)", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 50_000, costBasis: null },
      { value: 10_000, costBasis: null },
      { value: 100_000, costBasis: 80_000 },
    ]);
    expect(r.profitLoss).toBe(20_000);
    expect(r.profitLossPercent).toBeCloseTo(25, 10);
  });

  it("returns null P/L and zero coverage when nothing has a cost basis", () => {
    const r = summarizeUnrealizedProfitLoss([{ value: 5_000, costBasis: null }]);
    expect(r).toEqual({
      costBasis: null,
      coveredValue: 0,
      profitLoss: null,
      profitLossPercent: null,
      coverage: 0,
    });
  });

  it("ignores empty categories that report a cost basis", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 0, costBasis: 0 },
      { value: 1_000, costBasis: 1_200 },
    ]);
    expect(r.profitLoss).toBe(-200);
    expect(r.coverage).toBe(1);
  });

  it("returns null percent for a zero cost basis and null coverage without assets", () => {
    expect(
      summarizeUnrealizedProfitLoss([{ value: 100, costBasis: 0 }])
        .profitLossPercent,
    ).toBeNull();
    expect(summarizeUnrealizedProfitLoss([]).coverage).toBeNull();
  });
});

describe("summarizeUnrealizedProfitLoss with partially covered categories", () => {
  it("compares a partial cost basis only with the value it covers", () => {
    // Equities: EUR 100k broker (cost 80k) + EUR 20k Bitpanda stocks (no cost)
    const equities = [
      { value: 100_000, costBasis: 80_000 },
      { value: 20_000, costBasis: null },
    ];
    const r = summarizeUnrealizedProfitLoss([
      {
        value: 120_000,
        costBasis: 80_000,
        coveredValue: sumCostCoveredValue(equities),
      },
    ]);
    expect(r.costBasis).toBe(80_000);
    expect(r.coveredValue).toBe(100_000);
    expect(r.profitLoss).toBe(20_000);
    expect(r.profitLossPercent).toBe(25);
    expect(r.coverage).toBeCloseTo(100_000 / 120_000, 10);
  });

  it("drops a category whose cost-bearing holdings have no value", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 20_000, costBasis: 0, coveredValue: 0 },
      { value: 1_000, costBasis: 800 },
    ]);
    expect(r.profitLoss).toBe(200);
    expect(r.coverage).toBeCloseTo(1_000 / 21_000, 10);
  });
});

describe("sumCostCoveredValue", () => {
  it("sums only holdings with a cost basis (zero counts, null/undefined do not)", () => {
    expect(
      sumCostCoveredValue([
        { value: 10, costBasis: 0 },
        { value: 20, costBasis: null },
        { value: 30, costBasis: undefined },
        { value: 40, costBasis: 5 },
      ]),
    ).toBe(50);
  });
});
