/**
 * The chart's point shape for an engine series.
 *
 * The engine already fixes the range: its first point sits exactly at the
 * range start (the baseline a range change is measured from) and its last at
 * the end, both from one clock read. A chart therefore plots the series as
 * it comes and never filters it by the range again: a second `Date.now()`
 * lies later and would cut the start point.
 */

import type { PerformanceDataPoint } from "./types";

/** One chart point; `cost` is the cost line, null (a gap) where unknown */
export interface ChartPoint {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  timestamp: number;
  value: number;
  cost: number | null;
}

/** An engine series as chart points, in time order, every point kept. */
export function toChartPoints(
  points: readonly PerformanceDataPoint[],
): ChartPoint[] {
  return points
    .map((p) => ({
      date: new Date(p.timestamp).toISOString().slice(0, 10),
      timestamp: p.timestamp,
      value: p.value,
      cost: p.costBasis,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
