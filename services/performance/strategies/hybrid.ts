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
 * - the merged series ends at the live value when one is given (liveEnd);
 * - metrics, including high and low, come from the merged series;
 * - flows are the parts' flows, only for a flow-adjusted measure (D2: the
 *   vault's purchases are not flows of net worth).
 */

import { isFlowAdjustedCategory } from "../../portfolio/aggregate";
import type {
  CashFlow,
  PerformanceDataPoint,
  PerformanceResult,
} from "../types";

import {
  BasePerformanceStrategy,
  assessDataQuality,
  withLiveEnd,
} from "./base";
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
      metrics: this.calculateMetrics(generation.dataPoints, context, generation),
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
    // The parts' generations (flows are not part of a PerformanceResult)
    const discreteInput = input.discrete && {
      ...input.discrete,
      excludeSources: input.continuous ? input.continuousSources : [],
    };
    const discreteGen = discreteInput
      ? this.discreteStrategy.generate(discreteInput, context)
      : undefined;
    const continuousGen = input.continuous
      ? this.continuousStrategy.generate(input.continuous, context)
      : undefined;
    const discrete = discreteGen && this.discreteStrategy.toResult(discreteGen, context);
    const continuous =
      continuousGen && this.continuousStrategy.toResult(continuousGen, context);

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
    const dataPoints = withLiveEnd(
      mergeOnGrid(
        parts.map((r) => r.dataPoints),
        parts[0] !== undefined && parts[0] === discrete,
      ),
      context,
    );
    const observed = dataPoints.filter((p) => p.source !== "interpolated").length;

    // Flows of the parts merged, for a flow-adjusted measure only. A legacy
    // snapshot that already holds the continuous sources stands alone in
    // the merged series, so continuous flows up to the last such point are
    // in its value (and its flow) already.
    const tracksFlows =
      metric === undefined
        ? continuousGen !== undefined
        : metric.kind === "category" && isFlowAdjustedCategory(metric.category);
    const used = [
      parts.includes(discrete!) ? discreteGen : undefined,
      parts.includes(continuous!) ? continuousGen : undefined,
    ].filter((g): g is DataPointGenerationResult => g !== undefined);
    const lastLegacy = (discrete?.dataPoints ?? [])
      .filter((p) => p.includesContinuous)
      .reduce((max, p) => Math.max(max, p.timestamp), -Infinity);
    const flows: CashFlow[] = used.flatMap((g) =>
      (g.flows ?? []).filter(
        (f) => g === discreteGen || f.timestamp > lastLegacy,
      ),
    );
    const flowCoverage =
      !tracksFlows || used.some((g) => (g.flowCoverage ?? "none") === "none")
        ? ("none" as const)
        : ("complete" as const);

    return {
      generation: {
        dataPoints,
        actualDataPoints: observed,
        interpolatedDataPoints: dataPoints.length - observed,
        dataQuality: assessDataQuality(observed, context.expectedDataPoints),
        partial: [discrete, continuous].some((r) => r?.metrics.partial),
        actualSnapshotTimestamps: discrete?.actualSnapshotTimestamps,
        flows,
        flowCoverage,
        estimatedFlowTimestamps: used.flatMap(
          (g) => g.estimatedFlowTimestamps ?? [],
        ),
      },
      breakdown: { discrete, continuous },
    };
  }
}

/**
 * Sum the parts at each grid timestamp where all of them have a point. The
 * cost line is the sum of the parts' (a part without one counts at its
 * value: no P/L), so a holding the continuous part values but the last
 * snapshot did not yet hold brings its cost with it. A discrete point whose
 * cost line still holds the continuous sources (`costIncludesContinuous`, a
 * row without per-source costs) keeps its cost line alone. A discrete point
 * flagged `includesContinuous` (a legacy snapshot that already holds the
 * continuous sources) is taken alone.
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
      const {
        includesContinuous: _flag,
        costIncludesContinuous: _costFlag,
        ...alone
      } = point;
      merged.push(alone);
      continue;
    }
    const atTs = maps.map((m) => m.get(point.timestamp));
    if (atTs.some((p) => p === undefined)) continue;
    const present = atTs as PerformanceDataPoint[];
    const costBasis =
      firstIsDiscrete && point.costIncludesContinuous
        ? point.costBasis
        : sumCostLines(present);
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

/** Sum of the parts' cost lines; null when no part has one. */
function sumCostLines(points: PerformanceDataPoint[]): number | null {
  if (points.every((p) => p.costBasis === null)) return null;
  return points.reduce((sum, p) => sum + (p.costBasis ?? p.value), 0);
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
