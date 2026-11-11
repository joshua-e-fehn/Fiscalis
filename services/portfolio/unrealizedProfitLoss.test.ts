import { describe, it, expect } from "vitest";

import {
  costLine,
  coveredValueOf,
  snapshotCostLine,
  summarizeUnrealizedProfitLoss,
  sumCostCoveredValue,
} from "./unrealizedProfitLoss";
import { summarizeHoldings } from "./categorySummary";

/** A category as the dashboard passes it: value, cost and P/L of a summary. */
function category(holdings: { value: number; costBasis: number | null }[]) {
  const s = summarizeHoldings(holdings);
  return { value: s.value, costBasis: s.costBasis, profitLoss: s.profitLoss };
}

describe("summarizeUnrealizedProfitLoss", () => {
  it("computes P/L over cost-bearing categories only (NW-2 scenario)", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 50_000, costBasis: null, profitLoss: null }, // cash
      { value: 100_000, costBasis: 80_000, profitLoss: 20_000 }, // broker equities
      { value: 20_000, costBasis: null, profitLoss: null }, // Bitpanda crypto
      { value: 10_000, costBasis: 8_000, profitLoss: 2_000 }, // vault metals
    ]);

    expect(r.costBasis).toBe(88_000);
    expect(r.coveredValue).toBe(110_000);
    expect(r.profitLoss).toBe(22_000);
    expect(r.profitLossPercent).toBeCloseTo(25, 10);
    expect(r.coverage).toBeCloseTo(110_000 / 180_000, 10);
  });

  it("does not count cash as profit (RD-1 scenario)", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 50_000, costBasis: null, profitLoss: null },
      { value: 10_000, costBasis: null, profitLoss: null },
      { value: 100_000, costBasis: 80_000, profitLoss: 20_000 },
    ]);
    expect(r.profitLoss).toBe(20_000);
    expect(r.profitLossPercent).toBeCloseTo(25, 10);
  });

  it("returns null P/L and zero coverage when nothing has a cost basis", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 5_000, costBasis: null, profitLoss: null },
    ]);
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
      { value: 0, costBasis: 0, profitLoss: 0 },
      { value: 1_000, costBasis: 1_200, profitLoss: -200 },
    ]);
    expect(r.profitLoss).toBe(-200);
    expect(r.coverage).toBe(1);
  });

  it("returns null percent for a zero cost basis and null coverage without assets", () => {
    expect(
      summarizeUnrealizedProfitLoss([
        { value: 100, costBasis: 0, profitLoss: 100 },
      ])
        .profitLossPercent,
    ).toBeNull();
    expect(summarizeUnrealizedProfitLoss([]).coverage).toBeNull();
  });
});

describe("summarizeUnrealizedProfitLoss with partially covered categories", () => {
  it("compares a partial cost basis only with the value it covers", () => {
    // Equities: EUR 100k broker (cost 80k) + EUR 20k Bitpanda stocks (no cost)
    const r = summarizeUnrealizedProfitLoss([
      category([
        { value: 100_000, costBasis: 80_000 },
        { value: 20_000, costBasis: null },
      ]),
    ]);
    expect(r.costBasis).toBe(80_000);
    expect(r.coveredValue).toBe(100_000);
    expect(r.profitLoss).toBe(20_000);
    expect(r.profitLossPercent).toBe(25);
    expect(r.coverage).toBeCloseTo(100_000 / 120_000, 10);
  });

  it("never reports the uncovered value of a category as P/L", () => {
    // Vault gold A (1200, cost 1000) + gold B (5000, no purchase price), and
    // broker BTC (1100, cost 1000) + Bitpanda ETH (9000, no cost)
    const r = summarizeUnrealizedProfitLoss([
      category([
        { value: 1_200, costBasis: 1_000 },
        { value: 5_000, costBasis: null },
      ]),
      category([
        { value: 1_100, costBasis: 1_000 },
        { value: 9_000, costBasis: null },
      ]),
    ]);
    expect(r.costBasis).toBe(2_000);
    expect(r.coveredValue).toBe(2_300);
    expect(r.profitLoss).toBe(300);
    expect(r.profitLossPercent).toBe(15);
    expect(r.coverage).toBeCloseTo(2_300 / 16_300, 10);
  });

  it("drops a category whose cost-bearing holdings have no value", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 20_000, costBasis: 0, profitLoss: 0 },
      { value: 1_000, costBasis: 800, profitLoss: 200 },
    ]);
    expect(r.profitLoss).toBe(200);
    expect(r.coverage).toBeCloseTo(1_000 / 21_000, 10);
  });

  it("drops a category with a cost basis but no P/L", () => {
    const r = summarizeUnrealizedProfitLoss([
      { value: 5_000, costBasis: 1_000, profitLoss: null },
    ]);
    expect(r.profitLoss).toBeNull();
  });
});

describe("coveredValueOf", () => {
  it("is cost basis plus P/L, null when either is unknown", () => {
    expect(coveredValueOf(1_000, 200)).toBe(1_200);
    expect(coveredValueOf(1_000, -1_000)).toBe(0);
    expect(coveredValueOf(null, 200)).toBeNull();
    expect(coveredValueOf(1_000, null)).toBeNull();
  });
});

describe("costLine", () => {
  it("makes value minus the line equal the reported P/L", () => {
    // Metals page: 6200 total, P/L +200 over the item with a price
    const s = summarizeHoldings([
      { value: 1_200, costBasis: 1_000 },
      { value: 5_000, costBasis: null },
    ]);
    const line = costLine(s.value, s.profitLoss);
    expect(line).toBe(6_000);
    expect(s.value - line!).toBe(s.profitLoss);
  });

  it("is null without a P/L", () => {
    expect(costLine(5_000, null)).toBeNull();
  });
});

describe("snapshotCostLine", () => {
  it("adds the uncovered value to the stored cost basis", () => {
    // 6200 commodities, of which 1200 carry a cost of 1000
    expect(
      snapshotCostLine({ value: 6_200, costBasis: 1_000, coveredValue: 1_200 }),
    ).toBe(6_000);
  });

  it("falls back to the stored cost basis for snapshots without coveredValue", () => {
    expect(snapshotCostLine({ value: 6_200, costBasis: 1_000 })).toBe(1_000);
  });

  it("is null without a cost basis", () => {
    expect(snapshotCostLine({ value: 6_200 })).toBeNull();
    expect(
      snapshotCostLine({ value: 6_200, costBasis: null, coveredValue: 0 }),
    ).toBeNull();
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
