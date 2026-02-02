/**
 * Portfolio Chart Data Hook
 *
 * Provides data points for the portfolio performance chart on the dashboard.
 * Combines discrete snapshots with continuous price data for metals.
 *
 * Strategy:
 * 1. Use portfolio snapshots when available (most accurate, includes all assets)
 * 2. When no snapshots exist for a period but metals exist, calculate from prices
 * 3. Ensure continuity - don't show gaps in the chart
 */

import { useMemo } from "react";

import type { TimeRange, PerformanceDataPoint } from "@/lib/performance";
import {
  getTimeRangeStartTimestamp,
  getTimeIntervalInMilliseconds,
  getDefaultIntervalForRange,
} from "@/../services/finance/financeService";

import { useDiscretePerformance } from "./useDiscretePerformance";
import { useContinuousPerformance } from "./useContinuousPerformance";
import type { MetalsCurrency } from "@/lib/types/metals-extended";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PortfolioDataPoint {
  date: string;
  timestamp: number;
  value: number;
  cost: number;
  source: "snapshot" | "continuous" | "combined";
}

export interface UsePortfolioChartDataOptions {
  /** Time range for the chart */
  timeRange: TimeRange;
  /** Currency for continuous assets (default: "eur") */
  currency?: MetalsCurrency;
  /** Whether to enable the queries (default: true) */
  enabled?: boolean;
}

export interface UsePortfolioChartDataResult {
  /** Data points for the chart */
  dataPoints: PortfolioDataPoint[];
  /** Current portfolio value */
  currentValue: number;
  /** Total cost basis */
  totalCost: number | null;
  /** Loading state */
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Get portfolio chart data combining discrete snapshots and continuous price data
 *
 * The chart shows:
 * - Portfolio snapshots when available (most accurate, includes bank accounts, broker positions, etc.)
 * - Continuous asset values (metals) when no snapshot exists for that time period
 *
 * This ensures the chart shows meaningful data even before regular syncing started,
 * as long as there are continuous assets (metals) that can be valued historically.
 */
export function usePortfolioChartData(
  options: UsePortfolioChartDataOptions,
): UsePortfolioChartDataResult {
  const { timeRange, currency = "eur", enabled = true } = options;

  // Get discrete data (portfolio snapshots)
  const discreteResult = useDiscretePerformance({
    timeRange,
    includeDataPoints: true,
    enabled,
  });

  // Get continuous data (metals with price history)
  const continuousResult = useContinuousPerformance({
    timeRange,
    currency,
    includeDataPoints: true,
    enabled,
  });

  const isLoading = discreteResult.isLoading || continuousResult.isLoading;

  const result = useMemo(() => {
    if (isLoading) {
      return {
        dataPoints: [],
        currentValue: 0,
        totalCost: null,
        isLoading: true,
      };
    }

    // Create a map of snapshots by date for quick lookup
    const snapshotsByDate = new Map<string, PerformanceDataPoint>();
    for (const point of discreteResult.dataPoints) {
      const date = new Date(point.timestamp).toISOString().split("T")[0];
      // Keep the latest snapshot for each day
      const existing = snapshotsByDate.get(date);
      if (!existing || point.timestamp > existing.timestamp) {
        snapshotsByDate.set(date, point);
      }
    }

    // Create a map of continuous values by date
    const continuousByDate = new Map<string, PerformanceDataPoint>();
    for (const point of continuousResult.dataPoints) {
      const date = new Date(point.timestamp).toISOString().split("T")[0];
      const existing = continuousByDate.get(date);
      if (!existing || point.timestamp > existing.timestamp) {
        continuousByDate.set(date, point);
      }
    }

    // Determine the earliest date we have any data
    const allDates = new Set([
      ...snapshotsByDate.keys(),
      ...continuousByDate.keys(),
    ]);
    const sortedDates = Array.from(allDates).sort();

    if (sortedDates.length === 0) {
      return {
        dataPoints: [],
        currentValue: continuousResult.currentValue || 0,
        totalCost: continuousResult.totalCostBasis ?? null,
        isLoading: false,
      };
    }

    // Generate the timestamp series for the time range
    const endTimestamp = Date.now();
    const startTimestamp = getTimeRangeStartTimestamp(timeRange);
    const interval = getDefaultIntervalForRange(timeRange);
    const intervalMs = getTimeIntervalInMilliseconds(interval);

    const dataPoints: PortfolioDataPoint[] = [];
    let lastSnapshotValue: number | null = null;
    let lastSnapshotCost: number | null = null;
    let lastContinuousValue: number | null = null;
    let lastContinuousCost: number | null = null;

    // Find the timestamp of the first ACTUAL (non-interpolated) snapshot
    // Interpolated data points have source="interpolated", actual snapshots have source="calculated" or "actual"
    const actualSnapshotPoints = discreteResult.dataPoints.filter(
      (p) => p.source !== "interpolated",
    );
    const firstActualSnapshotTimestamp =
      actualSnapshotPoints.length > 0
        ? actualSnapshotPoints.reduce(
            (min, p) => (p.timestamp < min ? p.timestamp : min),
            actualSnapshotPoints[0].timestamp,
          )
        : null;

    // Generate data points at regular intervals
    for (let ts = startTimestamp; ts <= endTimestamp; ts += intervalMs) {
      const date = new Date(ts).toISOString().split("T")[0];

      const snapshot = snapshotsByDate.get(date);
      const continuous = continuousByDate.get(date);

      // Track continuous values for fallback
      if (continuous && continuous.value > 0) {
        lastContinuousValue = continuous.value;
        lastContinuousCost = continuous.costBasis ?? 0;
      }

      if (snapshot) {
        // Check if we're before the first actual snapshot
        // If firstActualSnapshotTimestamp is null, all discrete data is interpolated
        // so we should prefer continuous data for accuracy
        const noActualSnapshots = firstActualSnapshotTimestamp === null;
        const isBeforeActualData =
          noActualSnapshots || ts < firstActualSnapshotTimestamp;

        if (isBeforeActualData) {
          // Before actual snapshots exist (or no actual snapshots at all)
          // Only show continuous data if available - don't fall back to interpolated discrete data
          // because it would show misleading values for a time when there was no actual portfolio
          if (continuous && continuous.value > 0) {
            dataPoints.push({
              date,
              timestamp: continuous.timestamp,
              value: continuous.value,
              cost: continuous.costBasis ?? 0,
              source: "continuous",
            });
          } else if (lastContinuousValue !== null) {
            dataPoints.push({
              date,
              timestamp: ts,
              value: lastContinuousValue,
              cost: lastContinuousCost ?? 0,
              source: "continuous",
            });
          }
          // If no continuous data available, don't add any data point
          // (portfolio value was effectively 0 at that time)
        } else {
          // We have actual snapshot data - use it (most accurate)
          dataPoints.push({
            date,
            timestamp: snapshot.timestamp,
            value: snapshot.value,
            cost: snapshot.costBasis ?? 0,
            source: "snapshot",
          });
          lastSnapshotValue = snapshot.value;
          lastSnapshotCost = snapshot.costBasis ?? 0;
        }
      } else if (
        firstActualSnapshotTimestamp === null ||
        ts < firstActualSnapshotTimestamp
      ) {
        // Before the first actual snapshot exists (or no actual snapshots at all)
        // Only show continuous data if available
        if (continuous && continuous.value > 0) {
          dataPoints.push({
            date,
            timestamp: continuous.timestamp,
            value: continuous.value,
            cost: continuous.costBasis ?? 0,
            source: "continuous",
          });
        } else if (lastContinuousValue !== null) {
          // Carry forward last known continuous value
          dataPoints.push({
            date,
            timestamp: ts,
            value: lastContinuousValue,
            cost: lastContinuousCost ?? 0,
            source: "continuous",
          });
        }
      } else if (
        continuous &&
        continuous.value > 0 &&
        lastSnapshotValue === null
      ) {
        // No actual snapshots exist at all but we have continuous data
        dataPoints.push({
          date,
          timestamp: continuous.timestamp,
          value: continuous.value,
          cost: continuous.costBasis ?? 0,
          source: "continuous",
        });
      } else if (lastSnapshotValue !== null) {
        // After the first actual snapshot, carry forward the last snapshot value
        dataPoints.push({
          date,
          timestamp: ts,
          value: lastSnapshotValue,
          cost: lastSnapshotCost ?? 0,
          source: "snapshot",
        });
      }
      // If we have no data at all for this date and no historical data,
      // we don't add a data point (chart will show gap or start later)
    }

    // Calculate current value
    const currentValue =
      (discreteResult.metrics?.endValue ?? 0) +
      (continuousResult.currentValue ?? 0) -
      // Subtract metals from discrete if they're double-counted
      // (snapshots may already include metal values)
      0; // TODO: Handle potential double-counting

    // For now, use the simpler approach: if we have snapshots, use snapshot end value
    // if not, use continuous value
    const finalCurrentValue =
      discreteResult.metrics?.endValue ?? continuousResult.currentValue ?? 0;

    const finalTotalCost =
      discreteResult.metrics?.startValue ?? // Use start value as proxy for cost basis
      continuousResult.totalCostBasis ??
      null;

    return {
      dataPoints,
      currentValue: finalCurrentValue,
      totalCost: finalTotalCost,
      isLoading: false,
    };
  }, [
    isLoading,
    discreteResult.dataPoints,
    discreteResult.metrics,
    continuousResult.dataPoints,
    continuousResult.currentValue,
    continuousResult.totalCostBasis,
    timeRange,
  ]);

  return result;
}
