/**
 * Performance Calculation Service - Unit Tests
 *
 * Tests for discrete, continuous, and hybrid performance calculation strategies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DiscretePerformanceStrategy,
  calculateDiscretePerformance,
  getDiscreteStrategy,
} from "./strategies/discrete";
import type {
  DiscretePerformanceInput,
  PerformanceCalculationOptions,
} from "./strategies/types";
import type { SnapshotData } from "./types";

// ═══════════════════════════════════════════════════════════════
// Test Utilities
// ═══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;

/**
 * Create a mock snapshot at a given timestamp
 */
function createSnapshot(
  daysAgo: number,
  totalAssets: number,
  options?: {
    totalCostBasis?: number;
    totalLiabilities?: number;
    categoryBreakdown?: Array<{
      category: string;
      value: number;
      costBasis?: number;
    }>;
  },
): SnapshotData {
  const now = Date.now();
  const timestamp = now - daysAgo * MS_PER_DAY;
  const date = new Date(timestamp).toISOString().split("T")[0];

  return {
    timestamp,
    date,
    totalAssets,
    totalLiabilities: options?.totalLiabilities ?? 0,
    netWorth: totalAssets - (options?.totalLiabilities ?? 0),
    totalCostBasis: options?.totalCostBasis,
    categoryBreakdown: options?.categoryBreakdown,
  };
}

/**
 * Create a series of snapshots with linear growth
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

// ═══════════════════════════════════════════════════════════════
// Discrete Performance Strategy Tests
// ═══════════════════════════════════════════════════════════════

describe("DiscretePerformanceStrategy", () => {
  let strategy: DiscretePerformanceStrategy;

  beforeEach(() => {
    strategy = new DiscretePerformanceStrategy();
  });

  describe("calculate", () => {
    it("should return empty metrics for empty snapshots", () => {
      const input: DiscretePerformanceInput = {
        snapshots: [],
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.startValue).toBe(0);
      expect(result.metrics.endValue).toBe(0);
      expect(result.metrics.absoluteChange).toBe(0);
      expect(result.metrics.percentChange).toBe(0);
      expect(result.metrics.dataQuality).toBe("low");
      expect(result.valueType).toBe("discrete");
    });

    it("should calculate positive growth correctly", () => {
      const snapshots = createLinearGrowthSnapshots(10, 10000, 12000, 30);
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.absoluteChange).toBeCloseTo(2000, -1);
      expect(result.metrics.percentChange).toBeCloseTo(20, 0);
      expect(result.metrics.startValue).toBeCloseTo(10000, -1);
      expect(result.metrics.endValue).toBeCloseTo(12000, -1);
    });

    it("should calculate negative growth (loss) correctly", () => {
      const snapshots = createLinearGrowthSnapshots(10, 10000, 8000, 30);
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.absoluteChange).toBeCloseTo(-2000, -1);
      expect(result.metrics.percentChange).toBeCloseTo(-20, 0);
    });

    it("should handle single snapshot", () => {
      const snapshots = [createSnapshot(15, 10000)];
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // With only one snapshot, start and end should be the same
      expect(result.metrics.startValue).toBeGreaterThan(0);
      expect(result.metrics.highValue).toBe(result.metrics.lowValue);
    });

    it("should filter by category when categoryFilter is provided", () => {
      const snapshots = [
        createSnapshot(30, 15000, {
          categoryBreakdown: [
            { category: "equities", value: 10000 },
            { category: "cash", value: 5000 },
          ],
        }),
        createSnapshot(0, 17000, {
          categoryBreakdown: [
            { category: "equities", value: 12000 },
            { category: "cash", value: 5000 },
          ],
        }),
      ];

      const input: DiscretePerformanceInput = {
        snapshots,
        categoryFilter: "equities",
      };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      // Should only consider equities: 10000 -> 12000 = 20% gain
      expect(result.metrics.absoluteChange).toBeCloseTo(2000, -1);
      expect(result.metrics.percentChange).toBeCloseTo(20, 0);
    });

    it("should calculate high and low values correctly", () => {
      const snapshots = [
        createSnapshot(30, 10000),
        createSnapshot(20, 12000), // high
        createSnapshot(10, 9000), // low
        createSnapshot(0, 11000),
      ];
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics.highValue).toBeGreaterThanOrEqual(11000);
      expect(result.metrics.lowValue).toBeLessThanOrEqual(10000);
    });
  });

  describe("assessDataQuality", () => {
    it("should return low for empty snapshots", () => {
      const input: DiscretePerformanceInput = { snapshots: [] };
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      expect(quality).toBe("low");
    });

    it("should return high quality for dense snapshot coverage", () => {
      // Create daily snapshots for a month - high coverage
      const snapshots = createLinearGrowthSnapshots(30, 10000, 11000, 30);
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      expect(quality).toBe("high");
    });

    it("should return medium or low quality for sparse snapshots", () => {
      // Only 2 snapshots for a month - sparse
      const snapshots = [createSnapshot(30, 10000), createSnapshot(0, 11000)];
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = { timeRange: "Month" };

      const quality = strategy.assessDataQuality(input, options);

      expect(["low", "medium"]).toContain(quality);
    });
  });

  describe("generateDataPoints", () => {
    it("should generate data points for the requested time range", () => {
      const snapshots = createLinearGrowthSnapshots(10, 10000, 12000, 30);
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const dataPoints = strategy.generateDataPoints(input, options);

      expect(dataPoints.length).toBeGreaterThan(0);
      expect(dataPoints[0]).toHaveProperty("timestamp");
      expect(dataPoints[0]).toHaveProperty("value");
      expect(dataPoints[0]).toHaveProperty("source");
    });

    it("should include interpolated points when gaps exist", () => {
      const snapshots = [createSnapshot(30, 10000), createSnapshot(0, 12000)];
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const dataPoints = strategy.generateDataPoints(input, options);

      const interpolatedPoints = dataPoints.filter(
        (p) => p.source === "interpolated",
      );
      expect(interpolatedPoints.length).toBeGreaterThan(0);
    });

    it("should mark snapshot-derived points with source=snapshot", () => {
      const snapshots = createLinearGrowthSnapshots(30, 10000, 11000, 30);
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: true,
      };

      const dataPoints = strategy.generateDataPoints(input, options);

      const snapshotPoints = dataPoints.filter((p) => p.source === "snapshot");
      expect(snapshotPoints.length).toBeGreaterThan(0);
    });
  });

  describe("getDiscreteStrategy singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = getDiscreteStrategy();
      const instance2 = getDiscreteStrategy();

      expect(instance1).toBe(instance2);
    });
  });

  describe("calculateDiscretePerformance convenience function", () => {
    it("should work correctly", () => {
      const snapshots = createLinearGrowthSnapshots(10, 10000, 12000, 30);
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "Month",
        includeDataPoints: false,
      };

      const result = calculateDiscretePerformance(input, options);

      expect(result.metrics.percentChange).toBeCloseTo(20, 0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe("DiscretePerformanceStrategy - Edge Cases", () => {
  let strategy: DiscretePerformanceStrategy;

  beforeEach(() => {
    strategy = new DiscretePerformanceStrategy();
  });

  it("should handle snapshots outside the requested time range", () => {
    // Snapshots from 60-90 days ago, but requesting Month (30 days)
    const snapshots = [createSnapshot(90, 10000), createSnapshot(60, 11000)];
    const input: DiscretePerformanceInput = { snapshots };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Should still provide metrics using carry-forward logic
    expect(result.metrics).toBeDefined();
  });

  it("should handle zero value snapshots", () => {
    const snapshots = [createSnapshot(30, 0), createSnapshot(0, 10000)];
    const input: DiscretePerformanceInput = { snapshots };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // When starting from 0, percent change should be 0 (avoid division by zero)
    // But we still show the absolute change since there's no category filter
    expect(result.metrics.percentChange).toBe(0);
    expect(result.metrics.absoluteChange).toBeCloseTo(10000, -1);
  });

  it("should handle very short time ranges (Week)", () => {
    const snapshots = createLinearGrowthSnapshots(7, 10000, 10500, 7);
    const input: DiscretePerformanceInput = { snapshots };
    const options: PerformanceCalculationOptions = {
      timeRange: "Week",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    expect(result.metrics.absoluteChange).toBeCloseTo(500, -1);
    expect(result.metrics.percentChange).toBeCloseTo(5, 0);
  });

  it("should handle long time ranges (Year)", () => {
    const snapshots = createLinearGrowthSnapshots(52, 10000, 15000, 365);
    const input: DiscretePerformanceInput = { snapshots };
    const options: PerformanceCalculationOptions = {
      timeRange: "Year",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    expect(result.metrics.absoluteChange).toBeCloseTo(5000, -1);
    expect(result.metrics.percentChange).toBeCloseTo(50, 0);
  });

  it("should handle YTD time range correctly", () => {
    // Create snapshots that span the year start
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const daysSinceYearStart = Math.floor(
      (now.getTime() - yearStart.getTime()) / MS_PER_DAY,
    );

    // Only test if we're at least a few days into the year
    if (daysSinceYearStart > 7) {
      const snapshots = createLinearGrowthSnapshots(
        Math.min(daysSinceYearStart, 30),
        10000,
        11000,
        Math.min(daysSinceYearStart, 30),
      );
      const input: DiscretePerformanceInput = { snapshots };
      const options: PerformanceCalculationOptions = {
        timeRange: "YTD",
        includeDataPoints: true,
      };

      const result = strategy.calculate(input, options);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.timeRange).toBe("YTD");
    }
  });

  it("should handle snapshots with identical timestamps", () => {
    const timestamp = Date.now() - 15 * MS_PER_DAY;
    const snapshots: SnapshotData[] = [
      {
        timestamp,
        date: new Date(timestamp).toISOString().split("T")[0],
        totalAssets: 10000,
        totalLiabilities: 0,
        netWorth: 10000,
      },
      {
        timestamp, // Same timestamp!
        date: new Date(timestamp).toISOString().split("T")[0],
        totalAssets: 10500,
        totalLiabilities: 0,
        netWorth: 10500,
      },
    ];
    const input: DiscretePerformanceInput = { snapshots };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    // Should not throw
    const result = strategy.calculate(input, options);
    expect(result.metrics).toBeDefined();
  });

  it("should handle unordered snapshots", () => {
    // Snapshots not in chronological order
    const snapshots = [
      createSnapshot(10, 11000),
      createSnapshot(30, 10000),
      createSnapshot(0, 12000),
      createSnapshot(20, 10500),
    ];
    const input: DiscretePerformanceInput = { snapshots };
    const options: PerformanceCalculationOptions = {
      timeRange: "Month",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Should correctly identify 10000 -> 12000 = 20% gain
    expect(result.metrics.absoluteChange).toBeCloseTo(2000, -1);
    expect(result.metrics.percentChange).toBeCloseTo(20, 0);
  });

  it("should use current value as baseline when only 1 snapshot exists in YTD range for category", () => {
    // Simulate crypto scenario: only one snapshot with crypto value exists
    // No historical crypto data before Jan 1
    const now = Date.now();

    // Single snapshot from "today" - represents first and only crypto sync
    const snapshots: SnapshotData[] = [
      {
        timestamp: now,
        date: new Date(now).toISOString().split("T")[0],
        totalAssets: 5000,
        totalLiabilities: 0,
        netWorth: 5000,
        categoryBreakdown: [{ category: "crypto", value: 5000 }],
      },
    ];

    const input: DiscretePerformanceInput = {
      snapshots,
      categoryFilter: "crypto",
    };
    const options: PerformanceCalculationOptions = {
      timeRange: "YTD",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Should show 0% change because there's no meaningful baseline
    // The single snapshot is both the start and end value
    expect(result.metrics.percentChange).toBe(0);
    expect(result.metrics.absoluteChange).toBe(0);
    expect(result.metrics.startValue).toBe(5000);
    expect(result.metrics.endValue).toBe(5000);
  });

  it("should use current value as baseline when historical snapshots had 0 value for category", () => {
    // Scenario: Crypto was added in 2026, but snapshots from 2025 exist with 0 crypto value
    // This happens when user had other assets synced in 2025, but crypto was added later
    const now = Date.now();
    const dec2024 = new Date(2024, 11, 15).getTime(); // Dec 15, 2024

    // Create snapshots with categoryBreakdown - crypto had 0 value before
    const snapshots: SnapshotData[] = [
      {
        timestamp: dec2024,
        date: "2024-12-15",
        totalAssets: 10000, // Total portfolio had value
        totalLiabilities: 0,
        netWorth: 10000,
        categoryBreakdown: [
          { category: "equities", value: 10000 },
          { category: "crypto", value: 0 }, // Crypto was 0 back then
        ],
      },
      {
        timestamp: now,
        date: new Date(now).toISOString().split("T")[0],
        totalAssets: 10161.61,
        totalLiabilities: 0,
        netWorth: 10161.61,
        categoryBreakdown: [
          { category: "equities", value: 10000 },
          { category: "crypto", value: 161.61 }, // Crypto added now
        ],
      },
    ];

    // Filter by crypto category
    const input: DiscretePerformanceInput = {
      snapshots,
      categoryFilter: "crypto",
    };
    const options: PerformanceCalculationOptions = {
      timeRange: "YTD",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // Should show 0% change because the crypto category had 0 value historically
    // (no meaningful baseline for this category - it didn't exist before)
    expect(result.metrics.percentChange).toBe(0);
    expect(result.metrics.absoluteChange).toBe(0);
    expect(result.metrics.startValue).toBeCloseTo(161.61, 1);
    expect(result.metrics.endValue).toBeCloseTo(161.61, 1);
  });

  it("should show actual change when historical snapshot exists before range start", () => {
    // If there's a snapshot from last year, it provides a valid baseline
    const now = Date.now();
    const dec2024 = new Date(2024, 11, 15).getTime(); // Dec 15, 2024

    const snapshots: SnapshotData[] = [
      {
        timestamp: dec2024,
        date: "2024-12-15",
        totalAssets: 4000,
        totalLiabilities: 0,
        netWorth: 4000,
      },
      {
        timestamp: now,
        date: new Date(now).toISOString().split("T")[0],
        totalAssets: 5000,
        totalLiabilities: 0,
        netWorth: 5000,
      },
    ];

    const input: DiscretePerformanceInput = { snapshots };
    const options: PerformanceCalculationOptions = {
      timeRange: "YTD",
      includeDataPoints: true,
    };

    const result = strategy.calculate(input, options);

    // With historical data before range start, we should see non-zero change
    // (the exact value depends on interpolation from Dec 15 to Jan 1)
    // The important thing is that it's NOT flattened to 0% like when there's no history
    expect(result.metrics.percentChange).not.toBe(0);
    expect(result.metrics.absoluteChange).not.toBe(0);
    // End value should be the current snapshot
    expect(result.metrics.endValue).toBe(5000);
  });
});
