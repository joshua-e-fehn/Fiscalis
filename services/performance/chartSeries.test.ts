/**
 * toChartPoints: the chart plots the engine's series as it comes, so the
 * range-start point (the baseline of the range change) is always drawn.
 */

import { describe, expect, it } from "vitest";
import { toChartPoints } from "./chartSeries";
import { calculateDiscretePerformance } from "./strategies/discrete";
import { MS_PER_3_MONTHS, MS_PER_DAY } from "../finance/financeService";
import type { PerformanceDataPoint, SnapshotData } from "./types";

const END = Date.UTC(2026, 5, 15, 12, 0, 0); // 15 Jun 2026 12:00 UTC
const START = END - MS_PER_3_MONTHS;

function snapshot(timestamp: number, assets: number): SnapshotData {
  return {
    timestamp,
    date: new Date(timestamp).toISOString().slice(0, 10),
    totalAssets: assets,
    totalLiabilities: 0,
    netWorth: assets,
    totalCostBasis: 800,
  };
}

describe("toChartPoints", () => {
  const result = calculateDiscretePerformance(
    {
      snapshots: [
        snapshot(START - 2 * MS_PER_DAY, 1_000), // the baseline before the range
        snapshot(END - 10 * MS_PER_DAY, 1_200),
      ],
      metric: { kind: "totalAssets" },
    },
    { timeRange: "3Month", endTimestamp: END, includeDataPoints: true },
  );

  it("keeps the range-start point the change is measured from", () => {
    const points = toChartPoints(result.dataPoints);
    expect(points).toHaveLength(result.dataPoints.length);
    expect(points[0]).toEqual({
      date: new Date(START).toISOString().slice(0, 10),
      timestamp: START,
      value: 1_000,
      cost: 800,
    });
    expect(points[0].value).toBe(result.metrics.startValue);
    expect(points.at(-1)!.timestamp).toBe(END);
    expect(points.at(-1)!.value).toBe(1_200);
  });

  it("does not filter by the range again (a later clock would cut the start)", () => {
    // What a second Date.now() filter, one millisecond later, would have done
    const later = END + 1;
    const refiltered = result.dataPoints.filter(
      (p) => p.timestamp >= later - MS_PER_3_MONTHS,
    );
    expect(refiltered[0].timestamp).not.toBe(START);
    expect(toChartPoints(result.dataPoints)[0].timestamp).toBe(START);
  });

  it("orders the points by time and leaves an unknown cost as a gap", () => {
    const p = (timestamp: number, costBasis: number | null): PerformanceDataPoint => ({
      timestamp,
      date: "",
      value: 10,
      costBasis,
      source: "snapshot",
      confidence: 1,
    });
    expect(toChartPoints([p(2 * MS_PER_DAY, null), p(MS_PER_DAY, 5)])).toEqual([
      { date: "1970-01-02", timestamp: MS_PER_DAY, value: 10, cost: 5 },
      { date: "1970-01-03", timestamp: 2 * MS_PER_DAY, value: 10, cost: null },
    ]);
  });
});
