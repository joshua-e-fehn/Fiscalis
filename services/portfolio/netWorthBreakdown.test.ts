import { describe, it, expect } from "vitest";

import {
  bucketProviderHoldings,
  buildSnapshotBreakdown,
} from "./netWorthBreakdown";
import { snapshotCostLine } from "./unrealizedProfitLoss";

describe("bucketProviderHoldings", () => {
  const buckets = bucketProviderHoldings({
    brokerPositions: [
      // USD position: value and cost stamped in EUR at sync time
      {
        _id: "aapl",
        investmentCategory: "equities",
        valueInBaseCurrency: 1_012,
        costBasisInBaseCurrency: 920,
      },
      // Position in a currency without a rate: no base value, counts 0
      { _id: "vnd", investmentCategory: "equities" },
      // Unclassified and commodity positions count as equities
      { _id: "x", valueInBaseCurrency: 300 },
      { _id: "etc", investmentCategory: "commodities", valueInBaseCurrency: 200 },
      { _id: "bond", investmentCategory: "bonds", valueInBaseCurrency: 500, costBasisInBaseCurrency: 480 },
      { _id: "btc", investmentCategory: "crypto", valueInBaseCurrency: 1_100, costBasisInBaseCurrency: 1_000 },
      { _id: "mm", investmentCategory: "cash", valueInBaseCurrency: 50 },
      { _id: "margin", investmentCategory: "liabilities", valueInBaseCurrency: -70 },
    ],
    vaultHoldings: [
      { value: 1_200, costBasis: 1_000 },
      { value: 5_000, costBasis: null }, // vault item without a purchase price
    ],
    bitpandaHoldings: [
      { _id: "eth", investmentCategory: "crypto", valueInBaseCurrency: 9_000 },
      { _id: "doge", valueInBaseCurrency: 100 },
      { _id: "gold", investmentCategory: "commodities", valueInBaseCurrency: 800 },
      { _id: "eur", investmentCategory: "cash", valueInBaseCurrency: 25 },
      { _id: "stock", investmentCategory: "equities", valueInBaseCurrency: 40 },
    ],
  });

  it("reads value and cost only from the base-currency fields", () => {
    const e = buckets.categories.equities;
    expect(e.value).toBe(1_012 + 300 + 200 + 40);
    expect(e.costBasis).toBeCloseTo(920, 10);
    expect(e.coveredValue).toBe(1_012);
    expect(e.profitLoss).toBeCloseTo(92, 10);
  });

  it("keeps vault items without a price and Bitpanda commodities out of the cost", () => {
    const c = buckets.categories.commodities;
    expect(c.value).toBe(1_200 + 5_000 + 800);
    expect(c.costBasis).toBe(1_000);
    expect(c.coveredValue).toBe(1_200);
    expect(c.profitLoss).toBe(200);
  });

  it("routes unclassified Bitpanda holdings to crypto without a cost", () => {
    const c = buckets.categories.crypto;
    expect(c.value).toBe(1_100 + 9_000 + 100);
    expect(c.costBasis).toBe(1_000);
    expect(c.coveredValue).toBe(1_100);
    expect(c.profitLoss).toBe(100);
  });

  it("sums provider cash and liabilities", () => {
    expect(buckets.categories.bonds).toMatchObject({ value: 500, costBasis: 480 });
    expect(buckets.cash).toBe(75);
    expect(buckets.liabilities).toBe(70);
  });

  it("has no cost for a category without one", () => {
    const empty = bucketProviderHoldings({
      brokerPositions: [],
      vaultHoldings: [],
      bitpandaHoldings: [{ _id: "eth", valueInBaseCurrency: 500 }],
    });
    expect(empty.categories.crypto).toMatchObject({
      value: 500,
      costBasis: null,
      profitLoss: null,
    });
  });
});

describe("buildSnapshotBreakdown", () => {
  const { categories } = bucketProviderHoldings({
    brokerPositions: [
      { _id: "s", investmentCategory: "equities", valueInBaseCurrency: 1_000, costBasisInBaseCurrency: 800 },
    ],
    vaultHoldings: [
      { value: 1_200, costBasis: 1_000 },
      { value: 5_000, costBasis: null },
    ],
    bitpandaHoldings: [{ _id: "eth", valueInBaseCurrency: 9_000 }],
  });
  const b = buildSnapshotBreakdown(300, categories);

  it("records the covered value next to every cost basis", () => {
    expect(b.categoryBreakdown).toEqual([
      { category: "cash", value: 300 },
      { category: "equities", value: 1_000, costBasis: 800, coveredValue: 1_000 },
      { category: "crypto", value: 9_000 },
      {
        category: "commodities",
        value: 6_200,
        costBasis: 1_000,
        coveredValue: 1_200,
      },
    ]);
    expect(b.investmentsValue).toBe(16_200);
    expect(b.totalCostBasis).toBe(1_800);
    expect(b.totalCoveredValue).toBe(2_200);
  });

  it("gives a cost line whose gap to the value is the covered P/L", () => {
    const commodities = b.categoryBreakdown.find(
      (c) => c.category === "commodities",
    )!;
    expect(commodities.value - snapshotCostLine(commodities)!).toBe(200);
  });

  it("leaves the cost totals undefined when nothing has a cost basis", () => {
    const none = buildSnapshotBreakdown(
      0,
      bucketProviderHoldings({
        brokerPositions: [],
        vaultHoldings: [],
        bitpandaHoldings: [],
      }).categories,
    );
    expect(none).toEqual({
      categoryBreakdown: [],
      investmentsValue: 0,
      costBasisInBaseCurrency: undefined,
      totalCoveredValue: undefined,
    });
  });
});
