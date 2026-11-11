import { describe, it, expect } from "vitest";

import {
  buildCategorySummary,
  groupSmallSlices,
  holdingProfitLoss,
  positionCostBasis,
  positionToHolding,
  resolveCategoryProfitLoss,
  summarizeHoldings,
  topHoldings,
} from "./categorySummary";

describe("summarizeHoldings", () => {
  it("computes cost and P/L only over holdings with a cost basis", () => {
    // A transfer-in without cost basis worth 5000 must not count as profit
    const s = summarizeHoldings([
      { value: 1200, costBasis: 1000 },
      { value: 5000, costBasis: undefined },
    ]);
    expect(s.value).toBe(6200);
    expect(s.count).toBe(2);
    expect(s.costBasis).toBe(1000);
    expect(s.coveredValue).toBe(1200);
    expect(s.profitLoss).toBe(200);
    expect(s.profitLossPercent).toBe(20);
    expect(s.coverage).toBeCloseTo(1200 / 6200, 12);
  });

  it("keeps a break-even P/L of 0 (not null)", () => {
    const s = summarizeHoldings([{ value: 1000, costBasis: 1000 }]);
    expect(s.profitLoss).toBe(0);
    expect(s.profitLossPercent).toBe(0);
  });

  it("counts a worthless holding with a cost as a full loss", () => {
    const s = summarizeHoldings([{ value: 0, costBasis: 300 }]);
    expect(s.profitLoss).toBe(-300);
    expect(s.profitLossPercent).toBe(-100);
    expect(s.coverage).toBeNull();
  });

  it("has no cost or P/L when no holding has a cost basis", () => {
    const s = summarizeHoldings([{ value: 100, costBasis: null }]);
    expect(s).toMatchObject({
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      coveredValue: 0,
      coverage: 0,
    });
  });

  it("has no percent for a zero cost basis", () => {
    const s = summarizeHoldings([{ value: 100, costBasis: 0 }]);
    expect(s.profitLoss).toBe(100);
    expect(s.profitLossPercent).toBeNull();
  });

  it("summarises an empty list", () => {
    expect(summarizeHoldings([])).toEqual({
      value: 0,
      count: 0,
      costBasis: null,
      coveredValue: 0,
      profitLoss: null,
      profitLossPercent: null,
      coverage: null,
    });
  });
});

describe("positionCostBasis / positionToHolding", () => {
  it("converts the cost basis with the rate used for the value", () => {
    const usd = {
      _id: "p1",
      symbol: "AAPL",
      marketValue: 1100,
      valueInBaseCurrency: 1000,
      exchangeRateUsed: 1000 / 1100,
      totalCostBasis: 880,
    };
    expect(positionCostBasis(usd)).toBeCloseTo(800, 9);
    expect(positionToHolding(usd)).toEqual({
      id: "p1",
      name: "AAPL",
      subcategory: "unknown",
      value: 1000,
      costBasis: positionCostBasis(usd),
    });
  });

  it("keeps the raw cost without a conversion and null without a cost", () => {
    expect(positionCostBasis({ _id: "a", totalCostBasis: 50 })).toBe(50);
    expect(positionCostBasis({ _id: "b", valueInBaseCurrency: 10 })).toBeNull();
  });

  it("falls back from valueInBaseCurrency to marketValue to 0", () => {
    expect(positionToHolding({ _id: "a", marketValue: 7 }).value).toBe(7);
    expect(positionToHolding({ _id: "b" }).value).toBe(0);
  });
});

describe("buildCategorySummary", () => {
  it("summarises the category and each subcategory under one policy", () => {
    const s = buildCategorySummary([
      { id: "a", name: "A", subcategory: "stocks", value: 150, costBasis: 100 },
      { id: "b", name: "B", subcategory: "stocks", value: 50, costBasis: null },
      { id: "c", name: "C", subcategory: "etfs", value: 90, costBasis: 100 },
    ]);
    expect(s.value).toBe(290);
    expect(s.costBasis).toBe(200);
    expect(s.profitLoss).toBe(40);
    expect(s.bySubcategory.stocks).toMatchObject({
      value: 200,
      count: 2,
      costBasis: 100,
      profitLoss: 50,
      coverage: 0.75,
    });
    expect(s.bySubcategory.etfs.profitLoss).toBe(-10);
  });
});

describe("holdingProfitLoss / topHoldings", () => {
  it("derives P/L from value and cost, null without a cost", () => {
    expect(holdingProfitLoss({ value: 120, costBasis: 100 })).toEqual({
      profitLoss: 20,
      profitLossPercent: 20,
    });
    expect(holdingProfitLoss({ value: 100, costBasis: 100 })).toEqual({
      profitLoss: 0,
      profitLossPercent: 0,
    });
    expect(holdingProfitLoss({ value: 120, costBasis: undefined })).toEqual({
      profitLoss: null,
      profitLossPercent: null,
    });
  });

  it("returns the largest holdings without mutating the input", () => {
    const input = [{ value: 1 }, { value: 3 }, { value: 2 }];
    expect(topHoldings(input, 2)).toEqual([{ value: 3 }, { value: 2 }]);
    expect(input[0].value).toBe(1);
  });
});

describe("groupSmallSlices", () => {
  it("groups slices under the threshold and beyond the slot limit", () => {
    const slices = [50, 30, 10, 5, 3, 1, 1].map((value, i) => ({
      id: i,
      value,
    }));
    const r = groupSmallSlices(slices, { thresholdPercent: 2, maxSlices: 4 });
    expect(r.shown.map((s) => s.value)).toEqual([50, 30, 10]);
    expect(r.otherValue).toBe(10);
    expect(r.total).toBe(100);
  });

  it("puts everything into other when the total is 0", () => {
    const r = groupSmallSlices([{ value: 0 }], {
      thresholdPercent: 2,
      maxSlices: 8,
    });
    expect(r.shown).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("resolveCategoryProfitLoss", () => {
  const holdings = { costBasis: 1000, profitLoss: 0, profitLossPercent: 0 };

  it("prefers the holdings' cost basis, even at break-even", () => {
    expect(
      resolveCategoryProfitLoss({
        currentValue: 5000,
        holdings,
        firstSnapshotValue: 4000,
      }),
    ).toEqual({
      costBasis: 1000,
      profitLoss: 0,
      profitLossPercent: 0,
      source: "cost-basis",
    });
  });

  it("falls back to the first snapshot value when no holding has a cost", () => {
    expect(
      resolveCategoryProfitLoss({
        currentValue: 5000,
        holdings: {
          costBasis: null,
          profitLoss: null,
          profitLossPercent: null,
        },
        firstSnapshotValue: 4000,
      }),
    ).toEqual({
      costBasis: 4000,
      profitLoss: 1000,
      profitLossPercent: 25,
      source: "first-snapshot",
    });
  });

  it("returns cost basis and P/L from the same source", () => {
    const r = resolveCategoryProfitLoss({
      currentValue: 5000,
      holdings,
      firstSnapshotValue: 4000,
    });
    // cost line and KPI agree: value-of-covered - costBasis = profitLoss
    expect(r.source).toBe("cost-basis");
    expect(r.costBasis).toBe(holdings.costBasis);
  });

  it("reports nothing without a cost basis or snapshot", () => {
    expect(
      resolveCategoryProfitLoss({
        currentValue: 5000,
        holdings: null,
        firstSnapshotValue: null,
      }),
    ).toEqual({
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      source: null,
    });
  });
});
