/**
 * Continuous Performance Strategy - Unit Tests
 *
 * Tests for price-based performance calculation (precious metals, etc.)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ContinuousPerformanceStrategy,
  calculateContinuousPerformance,
  getContinuousStrategy,
} from "./strategies/continuous";
import type {
  ContinuousPerformanceInput,
  PerformanceCalculationOptions,
} from "./strategies/types";
import type { HoldingData, PriceData, PricePoint } from "./types";

// ═══════════════════════════════════════════════════════════════
// Test Utilities
// ═══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;

/**
 * Create a mock metal holding
 */
function createMetalHolding(
  id: string,
  metalType: string,
  fineWeightGrams: number,
  quantity: number,
  options?: {
    sellPremium?: number;
    purchaseDate?: number;
    purchasePricePerUnit?: number;
  },
): HoldingData {
  const purchaseDate = options?.purchaseDate ?? Date.now() - 365 * MS_PER_DAY;

  return {
    id,
    assetType: metalType,
    quantity,
    fineWeightGrams,
    sellPremium: options?.sellPremium ?? 5, // 5% default premium
    purchaseDate,
    purchasePricePerUnit: options?.purchasePricePerUnit,
  };
}

/**
 * Create price history with linear interpolation
 */
function createPriceHistory(
  daysBack: number,
  startPrice: number,
  endPrice: number,
  intervalHours: number = 24,
): PricePoint[] {
  const now = Date.now();
  const points: PricePoint[] = [];
  const totalIntervals = Math.floor((daysBack * 24) / intervalHours);
  const priceStep = (endPrice - startPrice) / totalIntervals;

  for (let i = 0; i <= totalIntervals; i++) {
    const hoursAgo = daysBack * 24 - i * intervalHours;
    points.push({
      timestamp: now - hoursAgo * MS_PER_HOUR,
      price: startPrice + i * priceStep,
    });
  }

  return points;
}

/**
 * Create price data for multiple metals
 */
function createPriceData(metals: {
  gold?: { startPrice: number; endPrice: number };
  silver?: { startPrice: number; endPrice: number };
}): PriceData {
  const priceData: PriceData = {};

  if (metals.gold) {
    priceData.gold = createPriceHistory(
      30,
      metals.gold.startPrice,
      metals.gold.endPrice,
    );
  }
  if (metals.silver) {
    priceData.silver = createPriceHistory(
      30,
      metals.silver.startPrice,
      metals.silver.endPrice,
    );
  }

  return priceData;
}

// ═══════════════════════════════════════════════════════════════
// Continuous Performance Strategy Tests
// ═══════════════════════════════════════════════════════════════

describe("ContinuousPerformanceStrategy", () => {
  let strategy: ContinuousPerformanceStrategy;

  beforeEach(() => {
    strategy = new ContinuousPerformanceStrategy();
  });

  describe("calculate", () => {
    it("should return low quality metrics for empty holdings", () => {
      const input: ContinuousPerformanceInput = {
        holdings: [],
        prices: {},
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.startValue).toBe(0);
      expect(result.metrics.endValue).toBe(0);
      expect(result.metrics.dataQuality).toBe("low");
      expect(result.valueType).toBe("continuous");
    });

    it("should calculate gold portfolio performance correctly", () => {
      // 1 gold bar: 1000g fine gold, 5% sell premium
      const holdings = [
        createMetalHolding("gold-1", "gold", 1000, 1, { sellPremium: 5 }),
      ];

      // Gold price: €60/g -> €66/g (10% increase)
      const prices = createPriceData({
        gold: { startPrice: 60, endPrice: 66 },
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Expected values:
      // Start: 1000g × €60 × 1.05 = €63,000
      // End: 1000g × €66 × 1.05 = €69,300
      // Change: +10%
      expect(result.metrics.percentChange).toBeCloseTo(10, 0);
      expect(result.metrics.startValue).toBeCloseTo(63000, -2);
      expect(result.metrics.endValue).toBeCloseTo(69300, -2);
    });

    it("should calculate mixed metal portfolio correctly", () => {
      const holdings = [
        createMetalHolding("gold-1", "gold", 500, 1, { sellPremium: 5 }),
        createMetalHolding("silver-1", "silver", 10000, 1, { sellPremium: 10 }),
      ];

      const prices = createPriceData({
        gold: { startPrice: 60, endPrice: 66 }, // +10%
        silver: { startPrice: 0.8, endPrice: 0.88 }, // +10%
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Both metals up 10%, so portfolio should be ~10%
      expect(result.metrics.percentChange).toBeCloseTo(10, 0);
    });

    it("should handle multiple holdings of the same metal", () => {
      const holdings = [
        createMetalHolding("gold-1", "gold", 500, 2, { sellPremium: 5 }),
        createMetalHolding("gold-2", "gold", 1000, 1, { sellPremium: 3 }),
      ];

      const prices = createPriceData({
        gold: { startPrice: 60, endPrice: 66 },
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Total gold: 2×500g + 1×1000g = 2000g
      expect(result.metrics.percentChange).toBeCloseTo(10, 0);
    });

    it("should handle negative performance (price decrease)", () => {
      const holdings = [
        createMetalHolding("gold-1", "gold", 1000, 1, { sellPremium: 5 }),
      ];

      // Gold price drops 10%
      const prices = createPriceData({
        gold: { startPrice: 66, endPrice: 60 },
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Expected: -10% (approximately, due to interpolation)
      expect(result.metrics.percentChange).toBeLessThan(0);
      expect(result.metrics.percentChange).toBeCloseTo(-9.1, 0);
    });

    it("should only count holdings that existed at range start", () => {
      const now = Date.now();
      const holdings = [
        // Purchased 60 days ago - before range start
        createMetalHolding("gold-1", "gold", 500, 1, {
          purchaseDate: now - 60 * MS_PER_DAY,
        }),
        // Purchased 10 days ago - within the 30-day range
        createMetalHolding("gold-2", "gold", 500, 1, {
          purchaseDate: now - 10 * MS_PER_DAY,
        }),
      ];

      const prices = createPriceData({
        gold: { startPrice: 60, endPrice: 66 },
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // At range start, only gold-1 existed
      // The second holding appears mid-range
      expect(result.metrics).toBeDefined();
      expect(result.metrics.startValue).toBeGreaterThan(0);
    });
  });

  describe("assessDataQuality", () => {
    it("should return low for empty holdings", () => {
      const input: ContinuousPerformanceInput = {
        holdings: [],
        prices: {},
      };
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      expect(quality).toBe("low");
    });

    it("should return high for complete price data", () => {
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1)];

      // Hourly price data for a month = high coverage
      const prices: PriceData = {
        gold: createPriceHistory(30, 60, 66, 1), // hourly data
      };

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      expect(quality).toBe("high");
    });

    it("should return low for missing price data", () => {
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1)];

      // No gold prices!
      const prices: PriceData = {};

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      expect(quality).toBe("low");
    });
  });

  describe("generateDataPoints", () => {
    it("should generate time series data points", () => {
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1)];
      const prices = createPriceData({
        gold: { startPrice: 60, endPrice: 66 },
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const dataPoints = strategy.generateDataPoints(input, options);

      expect(dataPoints.length).toBeGreaterThan(0);

      // Check that values increase over time (gold is going up)
      const firstPoint = dataPoints[0];
      const lastPoint = dataPoints[dataPoints.length - 1];
      expect(lastPoint.value).toBeGreaterThan(firstPoint.value);
    });

    it("should mark points with source=calculated", () => {
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1)];
      const prices = createPriceData({
        gold: { startPrice: 60, endPrice: 66 },
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Week",
        includeDataPoints: true,
      };

      const dataPoints = strategy.generateDataPoints(input, options);

      const calculatedPoints = dataPoints.filter(
        (p) => p.source === "calculated" || p.source === "interpolated",
      );
      expect(calculatedPoints.length).toBeGreaterThan(0);
    });
  });

  describe("getContinuousStrategy singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = getContinuousStrategy();
      const instance2 = getContinuousStrategy();

      expect(instance1).toBe(instance2);
    });
  });

  describe("calculateContinuousPerformance convenience function", () => {
    it("should work correctly", () => {
      const holdings = [
        createMetalHolding("gold-1", "gold", 1000, 1, { sellPremium: 5 }),
      ];
      const prices = createPriceData({
        gold: { startPrice: 60, endPrice: 66 },
      });

      const input: ContinuousPerformanceInput = { holdings, prices };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: false,
      };

      const result = calculateContinuousPerformance(input, options);

      expect(result.metrics.percentChange).toBeCloseTo(10, 0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Metal-Specific Tests
// ═══════════════════════════════════════════════════════════════

describe("ContinuousPerformanceStrategy - Metal Value Calculation", () => {
  let strategy: ContinuousPerformanceStrategy;

  beforeEach(() => {
    strategy = new ContinuousPerformanceStrategy();
  });

  it("should apply sell premium correctly", () => {
    // 100g gold at €60/g with 10% premium
    const holdings = [
      createMetalHolding("gold-1", "gold", 100, 1, { sellPremium: 10 }),
    ];

    // Flat price (no change)
    const prices: PriceData = {
      gold: createPriceHistory(30, 60, 60, 24),
    };

    const input: ContinuousPerformanceInput = { holdings, prices };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Value should be: 100g × €60 × 1.10 = €6,600
    expect(result.metrics.endValue).toBeCloseTo(6600, -1);
    expect(result.metrics.percentChange).toBeCloseTo(0, 1);
  });

  it("should handle zero premium", () => {
    const holdings = [
      createMetalHolding("gold-1", "gold", 100, 1, { sellPremium: 0 }),
    ];

    const prices: PriceData = {
      gold: createPriceHistory(30, 60, 60, 24),
    };

    const input: ContinuousPerformanceInput = { holdings, prices };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Value should be: 100g × €60 × 1.00 = €6,000
    expect(result.metrics.endValue).toBeCloseTo(6000, -1);
  });

  it("should handle quantity > 1", () => {
    // 5 gold coins, each 31.1g (1 oz)
    const holdings = [
      createMetalHolding("gold-1", "gold", 31.1, 5, { sellPremium: 5 }),
    ];

    const prices: PriceData = {
      gold: createPriceHistory(30, 60, 60, 24),
    };

    const input: ContinuousPerformanceInput = { holdings, prices };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Value: 31.1g × 5 × €60 × 1.05 = €9,796.50
    expect(result.metrics.endValue).toBeCloseTo(9797, -1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe("ContinuousPerformanceStrategy - Edge Cases", () => {
  let strategy: ContinuousPerformanceStrategy;

  beforeEach(() => {
    strategy = new ContinuousPerformanceStrategy();
  });

  it("should handle holdings with missing price data", () => {
    const holdings = [
      createMetalHolding("gold-1", "gold", 1000, 1),
      createMetalHolding("platinum-1", "platinum", 500, 1),
    ];

    // Only gold prices, no platinum
    const prices: PriceData = {
      gold: createPriceHistory(30, 60, 66, 24),
    };

    const input: ContinuousPerformanceInput = { holdings, prices };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    // Should not throw, just calculate what it can
    const result = strategy.calculate(input, options);
    expect(result.metrics).toBeDefined();
  });

  it("should handle very short time ranges", () => {
    const holdings = [createMetalHolding("gold-1", "gold", 1000, 1)];

    // Minutely prices for an hour
    const now = Date.now();
    const prices: PriceData = {
      gold: Array.from({ length: 60 }, (_, i) => ({
        timestamp: now - (60 - i) * 60000,
        price: 60 + i * 0.01,
      })),
    };

    const input: ContinuousPerformanceInput = { holdings, prices };
    const options: PerformanceCalculationOptions = {
      timeRange: "Hour",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);
    expect(result.metrics).toBeDefined();
    expect(result.dataPoints.length).toBeGreaterThan(0);
  });

  it("should handle future purchase dates gracefully", () => {
    const futureDate = Date.now() + 30 * MS_PER_DAY;
    const holdings = [
      createMetalHolding("gold-1", "gold", 1000, 1, {
        purchaseDate: futureDate, // Future date
      }),
    ];

    const prices = createPriceData({
      gold: { startPrice: 60, endPrice: 66 },
    });

    const input: ContinuousPerformanceInput = { holdings, prices };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    // Should handle gracefully (item doesn't exist in the time range)
    const result = strategy.calculate(input, options);
    expect(result.metrics).toBeDefined();
  });

  it("should handle sparse price data with interpolation", () => {
    const holdings = [createMetalHolding("gold-1", "gold", 1000, 1)];

    // Only 2 price points for a month (very sparse)
    const now = Date.now();
    const prices: PriceData = {
      gold: [
        { timestamp: now - 30 * MS_PER_DAY, price: 60 },
        { timestamp: now, price: 66 },
      ],
    };

    const input: ContinuousPerformanceInput = { holdings, prices };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Should interpolate between the two points
    expect(result.metrics.dataPointCount).toBeGreaterThan(2);
    expect(result.metrics.interpolatedPointCount).toBeGreaterThan(0);
  });
});
