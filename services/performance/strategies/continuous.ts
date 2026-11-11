/**
 * Continuous Performance Strategy
 *
 * Calculates performance from historical price data for assets where
 * values can be precisely calculated at any point in time.
 *
 * Uses: inventory (holdings) + historical prices = value at any timestamp
 */

import { calculateSellPrice, valueVaultItem } from "../../finance/metals";

import type {
  PerformanceDataPoint,
  PerformanceResult,
  HoldingData,
  PricePoint,
} from "../types";

import {
  BasePerformanceStrategy,
  assessDataQuality,
  sortByTimestamp,
  valueAt,
  type SeriesLookupOptions,
  type SeriesPoint,
} from "./base";
import type {
  ContinuousPerformanceInput,
  PerformanceCalculationOptions,
  CalculationContext,
  DataPointGenerationResult,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Continuous Performance Strategy
// ═══════════════════════════════════════════════════════════════

/**
 * Continuous Performance Strategy
 *
 * For assets with a price history (vault metals today):
 *   Value(t) = Σ value(holding_i held at t, price_i(t))
 *
 * - A holding counts from its purchase date; one without a date is held
 *   since before the range (it is never dated at record creation).
 * - price_i(t) is the last price at or before t (no look-ahead), so a range
 *   starting on 1 Jan takes the 31 Dec close when the series is fetched
 *   from a few days earlier.
 * - The range-end point is valued at live spot when given (valueVaultItem,
 *   as the Total Value cards), otherwise at the last close.
 * - A held asset without any price series is left out and the result is
 *   flagged partial.
 *
 * Each series is sorted once per calculation and looked up by binary search.
 */
export class ContinuousPerformanceStrategy extends BasePerformanceStrategy<ContinuousPerformanceInput> {
  readonly strategyType = "continuous" as const;

  protected generateDataPointsInternal(
    input: ContinuousPerformanceInput,
    context: CalculationContext,
  ): DataPointGenerationResult {
    const holdings = input.holdings ?? [];
    if (holdings.length === 0) {
      return {
        dataPoints: [],
        actualDataPoints: 0,
        interpolatedDataPoints: 0,
        dataQuality: "low",
      };
    }
    const timestamps = this.generateTimestampSeries(context);
    const lookup = this.lookupOptions(context, false);

    // Sort each held asset's series once
    const series = new Map<string, SeriesPoint[]>();
    let partial = false;
    for (const assetType of new Set(holdings.map((h) => h.assetType))) {
      const prices = input.prices[assetType];
      if (!prices || prices.length === 0) {
        partial = true;
        continue;
      }
      series.set(
        assetType,
        sortByTimestamp(prices.map((p) => ({ timestamp: p.timestamp, value: p.price }))),
      );
    }
    const priced = holdings.filter((h) => series.has(h.assetType));
    if (priced.length === 0) {
      return {
        dataPoints: [],
        actualDataPoints: 0,
        interpolatedDataPoints: 0,
        dataQuality: "low",
        partial,
      };
    }

    const dataPoints: PerformanceDataPoint[] = [];
    let observed = 0;
    for (const ts of timestamps) {
      const live = ts === context.endTimestamp ? input.livePrices : undefined;
      const point = this.valueAtTimestamp(priced, series, ts, lookup, live);
      if (!point) continue;
      dataPoints.push(point);
      if (point.source !== "interpolated") observed++;
    }

    return {
      dataPoints,
      actualDataPoints: observed,
      interpolatedDataPoints: dataPoints.length - observed,
      dataQuality: assessDataQuality(observed, context.expectedDataPoints),
      partial,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Value of the holdings held at `timestamp`, or null when a held asset has
   * no price at or before it yet. Holding nothing yet is a known 0. The cost is
   * the cost line: purchase cost plus the value of items without one.
   */
  private valueAtTimestamp(
    holdings: HoldingData[],
    series: Map<string, SeriesPoint[]>,
    timestamp: number,
    lookup: SeriesLookupOptions,
    livePrices: Partial<Record<string, PricePoint>> | undefined,
  ): PerformanceDataPoint | null {
    let totalValue = 0;
    let costLine = 0;
    let hasCost = false;
    let allObserved = true;

    for (const holding of holdings) {
      if (holding.purchaseDate !== undefined && holding.purchaseDate > timestamp) {
        continue;
      }
      const live = livePrices?.[holding.assetType];
      let value: number;
      if (live) {
        value = this.liveValue(holding, live, timestamp);
      } else {
        const price = valueAt(series.get(holding.assetType)!, timestamp, lookup);
        if (!price) return null;
        if (price.kind !== "observed") allObserved = false;
        value = this.calculateItemValue(holding, price.value);
      }
      totalValue += value;
      if (holding.purchasePricePerUnit != null) {
        hasCost = true;
        costLine += holding.purchasePricePerUnit * holding.quantity;
      } else {
        costLine += value;
      }
    }

    const costBasis = hasCost ? costLine : null;
    return allObserved
      ? this.createCalculatedPoint(timestamp, totalValue, costBasis)
      : this.createInterpolatedPoint(timestamp, totalValue, costBasis);
  }

  /** Live-spot value through valueVaultItem (metals) or quantity × price. */
  private liveValue(holding: HoldingData, live: PricePoint, now: number): number {
    if (holding.fineWeightGrams === undefined) return holding.quantity * live.price;
    return valueVaultItem(
      {
        fineWeightGrams: holding.fineWeightGrams,
        quantity: holding.quantity,
        sellPremium: holding.sellPremium,
        purchasePricePerUnit: holding.purchasePricePerUnit,
      },
      { eurPerOunce: live.price, sourceTimestamp: live.timestamp },
      now,
    ).value;
  }

  /**
   * Value of a single holding at a given price.
   *
   * Metal holdings (with `fineWeightGrams`) take the price per troy ounce, as
   * the metals API quotes it, and are valued with the shared
   * `calculateSellPrice` (services/finance/metals.ts) that the vault and the
   * server-side net worth use. Other holdings are quantity × price.
   */
  private calculateItemValue(holding: HoldingData, price: number): number {
    if (holding.fineWeightGrams !== undefined) {
      return calculateSellPrice(
        price,
        holding.fineWeightGrams,
        holding.sellPremium ?? 0,
        holding.quantity,
      );
    }
    return holding.quantity * price;
  }
}

// ═══════════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate continuous performance with default options
 */
export function calculateContinuousPerformance(
  input: ContinuousPerformanceInput,
  options: PerformanceCalculationOptions,
): PerformanceResult {
  const strategy = new ContinuousPerformanceStrategy();
  return strategy.calculate(input, options);
}

/**
 * Singleton instance for reuse
 */
let continuousStrategyInstance: ContinuousPerformanceStrategy | null = null;

/**
 * Get shared strategy instance
 */
export function getContinuousStrategy(): ContinuousPerformanceStrategy {
  if (!continuousStrategyInstance) {
    continuousStrategyInstance = new ContinuousPerformanceStrategy();
  }
  return continuousStrategyInstance;
}
