/**
 * Performance engine: series lookup, valuation resolution and the
 * strategies' baseline, exclusion and live-spot rules, with exact values on
 * a pinned clock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessDataQuality,
  changePercent,
  lastIndexAtOrBefore,
  valueAt,
} from "./strategies/base";
import {
  continuousSourcesFor,
  getValueTypeForConfig,
  resolveValuationConfig,
} from "./config";
import { calculateDiscretePerformance } from "./strategies/discrete";
import { calculateContinuousPerformance } from "./strategies/continuous";
import { calculateHybridPerformance } from "./strategies/hybrid";
import { calculateSellPrice, valueVaultItem } from "../finance/metals";
import type { HoldingData, SnapshotData } from "./types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 15 Jun 2026 12:00 UTC
const JAN1 = Date.UTC(2026, 0, 1);
const VAULT = [{ source: "vault", category: "commodities" }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function snapshot(
  timestamp: number,
  cash: number,
  vault: number,
  bitpanda = 0,
  liabilities = 0,
): SnapshotData {
  const total = cash + vault + bitpanda;
  return {
    timestamp,
    date: new Date(timestamp).toISOString().slice(0, 10),
    totalAssets: total,
    totalLiabilities: liabilities,
    netWorth: total - liabilities,
    categoryBreakdown: [
      { category: "cash", value: cash },
      {
        category: "commodities",
        value: vault + bitpanda,
        sources: [
          { source: "vault", value: vault },
          { source: "bitpanda", value: bitpanda },
        ],
      },
    ],
  };
}

const gold = (overrides: Partial<HoldingData> = {}): HoldingData => ({
  id: "g1",
  assetType: "gold",
  quantity: 2,
  fineWeightGrams: 31.1034768, // one troy ounce
  sellPremium: -0.02,
  purchasePricePerUnit: 1500,
  ...overrides,
});

describe("series lookup", () => {
  const s = [
    { timestamp: 0, value: 10 },
    { timestamp: 10, value: 20 },
    { timestamp: 100, value: 30 },
  ];
  const opts = { toleranceMs: 2, maxGapMs: 30 };

  it("binary-searches the last point at or before t", () => {
    expect(lastIndexAtOrBefore(s, -1)).toBe(-1);
    expect(lastIndexAtOrBefore(s, 10)).toBe(1);
    expect(lastIndexAtOrBefore(s, 99)).toBe(1);
    expect(lastIndexAtOrBefore(s, 1000)).toBe(2);
  });

  it("matches within tolerance, interpolates small gaps, holds large ones", () => {
    expect(valueAt(s, 11, opts)).toMatchObject({ value: 20, kind: "observed" });
    expect(valueAt(s, 5, { toleranceMs: 1, maxGapMs: 30 })).toMatchObject({
      value: 15,
      kind: "interpolated",
    });
    expect(valueAt(s, 50, opts)).toMatchObject({ value: 20, kind: "held" });
    expect(valueAt(s, 500, opts)).toMatchObject({ value: 30, kind: "held" });
    expect(valueAt(s, 5, { ...opts, interpolate: false })).toMatchObject({
      value: 10,
      kind: "held",
    });
  });

  it("never carries a later value backward beyond half the tolerance", () => {
    expect(valueAt(s, -1, opts)).toMatchObject({ value: 10, kind: "observed" });
    expect(valueAt(s, -2, opts)).toBeNull();
  });

  it("has one quality rule and one percent rule", () => {
    expect(assessDataQuality(9, 10)).toBe("high");
    expect(assessDataQuality(7, 10)).toBe("medium");
    expect(assessDataQuality(6, 10)).toBe("low");
    expect(assessDataQuality(0, 0)).toBe("low");
    expect(changePercent(0, 100)).toBeNull();
    expect(changePercent(null, 100)).toBeNull();
    expect(changePercent(200, 250)).toBe(25);
    expect(changePercent(-200, -100)).toBe(50);
  });
});

describe("valuation resolution", () => {
  it("resolves category default, subcategory override, asset override", () => {
    expect(resolveValuationConfig("equities").method).toBe("discrete");
    expect(resolveValuationConfig("equities", "stocks")).toEqual({
      method: "continuous",
      priceProvider: "market-data",
    });
    expect(resolveValuationConfig("equities", "private").method).toBe("discrete");
    expect(
      resolveValuationConfig("equities", "stocks", { method: "discrete" }).method,
    ).toBe("discrete");
    expect(resolveValuationConfig("commodities", "metals").priceProvider).toBe(
      "metals",
    );
    expect(resolveValuationConfig("commodities", "energy").method).toBe(
      "discrete",
    );
    expect(resolveValuationConfig("bonds", "funds").method).toBe("discrete");
  });

  it("is continuous only where a price feed exists", () => {
    expect(
      getValueTypeForConfig(resolveValuationConfig("commodities", "metals")),
    ).toBe("continuous");
    expect(
      getValueTypeForConfig(resolveValuationConfig("equities", "stocks")),
    ).toBe("discrete");
    expect(continuousSourcesFor("commodities")).toEqual(VAULT);
    expect(continuousSourcesFor("all")).toEqual(VAULT);
    expect(continuousSourcesFor("equities")).toEqual([]);
  });
});

describe("discrete strategy", () => {
  const daily = (days: number, f: (i: number) => SnapshotData) =>
    Array.from({ length: days }, (_, i) => f(i));

  it("measures the named metric; liabilities move net worth only", () => {
    const snaps = [
      snapshot(NOW - 7 * DAY, 1000, 0, 0, 500),
      snapshot(NOW, 1000, 0, 0, 200),
    ];
    const opts = { timeRange: "Week" as const };
    const assets = calculateDiscretePerformance(
      { snapshots: snaps, metric: { kind: "totalAssets" } },
      opts,
    );
    const net = calculateDiscretePerformance(
      { snapshots: snaps, metric: { kind: "netWorth" } },
      opts,
    );
    expect(assets.metrics.absoluteChange).toBe(0);
    expect(net.metrics.startValue).toBe(500);
    expect(net.metrics.endValue).toBe(800);
    expect(net.metrics.percentChange).toBe(60);
    const debt = calculateDiscretePerformance(
      { snapshots: snaps, metric: { kind: "category", category: "liabilities" } },
      opts,
    );
    expect(debt.metrics.startValue).toBe(500);
    expect(debt.metrics.endValue).toBe(200);
  });

  it("step-holds across a gap longer than the limit", () => {
    const snaps = [snapshot(NOW - 30 * DAY, 1000, 0), snapshot(NOW, 2000, 0)];
    const r = calculateDiscretePerformance(
      { snapshots: snaps, metric: { kind: "totalAssets" } },
      { timeRange: "Month", includeDataPoints: true, endTimestamp: NOW },
    );
    const mid = r.dataPoints.find((p) => p.timestamp === NOW - 15 * DAY)!;
    expect(mid.value).toBe(1000);
    expect(r.metrics.startValue).toBe(1000);
    expect(r.metrics.endValue).toBe(2000);
  });

  it("keeps a legacy entry that cannot be split by source whole, flagged", () => {
    const legacy: SnapshotData = {
      ...snapshot(NOW - DAY, 100, 0),
      categoryBreakdown: [
        { category: "cash", value: 100 },
        { category: "commodities", value: 50 },
      ],
      totalAssets: 150,
      netWorth: 150,
    };
    const r = calculateDiscretePerformance(
      {
        snapshots: [legacy, snapshot(NOW, 100, 40, 7)],
        metric: { kind: "category", category: "commodities" },
        excludeSources: VAULT,
      },
      { timeRange: "Week", includeDataPoints: true },
    );
    expect(r.dataPoints.at(-1)!.value).toBe(7);
    expect(r.dataPoints.at(-1)!.includesContinuous).toBeUndefined();
    const old = r.dataPoints.find((p) => p.timestamp === NOW - DAY)!;
    expect(old.value).toBe(50);
    expect(old.includesContinuous).toBe(true);
  });

  it("treats a legacy row without a breakdown as unknown for a category", () => {
    const r = calculateDiscretePerformance(
      {
        snapshots: daily(8, (i) => ({
          ...snapshot(NOW - (7 - i) * DAY, 100, 0),
          categoryBreakdown: i < 4 ? undefined : snapshot(0, 100, 0).categoryBreakdown,
        })),
        metric: { kind: "category", category: "cash" },
      },
      { timeRange: "Week" },
    );
    expect(r.metrics.insufficientHistory).toBe(true);
    expect(r.metrics.startValue).toBeNull();
  });
});

describe("continuous strategy", () => {
  const prices = {
    gold: [
      { timestamp: Date.UTC(2025, 11, 30), price: 2000 }, // last close of 2025
      { timestamp: Date.UTC(2026, 0, 2), price: 2100 },
      { timestamp: Date.UTC(2026, 5, 14), price: 2400 },
    ],
  };

  it("takes the YTD baseline from the last close at or before 1 Jan", () => {
    const r = calculateContinuousPerformance(
      { holdings: [gold()], prices },
      { timeRange: "YTD", includeDataPoints: true },
    );
    expect(r.metrics.startTimestamp).toBe(JAN1);
    expect(r.metrics.startValue).toBe(calculateSellPrice(2000, 31.1034768, -0.02, 2));
    expect(r.metrics.endValue).toBe(calculateSellPrice(2400, 31.1034768, -0.02, 2));
  });

  it("ends at live spot through valueVaultItem", () => {
    const live = { timestamp: NOW - 60_000, price: 2500 };
    const r = calculateContinuousPerformance(
      { holdings: [gold()], prices, livePrices: { gold: live } },
      { timeRange: "YTD" },
    );
    const expected = valueVaultItem(
      { fineWeightGrams: 31.1034768, quantity: 2, sellPremium: -0.02, purchasePricePerUnit: 1500 },
      { eurPerOunce: 2500, sourceTimestamp: live.timestamp },
      NOW,
    ).value;
    expect(r.metrics.endValue).toBe(expected);
    expect(expected).toBeCloseTo(4900, 6);
  });

  it("counts an undated holding as held before the range; dated ones from their date", () => {
    const bought = Date.UTC(2026, 2, 1);
    const r = calculateContinuousPerformance(
      {
        holdings: [gold({ purchaseDate: undefined }), gold({ id: "g2", purchaseDate: bought })],
        prices,
      },
      { timeRange: "YTD", includeDataPoints: true },
    );
    const one = (p: number) => calculateSellPrice(p, 31.1034768, -0.02, 2);
    expect(r.metrics.startValue).toBe(one(2000));
    expect(r.metrics.endValue).toBe(2 * one(2400));
  });

  it("flags a held asset without prices as partial", () => {
    const r = calculateContinuousPerformance(
      { holdings: [gold(), gold({ id: "s", assetType: "silver" })], prices },
      { timeRange: "YTD" },
    );
    expect(r.metrics.partial).toBe(true);
    expect(r.metrics.endValue).toBe(calculateSellPrice(2400, 31.1034768, -0.02, 2));
  });
});

describe("hybrid strategy", () => {
  const prices = {
    gold: Array.from({ length: 40 }, (_, i) => ({
      timestamp: NOW - (39 - i) * DAY,
      price: 2000 + i * 10,
    })),
  };
  const snaps = Array.from({ length: 8 }, (_, i) =>
    snapshot(NOW - (7 - i) * DAY, 1000 + i * 100, 999_999, 50),
  );

  it("adds the continuous vault to snapshots without the vault, on one grid", () => {
    const r = calculateHybridPerformance(
      {
        discrete: { snapshots: snaps, metric: { kind: "netWorth" } },
        continuous: { holdings: [gold()], prices },
        continuousSources: VAULT,
      },
      { timeRange: "Week", includeDataPoints: true },
    );
    const d = r.breakdown.discrete!.metrics;
    const c = r.breakdown.continuous!.metrics;
    expect(d.endValue).toBe(1700 + 50); // vault left out
    expect(r.metrics.endValue).toBe(d.endValue + c.endValue);
    expect(r.metrics.startValue).toBe(d.startValue! + c.startValue!);
    expect(r.metrics.startTimestamp).toBe(r.breakdown.discrete!.metrics.startTimestamp);
    const values = r.dataPoints.map((p) => p.value);
    expect(r.metrics.highValue).toBe(Math.max(...values));
    expect(r.metrics.lowValue).toBe(Math.min(...values));
  });

  describe("legacy snapshots of an unchanged portfolio", () => {
    // cash 10000, vault gold V, Bitpanda gold 500, at a flat gold price
    const flat = {
      gold: [
        { timestamp: Date.UTC(2025, 11, 30), price: 2000 },
        { timestamp: NOW - DAY, price: 2000 },
      ],
    };
    const V = calculateSellPrice(2000, 31.1034768, -0.02, 2);
    const DEC31 = Date.UTC(2025, 11, 31);
    const today = snapshot(NOW, 10_000, V, 500);
    const ytd = (baseline: SnapshotData) =>
      calculateHybridPerformance(
        {
          discrete: { snapshots: [baseline, today], metric: { kind: "netWorth" } },
          continuous: { holdings: [gold()], prices: flat },
          continuousSources: VAULT,
        },
        { timeRange: "YTD" },
      ).metrics;

    it("a commodities entry without per-source values changes nothing", () => {
      const legacy: SnapshotData = {
        ...snapshot(DEC31, 10_000, V, 500),
        categoryBreakdown: [
          { category: "cash", value: 10_000 },
          { category: "commodities", value: V + 500 },
        ],
      };
      const m = ytd(legacy);
      expect(m.startValue).toBeCloseTo(10_500 + V, 6);
      expect(m.endValue).toBeCloseTo(10_500 + V, 6);
      expect(m.absoluteChange).toBeCloseTo(0, 6);
    });

    it("a row without a breakdown changes nothing", () => {
      const legacy: SnapshotData = {
        ...snapshot(DEC31, 10_000, V, 500),
        categoryBreakdown: undefined,
      };
      const m = ytd(legacy);
      expect(m.startValue).toBeCloseTo(10_500 + V, 6);
      expect(m.absoluteChange).toBeCloseTo(0, 6);
    });
  });

  describe("a vault purchase after the last snapshot", () => {
    // Yesterday's snapshot: cash 10000 (no cost) and one gold coin bought
    // for 1500; a second coin bought today for 2000 at a flat price
    const flat = { gold: [{ timestamp: NOW - 30 * DAY, price: 2000 }] };
    const W = calculateSellPrice(2000, 31.1034768, -0.02, 1);
    const coin = gold({ quantity: 1 });
    const bought = gold({
      id: "g2",
      quantity: 1,
      purchasePricePerUnit: 2000,
      purchaseDate: NOW - 3_600_000,
    });
    const yesterday = (withSourceCost: boolean): SnapshotData => ({
      timestamp: NOW - DAY,
      date: new Date(NOW - DAY).toISOString().slice(0, 10),
      totalAssets: 10_000 + W,
      totalLiabilities: 0,
      netWorth: 10_000 + W,
      totalCostBasis: 1500,
      totalCoveredValue: W,
      categoryBreakdown: [
        { category: "cash", value: 10_000 },
        {
          category: "commodities",
          value: W,
          costBasis: 1500,
          coveredValue: W,
          sources: [
            withSourceCost
              ? { source: "vault", value: W, costBasis: 1500, coveredValue: W }
              : { source: "vault", value: W },
          ],
        },
      ],
    });
    const end = (snap: SnapshotData) =>
      calculateHybridPerformance(
        {
          discrete: { snapshots: [snap], metric: { kind: "totalAssets" } },
          continuous: { holdings: [coin, bought], prices: flat },
          continuousSources: VAULT,
        },
        { timeRange: "Week", includeDataPoints: true },
      ).dataPoints.at(-1)!;

    it("brings its cost with it: the purchase is not a profit", () => {
      const p = end(yesterday(true));
      expect(p.value).toBeCloseTo(10_000 + 2 * W, 6);
      // cash at its value, both coins at their purchase price
      expect(p.costBasis).toBeCloseTo(10_000 + 1500 + 2000, 6);
      expect(p.value - p.costBasis!).toBeCloseTo(2 * W - 3500, 6);
    });

    it("keeps the snapshot's cost line on a row without per-source costs", () => {
      const p = end(yesterday(false));
      expect(p.value).toBeCloseTo(10_000 + 2 * W, 6);
      expect(p.costBasis).toBeCloseTo(10_000 + 1500, 6);
    });
  });

  it("returns no net worth from the vault alone when there are no snapshots", () => {
    const r = calculateHybridPerformance(
      {
        discrete: { snapshots: [], metric: { kind: "netWorth" } },
        continuous: { holdings: [gold()], prices },
        continuousSources: VAULT,
      },
      { timeRange: "Week" },
    );
    expect(r.metrics.startValue).toBeNull();
    expect(r.metrics.firstPointTimestamp).toBeNull();
    expect(r.metrics.dataPointCount).toBe(0);
  });

  it("falls back to the vault alone for its own category without snapshots", () => {
    const r = calculateHybridPerformance(
      {
        discrete: { snapshots: [], metric: { kind: "category", category: "commodities" } },
        continuous: { holdings: [gold()], prices },
        continuousSources: VAULT,
      },
      { timeRange: "Week" },
    );
    expect(r.metrics.endValue).toBe(r.breakdown.continuous!.metrics.endValue);
  });

  it("does not splice the vault alone onto the points before the first snapshot", () => {
    const r = calculateHybridPerformance(
      {
        discrete: { snapshots: snaps.slice(4), metric: { kind: "totalAssets" } },
        continuous: { holdings: [gold()], prices },
        continuousSources: VAULT,
      },
      { timeRange: "Week", includeDataPoints: true },
    );
    expect(r.metrics.insufficientHistory).toBe(true);
    expect(r.metrics.firstPointTimestamp).toBe(snaps[4].timestamp);
    expect(r.dataPoints.every((p) => p.timestamp >= snaps[4].timestamp)).toBe(true);
  });
});
