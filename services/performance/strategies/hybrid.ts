/**
 * Hybrid Performance Strategy
 *
 * The one combiner of discrete (snapshot) and continuous (price) values:
 *
 * - both parts are calculated on one context (one `now`, one grid);
 * - the discrete part leaves out the continuously valued sources (vault
 *   metals), using the snapshots' per-source values, so nothing is counted
 *   twice;
 * - a grid point is kept only where every part present has a value, so a
 *   series of one scope is never spliced onto a series of another;
 * - metrics, including high and low, come from the merged series.
 */

import type {
  PerformanceDataPoint,
  PerformanceResult,
} from "../types";

import { BasePerformanceStrategy, assessDataQuality } from "./base";
import { DiscretePerformanceStrategy, getDiscreteStrategy } from "./discrete";
import {
  ContinuousPerformanceStrategy,
  getContinuousStrategy,
} from "./continuous";
import type {
  HybridPerformanceInput,
  PerformanceCalculationOptions,
  CalculationContext,
  DataPointGenerationResult,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/**
 * Breakdown of performance by value type
 */
export interface PerformanceBreakdown {
  discrete?: PerformanceResult;
  continuous?: PerformanceResult;
}

/**
 * Extended hybrid result with breakdown
 */
export interface HybridPerformanceResult extends PerformanceResult {
  breakdown: PerformanceBreakdown;
}

// ═══════════════════════════════════════════════════════════════
// Hybrid Performance Strategy
// ═══════════════════════════════════════════════════════════════

export class HybridPerformanceStrategy extends BasePerformanceStrategy<HybridPerformanceInput> {
  readonly strategyType = "hybrid" as const;

  private discreteStrategy: DiscretePerformanceStrategy;
  private continuousStrategy: ContinuousPerformanceStrategy;

  constructor(
    discreteStrategy?: DiscretePerformanceStrategy,
    continuousStrategy?: ContinuousPerformanceStrategy,
  ) {
    super();
    this.discreteStrategy = discreteStrategy ?? getDiscreteStrategy();
    this.continuousStrategy = continuousStrategy ?? getContinuousStrategy();
  }

  calculate(
    input: HybridPerformanceInput,
    options: PerformanceCalculationOptions,
  ): HybridPerformanceResult {
    return this.calculateInContext(
      input,
      this.createContext(options),
      options.includeDataPoints,
    );
  }

  calculateInContext(
    input: HybridPerformanceInput,
    context: CalculationContext,
    includeDataPoints = false,
  ): HybridPerformanceResult {
    const { generation, breakdown } = this.combine(input, context);
    return {
      metrics: this.calculateMetrics(
        generation.dataPoints,
        context,
        generation.dataQuality,
        generation.partial,
      ),
      dataPoints: includeDataPoints ? generation.dataPoints : [],
      valueType: "hybrid",
      breakdown,
      ...(generation.actualSnapshotTimestamps && {
        actualSnapshotTimestamps: generation.actualSnapshotTimestamps,
      }),
    };
  }

  protected generateDataPointsInternal(
    input: HybridPerformanceInput,
    context: CalculationContext,
  ): DataPointGenerationResult {
    return this.combine(input, context).generation;
  }

  private combine(
    input: HybridPerformanceInput,
    context: CalculationContext,
  ): { generation: DataPointGenerationResult; breakdown: PerformanceBreakdown } {
    const discrete = input.discrete
      ? this.discreteStrategy.calculateInContext(
          {
            ...input.discrete,
            excludeSources: input.continuous ? input.continuousSources : [],
          },
          context,
          true,
        )
      : undefined;
    const continuous = input.continuous
      ? this.continuousStrategy.calculateInContext(input.continuous, context, true)
      : undefined;

    // A discrete part with no points (no snapshots yet) is left out only
    // when the continuous sources cover the measure's whole scope (their own
    // category); otherwise the vault alone would pass for net worth.
    const discreteEmpty = discrete !== undefined && discrete.dataPoints.length === 0;
    const metric = input.discrete?.metric;
    const continuousCoversScope =
      metric?.kind === "category" &&
      input.continuousSources.length > 0 &&
      input.continuousSources.every((c) => c.category === metric.category);
    const parts =
      discreteEmpty && !continuousCoversScope
        ? []
        : [discrete, continuous].filter(
            (r): r is PerformanceResult => r !== undefined && r.dataPoints.length > 0,
          );
    const dataPoints = mergeOnGrid(
      parts.map((r) => r.dataPoints),
      parts[0] !== undefined && parts[0] === discrete,
    );
    const observed = dataPoints.filter((p) => p.source !== "interpolated").length;

    return {
      generation: {
        dataPoints,
        actualDataPoints: observed,
        interpolatedDataPoints: dataPoints.length - observed,
        dataQuality: assessDataQuality(observed, context.expectedDataPoints),
        partial: [discrete, continuous].some((r) => r?.metrics.partial),
        actualSnapshotTimestamps: discrete?.actualSnapshotTimestamps,
      },
      breakdown: { discrete, continuous },
    };
  }
}

/**
 * Sum the parts at each grid timestamp where all of them have a point. The
 * cost line is the first part's when it is the discrete one (the snapshot's
 * cost line already covers the continuously valued holdings), else the sum.
 * A discrete point flagged `includesContinuous` (a legacy snapshot that
 * already holds the continuous sources) is taken alone.
 */
function mergeOnGrid(
  parts: PerformanceDataPoint[][],
  firstIsDiscrete: boolean,
): PerformanceDataPoint[] {
  if (parts.length === 0) return [];
  if (parts.length === 1) return parts[0];
  const maps = parts.map((points) => new Map(points.map((p) => [p.timestamp, p])));
  const merged: PerformanceDataPoint[] = [];
  for (const point of parts[0]) {
    if (firstIsDiscrete && point.includesContinuous) {
      const { includesContinuous: _flag, ...alone } = point;
      merged.push(alone);
      continue;
    }
    const atTs = maps.map((m) => m.get(point.timestamp));
    if (atTs.some((p) => p === undefined)) continue;
    const present = atTs as PerformanceDataPoint[];
    const costs = present.map((p) => p.costBasis);
    const costBasis = firstIsDiscrete
      ? costs[0]
      : costs.every((c) => c === null)
        ? null
        : costs.reduce<number>((sum, c) => sum + (c ?? 0), 0);
    merged.push({
      timestamp: point.timestamp,
      date: point.date,
      value: present.reduce((sum, p) => sum + p.value, 0),
      costBasis,
      source: present.some((p) => p.source === "interpolated")
        ? "interpolated"
        : present.some((p) => p.source === "calculated")
          ? "calculated"
          : "snapshot",
      confidence: Math.min(...present.map((p) => p.confidence)),
    });
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate hybrid performance with default options
 */
export function calculateHybridPerformance(
  input: HybridPerformanceInput,
  options: PerformanceCalculationOptions,
): HybridPerformanceResult {
  const strategy = new HybridPerformanceStrategy();
  return strategy.calculate(input, options);
}

/**
 * Singleton instance for reuse
 */
let hybridStrategyInstance: HybridPerformanceStrategy | null = null;

/**
 * Get shared strategy instance
 */
export function getHybridStrategy(): HybridPerformanceStrategy {
  if (!hybridStrategyInstance) {
    hybridStrategyInstance = new HybridPerformanceStrategy();
  }
  return hybridStrategyInstance;
}
