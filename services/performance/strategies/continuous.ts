/**
 * Continuous Performance Strategy
 *
 * Calculates performance from historical price data for assets where
 * values can be precisely calculated at any point in time.
 *
 * Uses: inventory (holdings) + historical prices = value at any timestamp
 */

import { getTimeIntervalInMilliseconds } from "../../finance/financeService";
import { calculateSellPrice } from "../../finance/metals";

import type {
  PerformanceDataPoint,
  PerformanceResult,
  DataQuality,
  HoldingData,
  PriceData,
  PricePoint,
} from "../types";

import { BasePerformanceStrategy } from "./base";
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
 * For assets with continuous price history:
 * - Precious metals (gold, silver, platinum, palladium)
 * - Future: Stocks, ETFs, Crypto with real-time price APIs
 *
 * Calculates: Value(t) = Σ(quantity_i(t) × price_i(t) × premium_i)
 */
export class ContinuousPerformanceStrategy extends BasePerformanceStrategy<ContinuousPerformanceInput> {
  readonly strategyType = "continuous" as const;

  // ═══════════════════════════════════════════════════════════════
  // Public Interface
  // ═══════════════════════════════════════════════════════════════

  /**
   * Assess data quality based on price data coverage
   */
  assessDataQuality(
    input: ContinuousPerformanceInput,
    options: PerformanceCalculationOptions,
  ): DataQuality {
    const context = this.createContext(options);
    const { holdings, prices } = input;

    if (!holdings || holdings.length === 0) {
      return "low"; // No holdings means no meaningful data
    }

    // Get unique asset types from holdings
    const assetTypes = [...new Set(holdings.map((h) => h.assetType))];

    // Check price data coverage for each asset type
    let totalExpectedPoints = 0;
    let totalActualPoints = 0;

    for (const assetType of assetTypes) {
      const assetPrices = prices[assetType] || [];
      const rangePoints = assetPrices.filter(
        (p) =>
          p.timestamp >= context.startTimestamp &&
          p.timestamp <= context.endTimestamp,
      );

      totalExpectedPoints += context.expectedDataPoints;
      totalActualPoints += rangePoints.length;
    }

    if (totalActualPoints === 0) return "low";

    const coverageRatio = totalActualPoints / totalExpectedPoints;

    if (coverageRatio >= 0.9) return "high";
    if (coverageRatio >= 0.7) return "medium";
    return "low";
  }

  // ═══════════════════════════════════════════════════════════════
  // Protected Implementation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate data points from holdings and price data
   */
  protected generateDataPointsInternal(
    input: ContinuousPerformanceInput,
    context: CalculationContext,
  ): DataPointGenerationResult {
    const { holdings, prices } = input;

    if (!holdings || holdings.length === 0) {
      return {
        dataPoints: [],
        actualDataPoints: 0,
        interpolatedDataPoints: 0,
        dataQuality: "low",
      };
    }

    // Generate timestamp series
    const timestamps = this.generateTimestampSeries(context);

    // Calculate portfolio value at each timestamp
    const dataPoints: PerformanceDataPoint[] = [];
    let interpolatedCount = 0;

    for (const ts of timestamps) {
      const result = this.calculatePortfolioValueAtTimestamp(
        holdings,
        prices,
        ts,
        context.startTimestamp,
      );

      if (result) {
        dataPoints.push(result.point);
        if (result.isInterpolated) {
          interpolatedCount++;
        }
      }
    }

    const dataQuality = this.assessQuality(
      dataPoints.length,
      context.expectedDataPoints,
      interpolatedCount,
    );

    return {
      dataPoints,
      actualDataPoints: dataPoints.length - interpolatedCount,
      interpolatedDataPoints: interpolatedCount,
      dataQuality,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate total portfolio value at a specific timestamp
   */
  private calculatePortfolioValueAtTimestamp(
    holdings: HoldingData[],
    prices: PriceData,
    timestamp: number,
    rangeStartTimestamp: number,
  ): { point: PerformanceDataPoint; isInterpolated: boolean } | null {
    let totalValue = 0;
    let totalCostBasis = 0;
    let hasAnyPrice = false;
    let hasInterpolation = false;

    // Filter holdings that existed at this timestamp
    const activeHoldings = holdings.filter((h) => {
      const purchaseTs = h.purchaseDate || 0;
      return purchaseTs <= timestamp;
    });

    // Additionally, for timestamps at or before range start,
    // only include items purchased before range start
    const relevantHoldings =
      timestamp <= rangeStartTimestamp
        ? activeHoldings.filter(
            (h) => (h.purchaseDate || 0) < rangeStartTimestamp,
          )
        : activeHoldings;

    for (const holding of relevantHoldings) {
      const assetPrices = prices[holding.assetType];
      if (!assetPrices || assetPrices.length === 0) continue;

      const priceResult = this.getPriceAtTimestamp(assetPrices, timestamp);
      if (!priceResult) continue;

      hasAnyPrice = true;
      if (priceResult.isInterpolated) hasInterpolation = true;

      // Calculate value based on holding type
      const itemValue = this.calculateItemValue(holding, priceResult.price);
      totalValue += itemValue;

      // Add cost basis if available
      if (holding.purchasePricePerUnit && holding.quantity) {
        totalCostBasis += holding.purchasePricePerUnit * holding.quantity;
      }
    }

    if (!hasAnyPrice) return null;

    const confidence = hasInterpolation ? 0.8 : 0.95;
    const point = this.createCalculatedPoint(
      timestamp,
      totalValue,
      totalCostBasis > 0 ? totalCostBasis : null,
      confidence,
    );

    // Override source if interpolated
    if (hasInterpolation) {
      point.source = "interpolated";
    }

    return { point, isInterpolated: hasInterpolation };
  }

  /**
   * Get price at a specific timestamp from price array
   * Returns exact price or interpolates between surrounding prices
   */
  private getPriceAtTimestamp(
    prices: PricePoint[],
    timestamp: number,
  ): { price: number; isInterpolated: boolean } | null {
    if (prices.length === 0) return null;

    // Sort prices by timestamp (should already be sorted)
    const sortedPrices = [...prices].sort((a, b) => a.timestamp - b.timestamp);

    // Find exact match
    const exactMatch = sortedPrices.find((p) => p.timestamp === timestamp);
    if (exactMatch) {
      return { price: exactMatch.price, isInterpolated: false };
    }

    // Find surrounding prices
    let before: PricePoint | null = null;
    let after: PricePoint | null = null;

    for (const price of sortedPrices) {
      if (price.timestamp <= timestamp) {
        before = price;
      } else if (price.timestamp > timestamp && !after) {
        after = price;
        break;
      }
    }

    // Edge cases
    if (!before && !after) return null;
    if (!before && after) return { price: after.price, isInterpolated: true };
    if (before && !after) return { price: before.price, isInterpolated: true };

    // Interpolate between two prices
    const interpolatedPrice = this.interpolateValue(
      timestamp,
      { timestamp: before!.timestamp, value: before!.price },
      { timestamp: after!.timestamp, value: after!.price },
    );

    return { price: interpolatedPrice, isInterpolated: true };
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
