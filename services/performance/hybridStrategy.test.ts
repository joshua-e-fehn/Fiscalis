/**
 * Hybrid Performance Strategy - Unit Tests
 *
 * Tests for combined discrete + continuous performance calculation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HybridPerformanceStrategy,
  calculateHybridPerformance,
  getHybridStrategy,
  type HybridPerformanceResult,
} from "./strategies/hybrid";
import type {
  HybridPerformanceInput,
  DiscretePerformanceInput,
  ContinuousPerformanceInput,
  PerformanceCalculationOptions,
} from "./strategies/types";
import type { SnapshotData, HoldingData, PriceData, PricePoint } from "./types";

// ═══════════════════════════════════════════════════════════════
// Test Utilities
// ═══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;

/**
 * Create a mock snapshot
 */
function createSnapshot(
  daysAgo: number,
  totalAssets: number,
  options?: { totalCostBasis?: number },
): SnapshotData {
  const now = Date.now();
  const timestamp = now - daysAgo * MS_PER_DAY;
  const date = new Date(timestamp).toISOString().split("T")[0];

  return {
    timestamp,
    date,
    totalAssets,
    totalLiabilities: 0,
    netWorth: totalAssets,
    totalCostBasis: options?.totalCostBasis,
  };
}

/**
 * Create snapshots with linear growth
 */
function createLinearGrowthSnapshots(
  count: number,
  startValue: number,
  endValue: number,
  daysSpan: number,
): SnapshotData[] {
  const snapshots: SnapshotData[] = [];
  const valueStep = (endValue - startValue) / (count - 1);
  const dayStep = daysSpan / (count - 1);

  for (let i = 0; i < count; i++) {
    const daysAgo = daysSpan - i * dayStep;
    const value = startValue + i * valueStep;
    snapshots.push(createSnapshot(daysAgo, value));
  }

  return snapshots;
}

/**
 * Create a metal holding
 */
function createMetalHolding(
  id: string,
  metalType: string,
  fineWeightGrams: number,
  quantity: number = 1,
  sellPremium: number = 5,
): HoldingData {
  return {
    id,
    assetType: metalType,
    quantity,
    fineWeightGrams,
    sellPremium,
    purchaseDate: Date.now() - 365 * MS_PER_DAY,
  };
}

/**
 * Create price history
 */
function createPriceHistory(
  daysBack: number,
  startPrice: number,
  endPrice: number,
): PricePoint[] {
  const now = Date.now();
  const points: PricePoint[] = [];
  const totalPoints = daysBack;
  const priceStep = (endPrice - startPrice) / totalPoints;

  for (let i = 0; i <= totalPoints; i++) {
    const daysAgo = daysBack - i;
    points.push({
      timestamp: now - daysAgo * MS_PER_DAY,
      price: startPrice + i * priceStep,
    });
  }

  return points;
}

// ═══════════════════════════════════════════════════════════════
// Hybrid Performance Strategy Tests
// ═══════════════════════════════════════════════════════════════

describe("HybridPerformanceStrategy", () => {
  let strategy: HybridPerformanceStrategy;

  beforeEach(() => {
    strategy = new HybridPerformanceStrategy();
  });

  describe("calculate with discrete only", () => {
    it("should work with only discrete input", () => {
      const snapshots = createLinearGrowthSnapshots(10, 10000, 12000, 30);
      const input: HybridPerformanceInput = {
        discrete: { snapshots },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.percentChange).toBeCloseTo(20, 0);
      expect(result.breakdown.discrete).toBeDefined();
      expect(result.breakdown.continuous).toBeUndefined();
    });

    it("should handle empty continuous input", () => {
      const snapshots = createLinearGrowthSnapshots(10, 10000, 12000, 30);
      const input: HybridPerformanceInput = {
        discrete: { snapshots },
        continuous: { holdings: [], prices: {} },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.percentChange).toBeCloseTo(20, 0);
      expect(result.breakdown.discrete).toBeDefined();
    });
  });

  describe("calculate with continuous only", () => {
    it("should work with only continuous input", () => {
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1, 5)];
      const prices: PriceData = {
        gold: createPriceHistory(30, 60, 66), // +10%
      };

      const input: HybridPerformanceInput = {
        continuous: { holdings, prices },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.percentChange).toBeCloseTo(10, 0);
      expect(result.breakdown.continuous).toBeDefined();
      expect(result.breakdown.discrete).toBeUndefined();
    });
  });

  describe("calculate with both discrete and continuous", () => {
    it("should combine discrete and continuous results", () => {
      // Discrete: 50,000 -> 55,000 (+10%)
      const snapshots = createLinearGrowthSnapshots(10, 50000, 55000, 30);

      // Continuous: Gold worth ~63,000 -> ~69,300 (+10%)
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1, 5)];
      const prices: PriceData = {
        gold: createPriceHistory(30, 60, 66),
      };

      const input: HybridPerformanceInput = {
        discrete: { snapshots },
        continuous: { holdings, prices },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Both components should show positive growth
      expect(result.metrics.percentChange).toBeGreaterThan(0);
      expect(result.breakdown.discrete).toBeDefined();
      expect(result.breakdown.continuous).toBeDefined();

      // Check that values are combined (end > start)
      expect(result.metrics.endValue).toBeGreaterThan(
        result.metrics.startValue,
      );

      // Verify breakdown exists with positive changes
      expect(result.breakdown.discrete!.metrics.percentChange).toBeGreaterThan(
        0,
      );
      expect(
        result.breakdown.continuous!.metrics.percentChange,
      ).toBeGreaterThan(0);
    });

    it("should handle different growth rates correctly", () => {
      // Discrete: 50,000 -> 60,000 (+20%)
      const snapshots = createLinearGrowthSnapshots(10, 50000, 60000, 30);

      // Continuous: Gold flat (0%)
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1, 5)];
      const prices: PriceData = {
        gold: createPriceHistory(30, 60, 60), // No change
      };

      const input: HybridPerformanceInput = {
        discrete: { snapshots },
        continuous: { holdings, prices },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Combined should show positive growth (discrete is up 20%, continuous flat)
      expect(result.metrics.percentChange).toBeGreaterThan(0);

      // Verify breakdown shows the individual rates
      expect(result.breakdown.discrete!.metrics.percentChange).toBeGreaterThan(
        15,
      );
      expect(result.breakdown.continuous!.metrics.percentChange).toBeCloseTo(
        0,
        1,
      );
    });

    it("should handle losses in one and gains in other", () => {
      // Discrete: 50,000 -> 45,000 (-10%)
      const snapshots = createLinearGrowthSnapshots(10, 50000, 45000, 30);

      // Continuous: Gold up +20%
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1, 5)];
      const prices: PriceData = {
        gold: createPriceHistory(30, 60, 72), // +20%
      };

      const input: HybridPerformanceInput = {
        discrete: { snapshots },
        continuous: { holdings, prices },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Should be somewhere in between
      expect(result.metrics).toBeDefined();
      expect(result.breakdown.discrete!.metrics.percentChange).toBeLessThan(0);
      expect(
        result.breakdown.continuous!.metrics.percentChange,
      ).toBeGreaterThan(0);
    });
  });

  describe("data point merging", () => {
    it("should merge data points at the same timestamp", () => {
      // Create inputs that generate points at similar timestamps
      const snapshots = createLinearGrowthSnapshots(5, 10000, 11000, 30);
      const holdings = [createMetalHolding("gold-1", "gold", 100, 1, 5)];
      const prices: PriceData = {
        gold: createPriceHistory(30, 60, 66),
      };

      const input: HybridPerformanceInput = {
        discrete: { snapshots },
        continuous: { holdings, prices },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Should have merged data points
      expect(result.dataPoints.length).toBeGreaterThan(0);

      // Each point should have combined value > discrete alone
      const discreteOnly = strategy.calculate(
        { discrete: { snapshots } },
        options,
      );

      // The combined result should have higher values
      const lastCombined = result.dataPoints[result.dataPoints.length - 1];
      const lastDiscrete =
        discreteOnly.dataPoints[discreteOnly.dataPoints.length - 1];
      expect(lastCombined.value).toBeGreaterThan(lastDiscrete.value);
    });
  });

  describe("assessDataQuality", () => {
    it("should return low for empty input", () => {
      const input: HybridPerformanceInput = {};
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      expect(quality).toBe("low");
    });

    it("should return combined quality (lowest of both)", () => {
      // Dense discrete snapshots (high quality)
      const snapshots = createLinearGrowthSnapshots(30, 10000, 11000, 30);

      // Sparse prices (low quality)
      const holdings = [createMetalHolding("gold-1", "gold", 100, 1, 5)];
      const prices: PriceData = {
        gold: [
          { timestamp: Date.now() - 30 * MS_PER_DAY, price: 60 },
          { timestamp: Date.now(), price: 66 },
        ],
      };

      const input: HybridPerformanceInput = {
        discrete: { snapshots },
        continuous: { holdings, prices },
      };
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      // Should be medium or low due to sparse price data
      expect(["low", "medium"]).toContain(quality);
    });
  });

  describe("breakdown", () => {
    it("should provide accurate breakdown for each component", () => {
      const snapshots = createLinearGrowthSnapshots(10, 50000, 55000, 30);
      const holdings = [createMetalHolding("gold-1", "gold", 1000, 1, 5)];
      const prices: PriceData = {
        gold: createPriceHistory(30, 60, 66),
      };

      const input: HybridPerformanceInput = {
        discrete: { snapshots },
        continuous: { holdings, prices },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Discrete breakdown should show ~10% gain
      expect(result.breakdown.discrete!.metrics.percentChange).toBeCloseTo(
        10,
        0,
      );

      // Continuous breakdown should show ~10% gain
      expect(result.breakdown.continuous!.metrics.percentChange).toBeCloseTo(
        10,
        0,
      );
    });
  });

  describe("getHybridStrategy singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = getHybridStrategy();
      const instance2 = getHybridStrategy();

      expect(instance1).toBe(instance2);
    });
  });

  describe("calculateHybridPerformance convenience function", () => {
    it("should work correctly", () => {
      const snapshots = createLinearGrowthSnapshots(10, 50000, 55000, 30);
      const input: HybridPerformanceInput = {
        discrete: { snapshots },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: false,
      };

      const result = calculateHybridPerformance(input, options);

      expect(result.metrics.percentChange).toBeCloseTo(10, 0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe("HybridPerformanceStrategy - Edge Cases", () => {
  let strategy: HybridPerformanceStrategy;

  beforeEach(() => {
    strategy = new HybridPerformanceStrategy();
  });

  it("should handle completely empty input", () => {
    const input: HybridPerformanceInput = {};
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    expect(result.metrics.startValue).toBe(0);
    expect(result.metrics.endValue).toBe(0);
    expect(result.metrics.dataQuality).toBe("low");
  });

  it("should handle discrete with empty snapshots", () => {
    const input: HybridPerformanceInput = {
      discrete: { snapshots: [] },
    };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    expect(result.metrics.dataQuality).toBe("low");
  });

  it("should handle continuous with no price data", () => {
    const holdings = [createMetalHolding("gold-1", "gold", 1000, 1, 5)];
    const input: HybridPerformanceInput = {
      continuous: { holdings, prices: {} },
    };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Without prices, continuous should not contribute
    expect(result.breakdown.continuous).toBeUndefined();
  });

  it("should handle very large portfolios", () => {
    // Large discrete portfolio
    const snapshots = createLinearGrowthSnapshots(30, 1000000, 1100000, 30);

    // Large continuous holdings
    const holdings = [
      createMetalHolding("gold-1", "gold", 10000, 10, 5),
      createMetalHolding("silver-1", "silver", 100000, 1, 10),
    ];
    const prices: PriceData = {
      gold: createPriceHistory(30, 60, 66),
      silver: createPriceHistory(30, 0.8, 0.88),
    };

    const input: HybridPerformanceInput = {
      discrete: { snapshots },
      continuous: { holdings, prices },
    };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    expect(result.metrics.startValue).toBeGreaterThan(1000000);
    expect(result.metrics.percentChange).toBeGreaterThan(0);
  });

  it("should handle YTD time range", () => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const daysSinceYearStart = Math.floor(
      (now.getTime() - yearStart.getTime()) / MS_PER_DAY,
    );

    if (daysSinceYearStart > 7) {
      const snapshots = createLinearGrowthSnapshots(
        Math.min(daysSinceYearStart, 30),
        10000,
        11000,
        Math.min(daysSinceYearStart, 30),
      );

      const input: HybridPerformanceInput = {
        discrete: { snapshots },
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "YTD",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.timeRange).toBe("YTD");
    }
  });

  it("should handle when discrete and continuous have different time coverage", () => {
    // Snapshots only for last 15 days
    const snapshots = createLinearGrowthSnapshots(5, 10000, 10500, 15);

    // Prices for full 30 days
    const holdings = [createMetalHolding("gold-1", "gold", 100, 1, 5)];
    const prices: PriceData = {
      gold: createPriceHistory(30, 60, 66),
    };

    const input: HybridPerformanceInput = {
      discrete: { snapshots },
      continuous: { holdings, prices },
    };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    // Should not throw
    const result = strategy.calculate(input, options);
    expect(result.metrics).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration Tests
// ═══════════════════════════════════════════════════════════════

describe("HybridPerformanceStrategy - Integration", () => {
  it("should produce consistent results when called multiple times", () => {
    const strategy = new HybridPerformanceStrategy();

    const snapshots = createLinearGrowthSnapshots(10, 10000, 11000, 30);
    const input: HybridPerformanceInput = {
      discrete: { snapshots },
    };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result1 = strategy.calculate(input, options);
    const result2 = strategy.calculate(input, options);

    // Use toBeCloseTo for floating point comparison
    expect(result1.metrics.percentChange).toBeCloseTo(
      result2.metrics.percentChange,
      5,
    );
    expect(result1.metrics.absoluteChange).toBeCloseTo(
      result2.metrics.absoluteChange,
      0,
    );
  });

  it("should work with different time ranges", () => {
    const strategy = new HybridPerformanceStrategy();

    const snapshots = createLinearGrowthSnapshots(52, 10000, 12000, 365);
    const input: HybridPerformanceInput = {
      discrete: { snapshots },
    };

    const timeRanges: Array<"Week" | "Month" | "Year"> = [
      "Week",
      "Month",
      "Year",
    ];

    for (const timeRange of timeRanges) {
      const result = strategy.calculate(input, {
        timeRange,
        includeDataPoints: true,
      });

      expect(result.metrics).toBeDefined();
      expect(result.metrics.timeRange).toBe(timeRange);
    }
  });
});
