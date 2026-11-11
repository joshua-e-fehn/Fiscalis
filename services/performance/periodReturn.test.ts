/**
 * Flow-adjusted performance (D2): computePeriodReturn and the flows each
 * strategy derives (snapshot cost changes, vault purchases).
 */

import { describe, expect, it } from "vitest";

import { computePeriodReturn } from "./strategies/base";
import { DiscretePerformanceStrategy } from "./strategies/discrete";
import { ContinuousPerformanceStrategy } from "./strategies/continuous";
import { HybridPerformanceStrategy } from "./strategies/hybrid";
import type { HoldingData, SnapshotCategoryBreakdown, SnapshotData } from "./types";
import { TROY_OUNCE_GRAMS } from "../finance/metals";
import {
  aggregateNetWorth,
  buildSnapshotBreakdown,
  withoutSnapshotHoldings,
  type HoldingSource,
  type NormalizedHolding,
  type SnapshotCategoryEntry,
} from "../portfolio/aggregate";

const DAY = 86_400_000;
const JAN_1 = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 0, 31);
const ytd = { timeRange: "YTD" as const, endTimestamp: END, includeDataPoints: true };

describe("computePeriodReturn", () => {
  it("counts a deposit-only period as a 0% return", () => {
    const r = computePeriodReturn(
      [
        { timestamp: 0, value: 1_000 },
        { timestamp: 10, value: 2_000 },
      ],
      [{ timestamp: 5, amount: 1_000 }],
    )!;
    expect(r.valueChange).toBe(1_000);
    expect(r.netFlows).toBe(1_000);
    expect(r.profitLoss).toBe(0);
    expect(r.modifiedDietzPercent).toBe(0);
    expect(r.timeWeightedPercent).toBe(0);
  });

  it("weights a mid-period purchase by the time it was invested", () => {
    const r = computePeriodReturn(
      [
        { timestamp: 0, value: 1_000 },
        { timestamp: 10, value: 2_200 },
      ],
      [{ timestamp: 5, amount: 1_000 }],
    )!;
    expect(r.profitLoss).toBe(200);
    // 200 / (1 000 + 1 000 × 5/10)
    expect(r.modifiedDietzPercent).toBeCloseTo(13.333, 3);
  });

  it("adds a sale's proceeds back", () => {
    const r = computePeriodReturn(
      [
        { timestamp: 0, value: 1_000 },
        { timestamp: 10, value: 500 },
      ],
      [{ timestamp: 5, amount: -600 }],
    )!;
    expect(r.profitLoss).toBe(100);
    // 100 / (1 000 − 600 × 5/10)
    expect(r.modifiedDietzPercent).toBeCloseTo(14.286, 3);
  });

  it("chains the sub-periods into a time-weighted return", () => {
    // +10% before a deposit made at t=1 (in that point's value), +10% after
    const r = computePeriodReturn(
      [
        { timestamp: 0, value: 100 },
        { timestamp: 1, value: 220 },
        { timestamp: 2, value: 242 },
      ],
      [{ timestamp: 1, amount: 110 }],
    )!;
    expect(r.timeWeightedPercent).toBeCloseTo(21, 6);
    expect(r.profitLoss).toBe(32);
    expect(r.modifiedDietzPercent).toBeCloseTo((32 / 155) * 100, 6);
  });

  it("measures a holding bought from nothing against the capital invested", () => {
    const r = computePeriodReturn(
      [
        { timestamp: 0, value: 0 },
        { timestamp: 10, value: 1_100 },
      ],
      [{ timestamp: 5, amount: 1_000 }],
    )!;
    expect(r.profitLoss).toBe(100);
    expect(r.modifiedDietzPercent).toBeCloseTo(20);
  });

  it("weights a flow known only within its span from the span's middle", () => {
    // Dust, then a 1 000 purchase found by the next snapshot, then +10%
    const points = [
      { timestamp: 0, value: 5 },
      { timestamp: 1, value: 990 },
      { timestamp: 2, value: 1_089 },
    ];
    const r = computePeriodReturn(points, [{ timestamp: 1, amount: 1_000, spanStart: 0 }])!;
    expect(r.profitLoss).toBe(84);
    // 84 / (5 + 1 000 × (2 − 0.5)/2)
    expect(r.modifiedDietzPercent).toBeCloseTo((84 / 755) * 100, 9);
    // (990 − 5 − 1 000) / (5 + 500), then 99 / 990
    expect(r.timeWeightedPercent).toBeCloseTo(((490 / 505) * 1.1 - 1) * 100, 9);
  });

  it("has no time-weighted return when a span loses more than its capital", () => {
    // The same purchase dated exactly at the point: −300% on the dust
    const r = computePeriodReturn(
      [
        { timestamp: 0, value: 5 },
        { timestamp: 1, value: 990 },
        { timestamp: 2, value: 1_089 },
      ],
      [{ timestamp: 1, amount: 1_000 }],
    )!;
    expect(r.timeWeightedPercent).toBeNull();
    expect(r.modifiedDietzPercent).toBeCloseTo((84 / 505) * 100, 9);
  });

  it("ignores flows outside the span and has no percent without capital", () => {
    const r = computePeriodReturn(
      [
        { timestamp: 10, value: 0 },
        { timestamp: 20, value: 0 },
      ],
      [{ timestamp: 5, amount: 1_000 }],
    )!;
    expect(r.netFlows).toBe(0);
    expect(r.modifiedDietzPercent).toBeNull();
    expect(r.timeWeightedPercent).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Discrete: flows from snapshot cost changes
// ═══════════════════════════════════════════════════════════════

function snap(
  timestamp: number,
  entries: SnapshotCategoryBreakdown[],
  netWorth = entries.reduce((s, e) => s + e.value, 0),
): SnapshotData {
  return {
    timestamp,
    date: new Date(timestamp).toISOString().slice(0, 10),
    totalAssets: netWorth,
    totalLiabilities: 0,
    netWorth,
    categoryBreakdown: entries,
  };
}

const equities = (value: number): SnapshotCategoryBreakdown => ({
  category: "equities",
  value,
});

/** A holding as lib/netWorth.ts loads it, matched across days by key. */
function held(
  key: string,
  source: HoldingSource,
  category: string,
  valueBase: number,
  costBase: number | null,
): NormalizedHolding {
  return {
    id: `${key}-${valueBase}`,
    key,
    provider: source === "vault" ? "manual" : source === "bitpanda" ? "bitpanda" : "snaptrade",
    source,
    category: category as NormalizedHolding["category"],
    subcategory: "unknown",
    name: key,
    valueBase,
    costBase,
    pricedAt: null,
  };
}

/** Snapshots as takeSnapshot writes them and getSnapshots returns them. */
function written(days: [number, NormalizedHolding[]][]): SnapshotData[] {
  let previous: SnapshotCategoryEntry[] | undefined;
  return days.map(([timestamp, holdings]) => {
    const { categoryBreakdown } = buildSnapshotBreakdown(
      aggregateNetWorth(holdings),
      holdings,
      previous,
    );
    previous = categoryBreakdown;
    return snap(timestamp, withoutSnapshotHoldings(categoryBreakdown));
  });
}
const stock = (value: number, cost: number) => [held("aapl", "brokerPosition", "equities", value, cost)];

describe("discrete strategy flows", () => {
  const discrete = new DiscretePerformanceStrategy();
  const EQUITIES = { kind: "category" as const, category: "equities" };

  it("reports a deposit as a flow, not a gain", () => {
    const { metrics } = discrete.calculate(
      {
        snapshots: written([
          [JAN_1, stock(1_000, 1_000)],
          [JAN_1 + 14 * DAY, stock(2_000, 2_000)],
          [END, stock(2_000, 2_000)],
        ]),
        metric: EQUITIES,
      },
      ytd,
    );
    expect(metrics.absoluteChange).toBe(1_000);
    expect(metrics.netFlows).toBe(1_000);
    expect(metrics.profitLoss).toBe(0);
    expect(metrics.timeWeightedPercent).toBeCloseTo(0);
    expect(metrics.flowCoverage).toBe("complete");
  });

  it("separates a mid-period purchase from the gain", () => {
    const { metrics, dataPoints } = discrete.calculate(
      {
        snapshots: written([
          [JAN_1, stock(1_000, 1_000)],
          [JAN_1 + 14 * DAY, stock(2_000, 2_000)],
          [END, stock(2_100, 2_000)],
        ]),
        metric: EQUITIES,
      },
      ytd,
    );
    expect(metrics.profitLoss).toBe(100);
    expect(metrics.timeWeightedPercent).toBeCloseTo(5);
    // The purchase is not spread over the days before it
    const jan10 = dataPoints.find((p) => p.timestamp === JAN_1 + 9 * DAY)!;
    expect(jan10.value).toBe(1_000);
  });

  it("uses the netFlow the snapshot writer stored", () => {
    const { metrics } = discrete.calculate(
      {
        snapshots: [
          snap(JAN_1, [equities(1_000)]),
          snap(END, [{ ...equities(1_500), netFlow: 400 }]),
        ],
        metric: EQUITIES,
      },
      ytd,
    );
    expect(metrics.profitLoss).toBe(100);
    expect(metrics.flowCoverage).toBe("complete");
  });

  it("flags flows assumed for holdings without a cost basis", () => {
    const crypto = (value: number): SnapshotCategoryBreakdown => ({ category: "crypto", value });
    const { metrics } = discrete.calculate(
      {
        snapshots: [snap(JAN_1, [crypto(1_000)]), snap(END, [crypto(1_200)])],
        metric: { kind: "category", category: "crypto" },
      },
      ytd,
    );
    expect(metrics.profitLoss).toBe(200);
    expect(metrics.flowCoverage).toBe("estimated");
  });

  it("keeps net worth and cash a plain change", () => {
    const snapshots = [
      snap(JAN_1, [{ category: "cash", value: 1_000 }]),
      snap(END, [{ category: "cash", value: 3_000 }]),
    ];
    for (const metric of [
      { kind: "netWorth" as const },
      { kind: "category" as const, category: "cash" },
    ]) {
      const { metrics } = discrete.calculate({ snapshots, metric }, ytd);
      expect(metrics.absoluteChange).toBe(2_000);
      expect(metrics.flowCoverage).toBe("none");
      expect(metrics.profitLoss).toBeNull();
    }
  });

  it("measures since the first snapshot with the firstPoint baseline", () => {
    const snapshots = written([
      [JAN_1 + 10 * DAY, stock(1_000, 1_000)],
      [END, stock(1_300, 1_200)],
    ]);
    const fromStart = discrete.calculate({ snapshots, metric: EQUITIES }, ytd);
    expect(fromStart.metrics.profitLoss).toBeNull();
    const sinceTracking = discrete.calculate(
      { snapshots, metric: EQUITIES },
      { ...ytd, baseline: "firstPoint" },
    );
    expect(sinceTracking.metrics.insufficientHistory).toBe(true);
    expect(sinceTracking.metrics.profitLoss).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// Continuous: vault purchases as exact flows
// ═══════════════════════════════════════════════════════════════

describe("continuous strategy flows", () => {
  const ounce = (id: string, extra: Partial<HoldingData> = {}): HoldingData => ({
    id,
    assetType: "gold",
    quantity: 1,
    fineWeightGrams: TROY_OUNCE_GRAMS,
    sellPremium: 0,
    ...extra,
  });
  const prices = (from: number, to: number, price: (t: number) => number) => {
    const points = [];
    for (let t = from; t <= to; t += DAY) points.push({ timestamp: t, price: price(t) });
    return { gold: points };
  };
  const MID = JAN_1 + 15 * DAY;

  it("counts a purchase during the year at its cost (PF-02)", () => {
    const { metrics } = new ContinuousPerformanceStrategy().calculate(
      {
        holdings: [
          ounce("held"), // no date: held before the range (D3)
          ounce("bought", { purchaseDate: MID, purchasePricePerUnit: 2_000 }),
        ],
        prices: prices(JAN_1 - 7 * DAY, END, () => 2_000),
      },
      ytd,
    );
    expect(metrics.startValue).toBeCloseTo(2_000);
    expect(metrics.endValue).toBeCloseTo(4_000);
    expect(metrics.netFlows).toBe(2_000);
    expect(metrics.profitLoss).toBeCloseTo(0);
    expect(metrics.flowCoverage).toBe("complete");
  });

  it("values a purchase priced in another currency at the spot of its date", () => {
    const { metrics } = new ContinuousPerformanceStrategy().calculate(
      {
        holdings: [
          ounce("bought", { purchaseDate: MID, purchasePricePerUnit: 2_400, purchaseCurrency: "USD" }),
        ],
        prices: prices(JAN_1 - 7 * DAY, END, (t) => (t < MID ? 2_000 : 2_200)),
        currency: "eur",
      },
      ytd,
    );
    // Not $2 400 taken as €2 400: the coin's EUR value that day
    expect(metrics.netFlows).toBeCloseTo(2_200);
    expect(metrics.profitLoss).toBeCloseTo(0);
    // A price in the series' currency is used as is
    const same = new ContinuousPerformanceStrategy().calculate(
      {
        holdings: [
          ounce("bought", { purchaseDate: MID, purchasePricePerUnit: 2_100, purchaseCurrency: "EUR" }),
        ],
        prices: prices(JAN_1 - 7 * DAY, END, (t) => (t < MID ? 2_000 : 2_200)),
        currency: "eur",
      },
      ytd,
    );
    expect(same.metrics.netFlows).toBe(2_100);
  });

  it("values a purchase without a price at the spot of its date", () => {
    const { metrics } = new ContinuousPerformanceStrategy().calculate(
      {
        holdings: [ounce("bought", { purchaseDate: MID })],
        prices: prices(JAN_1 - 7 * DAY, END, (t) => (t < MID ? 2_000 : 2_200)),
      },
      ytd,
    );
    expect(metrics.startValue).toBe(0);
    expect(metrics.netFlows).toBeCloseTo(2_200);
    expect(metrics.profitLoss).toBeCloseTo(0);
  });

  it("adds no flows to net worth in the hybrid strategy", () => {
    const { metrics } = new HybridPerformanceStrategy().calculate(
      {
        discrete: {
          snapshots: [
            snap(JAN_1, [{ category: "cash", value: 1_000 }]),
            snap(END, [{ category: "cash", value: 1_000 }]),
          ],
          metric: { kind: "netWorth" },
        },
        continuous: {
          holdings: [ounce("bought", { purchaseDate: MID, purchasePricePerUnit: 2_000 })],
          prices: prices(JAN_1 - 7 * DAY, END, () => 2_000),
        },
        continuousSources: [{ source: "vault", category: "commodities" }],
      },
      ytd,
    );
    expect(metrics.absoluteChange).toBeCloseTo(2_000);
    expect(metrics.flowCoverage).toBe("none");
  });

  it("combines snapshot and vault flows for commodities in the hybrid strategy", () => {
    const commodities = (vault: number, bitpanda: number, bitpandaCost: number) => [
      ...(vault > 0 ? [held("coin", "vault", "commodities", vault, vault)] : []),
      held("xau", "bitpanda", "commodities", bitpanda, bitpandaCost),
    ];
    const { metrics } = new HybridPerformanceStrategy().calculate(
      {
        discrete: {
          snapshots: written([
            [JAN_1, commodities(0, 500, 500)],
            [END, commodities(2_000, 1_100, 1_000)],
          ]),
          metric: { kind: "category", category: "commodities" },
        },
        continuous: {
          holdings: [ounce("bought", { purchaseDate: MID, purchasePricePerUnit: 2_000 })],
          prices: prices(JAN_1 - 7 * DAY, END, () => 2_000),
        },
        continuousSources: [{ source: "vault", category: "commodities" }],
      },
      ytd,
    );
    // Bitpanda: bought 500 more, gained 100; the vault: bought at value
    expect(metrics.netFlows).toBeCloseTo(2_500);
    expect(metrics.profitLoss).toBeCloseTo(100);
    expect(metrics.flowCoverage).toBe("complete");
  });
});
