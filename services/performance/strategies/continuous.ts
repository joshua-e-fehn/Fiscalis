/**
 * Continuous Performance Strategy
 *
 * Calculates performance from historical price data for assets where
 * values can be precisely calculated at any point in time.
 *
 * Uses: inventory (holdings) + historical prices = value at any timestamp
 */

import {
  DEFAULT_SELL_PREMIUM,
  calculateSellPrice,
  valueVaultItem,
} from "../../finance/metals";

const DAY_MS = 86_400_000;

import type {
  CashFlow,
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

/** Cost per unit on the cost line: costPerUnit, else the purchase price. */
function unitCostOf(holding: HoldingData): number | null {
  return holding.costPerUnit !== undefined
    ? holding.costPerUnit
    : (holding.purchasePricePerUnit ?? null);
}

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
 * - Holdings are ledger lots (services/finance/metalsLedger.ts): a sale is
 *   a lot with a negative quantity from its date on, so the quantity held at
 *   t is what the ledger says, and a sold-out item keeps its past values.
 * - Every dated lot is an external flow (D2): purchase price (or sale
 *   proceeds) × quantity, or its value at that date when it has no price,
 *   so a sale is an outflow and a buy an inflow, never a gain or loss.
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
      ...this.purchaseFlows(priced, series, lookup, input.currency),
    };
  }

  /**
   * One flow per dated lot: its price × quantity when paid in the series'
   * currency (negative for a sale: the proceeds leave), else its value at
   * that date. A lot with neither (no price on that date) is assumed to be
   * no flow and its date reported as estimated.
   */
  private purchaseFlows(
    holdings: HoldingData[],
    series: Map<string, SeriesPoint[]>,
    lookup: SeriesLookupOptions,
    currency: string | undefined,
  ): Pick<
    DataPointGenerationResult,
    "flows" | "flowCoverage" | "estimatedFlowTimestamps"
  > {
    const flows: CashFlow[] = [];
    const estimatedFlowTimestamps: number[] = [];
    for (const h of holdings) {
      if (h.purchaseDate === undefined) continue;
      // Known to the day only: weighted as made within the day up to the
      // date it is valued from, not exactly at it
      const spanStart = h.purchaseDate - DAY_MS;
      // A price paid in another currency than the series' is not comparable
      // with its values: the purchase is taken at its value that day instead
      const priceComparable =
        h.purchaseCurrency === undefined ||
        currency === undefined ||
        h.purchaseCurrency.toUpperCase() === currency.toUpperCase();
      if (h.purchasePricePerUnit != null && priceComparable) {
        flows.push({
          timestamp: h.purchaseDate,
          amount: h.purchasePricePerUnit * h.quantity,
          spanStart,
        });
        continue;
      }
      const price = valueAt(series.get(h.assetType)!, h.purchaseDate, lookup);
      if (price) {
        flows.push({
          timestamp: h.purchaseDate,
          amount: this.calculateItemValue(h, price.value),
          spanStart,
        });
      } else {
        estimatedFlowTimestamps.push(h.purchaseDate);
      }
    }
    return { flows, flowCoverage: "complete", estimatedFlowTimestamps };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Value of the holdings held at `timestamp`, or null when a held asset has
   * no price at or before it yet. Holding nothing yet is a known 0. The cost is
   * the cost line: the lots' cost plus the value of lots without one (for
   * ledger lots, the known cost of their pool share plus the value of its
   * unknown-cost units).
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
      if (holding.costLine) {
        // Unknown-cost units at their value; value is linear in quantity
        const { knownCost, unknownQuantity } = holding.costLine;
        costLine += knownCost;
        if (holding.quantity !== 0) {
          costLine += value * (unknownQuantity / holding.quantity);
        }
        if (Math.abs(holding.quantity - unknownQuantity) > 1e-9) hasCost = true;
        continue;
      }
      const unitCost = unitCostOf(holding);
      if (unitCost !== null) {
        hasCost = true;
        costLine += unitCost * holding.quantity;
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
        purchasePricePerUnit: unitCostOf(holding) ?? undefined,
      },
      { eurPerOunce: live.price, sourceTimestamp: live.timestamp },
      now,
      // Unknown (stale spot, no cost) adds nothing, as in the totals
    ).value ?? 0;
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
        holding.sellPremium ?? DEFAULT_SELL_PREMIUM,
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
