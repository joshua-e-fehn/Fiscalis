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
  withLiveEnd,
} from "./strategies/base";
import {
  continuousSourcesFor,
  getValueTypeForConfig,
  resolveValuationConfig,
} from "./config";
import {
  calculateDiscretePerformance,
  netWorthCostLine,
} from "./strategies/discrete";
import { calculateContinuousPerformance } from "./strategies/continuous";
import { calculateHybridPerformance } from "./strategies/hybrid";
import { TROY_OUNCE_GRAMS, calculateSellPrice, valueVaultItem } from "../finance/metals";
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

  it("never looks a price ahead without interpolation", () => {
    // A price shortly after t is not a value at t (a YTD baseline needs one
    // at or before 1 Jan)
    expect(valueAt(s, -1, { ...opts, interpolate: false })).toBeNull();
    expect(valueAt(s, 0, { ...opts, interpolate: false })).toMatchObject({
      value: 10,
      kind: "observed",
    });
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
    expect(continuousSourcesFor({ source: "vault" })).toEqual(VAULT);
    expect(continuousSourcesFor({ source: "bitpanda" })).toEqual([]);
  });

  it("measures a source alone exactly as the continuous strategy does", () => {
    // 1 oz held since last year, 1 oz bought on 1 Mar at 120; spot 100 on
    // 1 Jan, 150 from 1 Mar
    const oz = { assetType: "gold", fineWeightGrams: TROY_OUNCE_GRAMS, sellPremium: 0 };
    const holdings: HoldingData[] = [
      { id: "a", quantity: 1, ...oz },
      {
        id: "b",
        quantity: 1,
        ...oz,
        purchaseDate: Date.UTC(2026, 2, 1),
        purchasePricePerUnit: 120,
        purchaseCurrency: "EUR",
      },
    ];
    const prices = {
      gold: Array.from({ length: 200 }, (_, i) => {
        const timestamp = NOW - (199 - i) * DAY;
        return { timestamp, price: timestamp < Date.UTC(2026, 2, 1) ? 100 : 150 };
      }),
    };
    const continuous = { holdings, prices, currency: "eur" };
    const alone = calculateContinuousPerformance(continuous, { timeRange: "YTD" });
    const viaHybrid = calculateHybridPerformance(
      { continuous, continuousSources: continuousSourcesFor({ source: "vault" }) },
      { timeRange: "YTD" },
    );
    expect(viaHybrid.metrics.startValue).toBe(100);
    expect(viaHybrid.metrics.endValue).toBe(300);
    expect(viaHybrid.metrics.netFlows).toBe(120);
    expect(viaHybrid.metrics.profitLoss).toBe(80);
    expect(viaHybrid.metrics.profitLoss).toBe(alone.metrics.profitLoss);
    expect(viaHybrid.metrics.timeWeightedPercent).toBe(
      alone.metrics.timeWeightedPercent,
    );
    expect(viaHybrid.metrics.flowCoverage).toBe(alone.metrics.flowCoverage);
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

describe("live end (PF-05)", () => {
  // Net worth: 9000 on 31 Dec (assets 10000, debt 1000), 9500 yesterday
  const DEC31 = Date.UTC(2025, 11, 31, 12);
  const snaps = [
    snapshot(DEC31, 10_000, 0, 0, 1_000),
    snapshot(NOW - DAY, 10_500, 0, 0, 1_000),
  ];
  const ytd = (
    snapshots: SnapshotData[],
    liveEnd?: { value: number; costBasis: number | null },
  ) =>
    calculateHybridPerformance(
      {
        discrete: { snapshots, metric: { kind: "netWorth" } },
        continuousSources: VAULT,
      },
      { timeRange: "YTD", includeDataPoints: true, liveEnd },
    );

  it("ends the series at the live value, not the last snapshot", () => {
    const r = ytd(snaps, { value: 9_800, costBasis: 8_000 });
    expect(r.metrics.startValue).toBe(9_000);
    expect(r.metrics.endValue).toBe(9_800);
    expect(r.metrics.absoluteChange).toBe(800);
    expect(r.metrics.highValue).toBe(9_800);
    const last = r.dataPoints.at(-1)!;
    expect(last).toEqual({
      timestamp: NOW,
      date: new Date(NOW).toISOString(),
      value: 9_800,
      costBasis: 8_000,
      source: "calculated",
      confidence: 1,
    });
    expect(r.dataPoints.filter((p) => p.timestamp === NOW)).toHaveLength(1);
    expect(r.dataPoints.at(-2)!.value).toBe(9_500);
  });

  it("without a live value the series ends at the snapshot", () => {
    const r = ytd(snaps);
    expect(r.metrics.endValue).toBe(9_500);
    expect(r.metrics.absoluteChange).toBe(500);
    expect(r.dataPoints.at(-1)!.timestamp).toBe(NOW);
    expect(r.dataPoints.at(-1)!.source).toBe("snapshot");
  });

  it("before the first snapshot the live value is the one point", () => {
    const r = ytd([], { value: 9_800, costBasis: null });
    expect(r.dataPoints).toHaveLength(1);
    expect(r.metrics.endValue).toBe(9_800);
    expect(r.metrics.startValue).toBeNull();
    expect(r.metrics.insufficientHistory).toBe(true);
    expect(r.metrics.firstPointTimestamp).toBe(NOW);
  });

  it("ends at a zero live value after a funded history", () => {
    const r = ytd(snaps, { value: 0, costBasis: 0 });
    expect(r.metrics.startValue).toBe(9_000);
    expect(r.metrics.endValue).toBe(0);
    expect(r.metrics.absoluteChange).toBe(-9_000);
    expect(r.dataPoints.at(-1)!.timestamp).toBe(NOW);
    expect(r.dataPoints.at(-1)!.value).toBe(0);
  });

  it("plots nothing for a zero live value without history", () => {
    expect(ytd([], { value: 0, costBasis: null }).dataPoints).toEqual([]);
    expect(ytd([], { value: 0, costBasis: 0 }).dataPoints).toEqual([]);
  });

  it("withLiveEnd replaces the points at and after the range end", () => {
    const points = [
      { timestamp: 10, date: "", value: 1, costBasis: null, source: "snapshot" as const, confidence: 1 },
      { timestamp: 20, date: "", value: 2, costBasis: 2, source: "snapshot" as const, confidence: 1 },
    ];
    expect(withLiveEnd(points, { endTimestamp: 20 })).toBe(points);
    expect(
      withLiveEnd(points, {
        endTimestamp: 20,
        liveEnd: { value: 5, costBasis: null },
      }).map((p) => [p.timestamp, p.value, p.costBasis]),
    ).toEqual([
      [10, 1, null],
      [20, 5, null],
    ]);
  });
});

describe("partial snapshots (NW-11)", () => {
  const DEC31 = Date.UTC(2025, 11, 31, 12);
  const ytd = (snapshots: SnapshotData[]) =>
    calculateDiscretePerformance(
      { snapshots, metric: { kind: "netWorth" } },
      { timeRange: "YTD" },
    ).metrics;
  const start = snapshot(DEC31, 1_000, 0);
  const middle = snapshot(Date.UTC(2026, 2, 1, 12), 1_200, 0);
  const end = snapshot(NOW - DAY, 1_500, 0);

  it("flags a series that ends on a partial snapshot", () => {
    const m = ytd([start, middle, { ...end, partial: true }]);
    expect(m.partial).toBe(true);
    expect(m.endValue).toBe(1_500);
  });

  it("flags a series that starts on a partial snapshot", () => {
    expect(ytd([{ ...start, partial: true }, middle, end]).partial).toBe(true);
  });

  it("does not flag a partial snapshot the measured figures skip", () => {
    expect(ytd([start, { ...middle, partial: true }, end]).partial).toBe(false);
    expect(ytd([start, middle, end]).partial).toBe(false);
  });

  it("flags an interpolated start only when the partial snapshot's value enters it", () => {
    // The week starts at NOW - 7d, between a complete row at -8.5d and a
    // partial one at -6d
    const row = (days: number, value: number, netFlow = 0): SnapshotData => ({
      timestamp: NOW - days * DAY,
      date: "",
      totalAssets: value,
      totalLiabilities: 0,
      netWorth: value,
      categoryBreakdown: [{ category: "equities", value, netFlow }],
    });
    const week = (partialRow: SnapshotData) =>
      calculateDiscretePerformance(
        {
          snapshots: [row(8.5, 1_000), { ...partialRow, partial: true }, row(0, 1_700)],
          metric: { kind: "category", category: "equities" },
        },
        { timeRange: "Week" },
      ).metrics;
    // A flow at the partial row: the start holds the complete row's value
    const held = week(row(6, 1_600, 500));
    expect(held.startValue).toBe(1_000);
    expect(held.partial).toBe(false);
    // No flow: the start is interpolated toward the partial row
    const interpolated = week(row(6, 1_600));
    expect(interpolated.startValue).toBe(1_360);
    expect(interpolated.partial).toBe(true);
  });
});

describe("netWorthCostLine", () => {
  it("is the assets' cost line less the debt, null when unknown", () => {
    expect(netWorthCostLine(8_000, 1_000)).toBe(7_000);
    expect(netWorthCostLine(null, 1_000)).toBeNull();
  });
});
