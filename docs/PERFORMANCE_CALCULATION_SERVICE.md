# Performance Calculation Service Architecture

**Status**: ✅ Implementation Complete  
**Created**: February 2026  
**Updated**: February 2026  
**Related To**: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Implementation Status

| Phase                               | Status      | Description                                                      |
| ----------------------------------- | ----------- | ---------------------------------------------------------------- |
| Phase 1: Finance Service Extensions | ✅ Complete | Extended TimeRange, added MS constants, helpers                  |
| Phase 2: Core Types & Config        | ✅ Complete | Created lib/performance types and config                         |
| Phase 3: Strategy Interface         | ✅ Complete | Created IPerformanceStrategy and BasePerformanceStrategy         |
| Phase 4: Discrete Strategy          | ✅ Complete | DiscretePerformanceStrategy for snapshots                        |
| Phase 5: Continuous Strategy        | ✅ Complete | ContinuousPerformanceStrategy for prices                         |
| Phase 6: Hybrid Strategy            | ✅ Complete | HybridPerformanceStrategy combining both                         |
| Phase 7: React Hooks                | ✅ Complete | usePerformance, useDiscretePerformance, useContinuousPerformance |
| Phase 8: Integration                | ✅ Complete | Bridge hooks, PerformanceChart, deprecations                     |

### Quick Start

```tsx
// For discrete assets (bank accounts, broker positions)
import { useDiscretePerformance } from "@/hooks/performance";

const { metrics, isLoading } = useDiscretePerformance({
  timeRange: "YTD",
});

// For continuous assets (precious metals)
import { useContinuousPerformance } from "@/hooks/performance";

const { metrics, dataPoints } = useContinuousPerformance({
  timeRange: "3Month",
  currency: "eur",
  includeDataPoints: true,
});

// For unified portfolio (both discrete + continuous)
import { usePerformance } from "@/hooks/performance";

const { metrics, breakdown } = usePerformance({
  timeRange: "YTD",
  includeDiscrete: true,
  includeContinuous: true,
});
```

### File Structure

```
frontend/
├── lib/performance/
│   ├── types.ts           # Core types (TimeRange, PerformanceDataPoint, etc.)
│   ├── config.ts          # Asset category configuration
│   ├── index.ts           # Barrel exports
│   └── strategies/
│       ├── types.ts       # Strategy interfaces
│       ├── base.ts        # BasePerformanceStrategy
│       ├── discrete.ts    # DiscretePerformanceStrategy
│       ├── continuous.ts  # ContinuousPerformanceStrategy
│       ├── hybrid.ts      # HybridPerformanceStrategy
│       └── index.ts
├── hooks/performance/
│   ├── usePerformance.ts         # Unified hook
│   ├── useDiscretePerformance.ts # Snapshot-based
│   ├── useContinuousPerformance.ts # Price-based
│   ├── useTimeRangeSelection.ts  # UI state
│   ├── usePortfolioYTD.ts        # Bridge hook (deprecated)
│   ├── useMetalsYTD.ts           # Bridge hook (deprecated)
│   └── index.ts
└── components/atomic/molecules/performance/
    ├── PerformanceChart.tsx      # Unified chart component
    └── index.ts
```

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Solution](#proposed-solution)
4. [Data Classification](#data-classification)
5. [Service Architecture](#service-architecture)
6. [API Design](#api-design)
7. [Concrete Integration Plan](#concrete-integration-plan)
8. [Migration Strategy](#migration-strategy)

---

## Problem Statement

Currently, Fiscalis has **multiple fragmented implementations** of performance calculations scattered across the codebase:

1. **Different time range definitions** in different files (`TimeRange`, `ChartTimeRange`, `PortfolioTimeRange`)
2. **Inconsistent YTD calculations** for discrete vs continuous value assets
3. **No unified interface** for calculating performance across different time windows (1W, 1M, 3M, 6M, YTD, 1Y, All)
4. **Different data sources** requiring different calculation strategies:
   - **Discrete values** (bank balances) - only known at sync time
   - **Continuous values** (precious metals) - have minute-by-minute historical prices

### Current Pain Points

| Location                                               | Issue                                        |
| ------------------------------------------------------ | -------------------------------------------- |
| `services/finance/financeService.ts`                   | Defines `TimeRange` but rarely used          |
| `frontend/lib/types/investments.ts`                    | `calculateYTDPerformance()` - snapshot-based |
| `frontend/hooks/metals.ts`                             | `useYTDPortfolioPerformance()` - price-based |
| `frontend/hooks/convex/portfolio.ts`                   | Manual YTD calculation from snapshots        |
| `frontend/components/.../PortfolioChart.tsx`           | Builds history from transactions             |
| `frontend/components/.../CategoryPerformanceChart.tsx` | Different `ChartTimeRange` type              |

---

## Current State Analysis

### Time Range Definitions (Fragmented)

```typescript
// services/finance/financeService.ts
type TimeRange = "Hour" | "Day" | "Week" | "Month" | "Year" | "YTD" | "ALL";

// frontend/components/.../CategoryPerformanceChart.tsx
type ChartTimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "All";

// frontend/hooks/metals.ts
type PortfolioTimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "All";
```

### Data Sources & Their Characteristics

| Data Source             | Update Frequency           | Historical Data      | Value Type      |
| ----------------------- | -------------------------- | -------------------- | --------------- |
| **Plaid Bank Accounts** | On sync (manual/scheduled) | Only snapshots       | Discrete        |
| **SnapTrade Positions** | On sync (manual/scheduled) | Only snapshots       | Discrete        |
| **Vezgo Crypto**        | On sync                    | Only snapshots       | Discrete        |
| **Precious Metals**     | Every minute               | Full price history   | Continuous      |
| **Crypto Prices**       | Could be continuous        | Can fetch historical | Semi-Continuous |
| **Stock Prices**        | Could be continuous        | Can fetch historical | Semi-Continuous |

### Current Performance Calculation Approaches

#### 1. Snapshot-Based (Discrete Values)

```typescript
// Current: frontend/hooks/convex/portfolio.ts
const yearStartPoint = historyDataPoints.find(
  (p) => p.timestamp >= yearStartTimestamp,
);
if (yearStartPoint) {
  const valueAtYearStart = yearStartPoint.value;
  ytdProfitLoss = totalAssets - valueAtYearStart;
}
```

**Limitation**: Requires a snapshot to exist at/near the target date.

#### 2. Price-Based (Continuous Values)

```typescript
// Current: frontend/hooks/metals.ts
const spotPrice = startOfYearPrices[item.metalType];
const itemValueAtStartOfYear = calculateSellPrice(
  spotPrice,
  item.fineWeightGrams,
  item.sellPremium,
  item.quantity,
);
```

**Advantage**: Can calculate precise value at any point in time.

---

## Proposed Solution

### Unified Performance Calculation Service

A **centralized service** that provides consistent performance calculations while respecting the fundamental differences between discrete and continuous value assets.

### Core Principles

1. **Single Source of Truth** for time range definitions and performance calculations
2. **Strategy Pattern** for different data types (discrete vs continuous)
3. **Consistent API** regardless of underlying data source
4. **Graceful Degradation** when data is unavailable
5. **Caching** for expensive calculations

---

## Data Classification

### Discrete Value Assets

Assets where we **only know the value at sync points**. The value between sync points is **unknown** and must be interpolated or assumed constant.

```
Value
  │
  │     ┌─────────● Sync 3
  │     │         │
  │  ●──┘         │
  │  Sync 2       │
  │               ●─────── Current
  │  ●────────────┘
  │  Sync 1
  │
  └────────────────────────────► Time
```

**Examples:**

- Bank account balances (Plaid)
- Brokerage cash balances
- Broker positions (at sync time)
- Credit card balances
- Loan balances
- Real estate values (manually entered)

**Calculation Strategy:**

- Use **portfolio snapshots** for historical values
- If no snapshot at target date: use **nearest snapshot** or **interpolate**
- Can't calculate intra-day performance accurately
- Best resolution: daily (with scheduled syncs)

### Continuous Value Assets

Assets where we can **calculate the value at any point in time** because we have:

1. The **inventory/quantity** at each point in time (from transactions)
2. The **market price** at each point in time (from price feeds)

```
Price
  │                           ╭────────
  │     ╭─────╮   ╭──────────╯
  │ ────╯     ╰───╯
  │
  │  Historical price data (minutely/hourly)
  │
  └────────────────────────────────────► Time

Quantity
  │              ┌─────────────────────
  │         ┌────┘
  │    ┌────┘    Transaction 2
  │────┘
  │    Transaction 1
  │
  └────────────────────────────────────► Time

Value = Quantity(t) × Price(t)
```

**Examples:**

- Precious metals (gold, silver, platinum, palladium)

**Future Candidates** (when price history APIs are implemented):

- Crypto assets
- Stocks/ETFs

**Calculation Strategy:**

- Fetch **historical prices** for the exact time range
- Track **inventory changes** via transactions
- Calculate: `Value(t) = Σ(quantity_i(t) × price_i(t) × premium_i)`
- Can calculate precise values at any timestamp

---

## Service Architecture

### Directory Structure

```
frontend/
├── lib/
│   └── performance/
│       ├── index.ts                    # Public exports
│       ├── types.ts                    # Unified types
│       ├── timeRanges.ts               # Time range utilities
│       ├── PerformanceService.ts       # Main service class
│       ├── strategies/
│       │   ├── index.ts
│       │   ├── DiscreteStrategy.ts     # Snapshot-based calculation
│       │   ├── ContinuousStrategy.ts   # Price-based calculation
│       │   └── HybridStrategy.ts       # Combined portfolios
│       └── providers/
│           ├── index.ts
│           ├── SnapshotProvider.ts     # Fetch portfolio snapshots
│           ├── MetalsPriceProvider.ts  # Fetch metal prices
│           ├── CryptoPriceProvider.ts  # Fetch crypto prices (future)
│           └── StockPriceProvider.ts   # Fetch stock prices (future)
│
├── hooks/
│   └── performance/
│       ├── usePerformance.ts           # Main hook
│       ├── useTimeRange.ts             # Time range selection
│       └── usePerformanceChart.ts      # Chart data hook
```

### Core Types

```typescript
// lib/performance/types.ts

/**
 * Unified time range type for all performance calculations
 */
export type PerformanceTimeRange =
  | "1H" // 1 Hour (continuous only)
  | "1D" // 1 Day
  | "1W" // 1 Week
  | "1M" // 1 Month
  | "3M" // 3 Months
  | "6M" // 6 Months
  | "YTD" // Year to Date
  | "1Y" // 1 Year
  | "3Y" // 3 Years
  | "5Y" // 5 Years
  | "ALL"; // All available data

/**
 * Data aggregation interval for charts
 */
export type AggregationInterval = "minute" | "hour" | "day" | "week" | "month";

/**
 * Classification of value types
 */
export type ValueType = "discrete" | "continuous" | "hybrid";

/**
 * A single point in the performance time series
 */
export interface PerformanceDataPoint {
  timestamp: number; // Unix timestamp (ms)
  date: string; // ISO date string for display
  value: number; // Total value at this point
  costBasis: number | null; // Cost basis if known

  // Metadata
  source: "snapshot" | "calculated" | "interpolated";
  confidence: number; // 0-1, how reliable is this data point
}

/**
 * Performance metrics for a time period
 */
export interface PerformanceMetrics {
  // Absolute values
  startValue: number;
  endValue: number;
  change: number; // endValue - startValue
  changePercent: number; // (change / startValue) * 100

  // Time-weighted returns (more accurate for portfolios with flows)
  twrr?: number; // Time-Weighted Rate of Return

  // Money-weighted returns (considers timing of cash flows)
  mwrr?: number; // Money-Weighted Rate of Return (IRR)

  // Additional metrics
  high: number; // Highest value in period
  low: number; // Lowest value in period
  volatility?: number; // Standard deviation of returns
  sharpeRatio?: number; // Risk-adjusted return

  // Metadata
  dataQuality: "high" | "medium" | "low";
  dataPointCount: number;
  interpolatedPoints: number;
  timeRange: PerformanceTimeRange;
  calculatedAt: number;
}

/**
 * Complete performance result
 */
export interface PerformanceResult {
  metrics: PerformanceMetrics;
  dataPoints: PerformanceDataPoint[];

  // For multi-asset portfolios
  breakdown?: {
    category: string;
    metrics: PerformanceMetrics;
    valueType: ValueType;
  }[];
}

/**
 * Asset category with its value type
 */
export interface AssetCategoryConfig {
  id: string;
  name: string;
  valueType: ValueType;
  priceProvider?: string; // For continuous: which provider to use
  snapshotField?: string; // For discrete: field name in snapshot
}
```

### Asset Category Configuration

```typescript
// lib/performance/config.ts

export const ASSET_CATEGORIES: AssetCategoryConfig[] = [
  // DISCRETE VALUE ASSETS (snapshot-based)
  {
    id: "cash",
    name: "Cash & Savings",
    valueType: "discrete",
    snapshotField: "cash",
  },
  {
    id: "equities",
    name: "Equities",
    valueType: "discrete", // Until we add live stock prices
    snapshotField: "equities",
  },
  {
    id: "bonds",
    name: "Bonds",
    valueType: "discrete",
    snapshotField: "bonds",
  },
  {
    id: "real-estate",
    name: "Real Estate",
    valueType: "discrete",
    snapshotField: "realEstate",
  },
  {
    id: "crypto",
    name: "Cryptocurrency",
    valueType: "discrete", // Can be upgraded to continuous with price API
    snapshotField: "crypto",
  },
  {
    id: "collectibles",
    name: "Collectibles",
    valueType: "discrete",
    snapshotField: "collectibles",
  },

  // CONTINUOUS VALUE ASSETS (price-based)
  {
    id: "commodities",
    name: "Commodities (Metals)",
    valueType: "continuous",
    priceProvider: "metals",
  },

  // LIABILITIES (discrete, negative values)
  {
    id: "liabilities",
    name: "Liabilities",
    valueType: "discrete",
    snapshotField: "liabilities",
  },
];
```

### Time Range Utilities

```typescript
// lib/performance/timeRanges.ts

export interface TimeRangeConfig {
  range: PerformanceTimeRange;
  label: string;
  shortLabel: string;
  getStartDate: () => Date;
  defaultInterval: AggregationInterval;
  minDataPoints: number;
  supportsContinuous: boolean;
  supportsDiscrete: boolean;
}

export const TIME_RANGE_CONFIG: Record<PerformanceTimeRange, TimeRangeConfig> =
  {
    "1H": {
      range: "1H",
      label: "1 Hour",
      shortLabel: "1H",
      getStartDate: () => new Date(Date.now() - 60 * 60 * 1000),
      defaultInterval: "minute",
      minDataPoints: 60,
      supportsContinuous: true,
      supportsDiscrete: false, // No meaningful data at minute level
    },
    "1D": {
      range: "1D",
      label: "1 Day",
      shortLabel: "1D",
      getStartDate: () => new Date(Date.now() - 24 * 60 * 60 * 1000),
      defaultInterval: "hour",
      minDataPoints: 24,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    "1W": {
      range: "1W",
      label: "1 Week",
      shortLabel: "1W",
      getStartDate: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      defaultInterval: "day",
      minDataPoints: 7,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    "1M": {
      range: "1M",
      label: "1 Month",
      shortLabel: "1M",
      getStartDate: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      defaultInterval: "day",
      minDataPoints: 30,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    "3M": {
      range: "3M",
      label: "3 Months",
      shortLabel: "3M",
      getStartDate: () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      defaultInterval: "day",
      minDataPoints: 90,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    "6M": {
      range: "6M",
      label: "6 Months",
      shortLabel: "6M",
      getStartDate: () => new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      defaultInterval: "day",
      minDataPoints: 180,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    YTD: {
      range: "YTD",
      label: "Year to Date",
      shortLabel: "YTD",
      getStartDate: () => {
        const now = new Date();
        return new Date(Date.UTC(now.getFullYear(), 0, 1, 0, 0, 0, 0));
      },
      defaultInterval: "day",
      minDataPoints: 1,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    "1Y": {
      range: "1Y",
      label: "1 Year",
      shortLabel: "1Y",
      getStartDate: () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      defaultInterval: "week",
      minDataPoints: 52,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    "3Y": {
      range: "3Y",
      label: "3 Years",
      shortLabel: "3Y",
      getStartDate: () => new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
      defaultInterval: "month",
      minDataPoints: 36,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    "5Y": {
      range: "5Y",
      label: "5 Years",
      shortLabel: "5Y",
      getStartDate: () => new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000),
      defaultInterval: "month",
      minDataPoints: 60,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
    ALL: {
      range: "ALL",
      label: "All Time",
      shortLabel: "All",
      getStartDate: () => new Date(Date.UTC(2024, 0, 1)), // Platform launch
      defaultInterval: "month",
      minDataPoints: 1,
      supportsContinuous: true,
      supportsDiscrete: true,
    },
  };

export function getTimeRange(range: PerformanceTimeRange): {
  start: Date;
  end: Date;
  interval: AggregationInterval;
} {
  const config = TIME_RANGE_CONFIG[range];
  return {
    start: config.getStartDate(),
    end: new Date(),
    interval: config.defaultInterval,
  };
}
```

### Calculation Strategies

#### Discrete Strategy (Snapshot-Based)

```typescript
// lib/performance/strategies/DiscreteStrategy.ts

import {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceTimeRange,
} from "../types";

export interface SnapshotData {
  timestamp: number;
  value: number;
  costBasis?: number;
}

export class DiscreteStrategy {
  /**
   * Calculate performance from portfolio snapshots
   *
   * For discrete value assets, we can only know values at snapshot times.
   * This strategy:
   * 1. Finds snapshots within the time range
   * 2. Interpolates if start/end dates don't have exact snapshots
   * 3. Returns data quality indicator
   */
  calculate(
    snapshots: SnapshotData[],
    timeRange: PerformanceTimeRange,
    startDate: Date,
    endDate: Date,
  ): { metrics: PerformanceMetrics; dataPoints: PerformanceDataPoint[] } {
    const sortedSnapshots = [...snapshots].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    // Find start value (nearest snapshot to startDate)
    const startValue = this.findNearestValue(
      sortedSnapshots,
      startDate.getTime(),
    );
    const endValue = this.findNearestValue(sortedSnapshots, endDate.getTime());

    // Filter snapshots within range
    const rangeSnapshots = sortedSnapshots.filter(
      (s) =>
        s.timestamp >= startDate.getTime() && s.timestamp <= endDate.getTime(),
    );

    // Build data points
    const dataPoints: PerformanceDataPoint[] = [];

    // Add start point (may be interpolated)
    if (startValue !== null) {
      dataPoints.push({
        timestamp: startDate.getTime(),
        date: startDate.toISOString(),
        value: startValue.value,
        costBasis: startValue.costBasis ?? null,
        source: startValue.isInterpolated ? "interpolated" : "snapshot",
        confidence: startValue.isInterpolated ? 0.7 : 1.0,
      });
    }

    // Add actual snapshots
    for (const snapshot of rangeSnapshots) {
      dataPoints.push({
        timestamp: snapshot.timestamp,
        date: new Date(snapshot.timestamp).toISOString(),
        value: snapshot.value,
        costBasis: snapshot.costBasis ?? null,
        source: "snapshot",
        confidence: 1.0,
      });
    }

    // Add end point (current value)
    if (endValue !== null) {
      dataPoints.push({
        timestamp: endDate.getTime(),
        date: endDate.toISOString(),
        value: endValue.value,
        costBasis: endValue.costBasis ?? null,
        source: endValue.isInterpolated ? "interpolated" : "snapshot",
        confidence: endValue.isInterpolated ? 0.8 : 1.0,
      });
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(dataPoints, timeRange);

    return { metrics, dataPoints };
  }

  private findNearestValue(
    snapshots: SnapshotData[],
    targetTimestamp: number,
  ): { value: number; costBasis?: number; isInterpolated: boolean } | null {
    if (snapshots.length === 0) return null;

    // Exact match
    const exact = snapshots.find((s) => s.timestamp === targetTimestamp);
    if (exact) {
      return {
        value: exact.value,
        costBasis: exact.costBasis,
        isInterpolated: false,
      };
    }

    // Find surrounding snapshots
    const before = snapshots.filter((s) => s.timestamp < targetTimestamp).pop();
    const after = snapshots.find((s) => s.timestamp > targetTimestamp);

    // If only before exists, use it (assume constant until next snapshot)
    if (before && !after) {
      return {
        value: before.value,
        costBasis: before.costBasis,
        isInterpolated: true,
      };
    }

    // If only after exists, use it
    if (!before && after) {
      return {
        value: after.value,
        costBasis: after.costBasis,
        isInterpolated: true,
      };
    }

    // Interpolate between before and after
    if (before && after) {
      const ratio =
        (targetTimestamp - before.timestamp) /
        (after.timestamp - before.timestamp);
      const value = before.value + (after.value - before.value) * ratio;
      return { value, isInterpolated: true };
    }

    return null;
  }

  private calculateMetrics(
    dataPoints: PerformanceDataPoint[],
    timeRange: PerformanceTimeRange,
  ): PerformanceMetrics {
    if (dataPoints.length < 2) {
      return this.emptyMetrics(timeRange);
    }

    const start = dataPoints[0];
    const end = dataPoints[dataPoints.length - 1];

    const change = end.value - start.value;
    const changePercent = start.value > 0 ? (change / start.value) * 100 : 0;

    const values = dataPoints.map((dp) => dp.value);
    const high = Math.max(...values);
    const low = Math.min(...values);

    const interpolatedCount = dataPoints.filter(
      (dp) => dp.source === "interpolated",
    ).length;

    const dataQuality =
      interpolatedCount === 0
        ? "high"
        : interpolatedCount < dataPoints.length / 2
          ? "medium"
          : "low";

    return {
      startValue: start.value,
      endValue: end.value,
      change,
      changePercent,
      high,
      low,
      dataQuality,
      dataPointCount: dataPoints.length,
      interpolatedPoints: interpolatedCount,
      timeRange,
      calculatedAt: Date.now(),
    };
  }

  private emptyMetrics(timeRange: PerformanceTimeRange): PerformanceMetrics {
    return {
      startValue: 0,
      endValue: 0,
      change: 0,
      changePercent: 0,
      high: 0,
      low: 0,
      dataQuality: "low",
      dataPointCount: 0,
      interpolatedPoints: 0,
      timeRange,
      calculatedAt: Date.now(),
    };
  }
}
```

#### Continuous Strategy (Price-Based)

```typescript
// lib/performance/strategies/ContinuousStrategy.ts

import {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceTimeRange,
} from "../types";

export interface HoldingData {
  id: string;
  assetType: string; // "gold", "silver", etc.
  quantity: number;
  fineWeightGrams?: number; // For metals
  sellPremium?: number; // For metals
  purchaseDate: number; // When acquired
  purchasePrice?: number; // Cost basis per unit
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface PriceProviderResult {
  prices: Record<string, PricePoint[]>; // keyed by asset type
  interval: string;
}

export class ContinuousStrategy {
  /**
   * Calculate performance using historical prices
   *
   * For continuous value assets:
   * 1. Fetches historical prices for the time range
   * 2. Determines holdings at each price point (via transactions)
   * 3. Calculates: Value(t) = Σ(holding_i × price_i(t))
   */
  calculate(
    holdings: HoldingData[],
    prices: PriceProviderResult,
    timeRange: PerformanceTimeRange,
    startDate: Date,
    endDate: Date,
    calculateValue: (holding: HoldingData, price: number) => number,
  ): { metrics: PerformanceMetrics; dataPoints: PerformanceDataPoint[] } {
    // Get all unique timestamps from all asset prices
    const allTimestamps = new Set<number>();
    for (const assetPrices of Object.values(prices.prices)) {
      for (const pp of assetPrices) {
        allTimestamps.add(pp.timestamp);
      }
    }

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // Build price lookup by timestamp and asset
    const priceLookup = new Map<string, Map<number, number>>();
    for (const [asset, assetPrices] of Object.entries(prices.prices)) {
      const assetMap = new Map<number, number>();
      for (const pp of assetPrices) {
        assetMap.set(pp.timestamp, pp.price);
      }
      priceLookup.set(asset, assetMap);
    }

    // Calculate portfolio value at each timestamp
    const dataPoints: PerformanceDataPoint[] = [];
    let lastKnownPrices: Record<string, number> = {};

    for (const ts of sortedTimestamps) {
      // Skip if outside range
      if (ts < startDate.getTime() || ts > endDate.getTime()) continue;

      let totalValue = 0;
      let totalCost = 0;

      for (const holding of holdings) {
        // Skip if holding didn't exist at this timestamp
        if (holding.purchaseDate > ts) continue;

        // Get price for this asset at this timestamp
        let price = priceLookup.get(holding.assetType)?.get(ts);

        // Forward-fill: use last known price if no price at this timestamp
        if (price === undefined && lastKnownPrices[holding.assetType]) {
          price = lastKnownPrices[holding.assetType];
        }

        if (price !== undefined) {
          lastKnownPrices[holding.assetType] = price;
          totalValue += calculateValue(holding, price);

          if (holding.purchasePrice) {
            totalCost += holding.purchasePrice * holding.quantity;
          }
        }
      }

      if (totalValue > 0) {
        dataPoints.push({
          timestamp: ts,
          date: new Date(ts).toISOString(),
          value: totalValue,
          costBasis: totalCost > 0 ? totalCost : null,
          source: "calculated",
          confidence: 1.0,
        });
      }
    }

    const metrics = this.calculateMetrics(dataPoints, timeRange);
    return { metrics, dataPoints };
  }

  private calculateMetrics(
    dataPoints: PerformanceDataPoint[],
    timeRange: PerformanceTimeRange,
  ): PerformanceMetrics {
    if (dataPoints.length < 2) {
      return this.emptyMetrics(timeRange);
    }

    const start = dataPoints[0];
    const end = dataPoints[dataPoints.length - 1];

    const change = end.value - start.value;
    const changePercent = start.value > 0 ? (change / start.value) * 100 : 0;

    const values = dataPoints.map((dp) => dp.value);
    const high = Math.max(...values);
    const low = Math.min(...values);

    // Calculate volatility (standard deviation of daily returns)
    const volatility = this.calculateVolatility(dataPoints);

    return {
      startValue: start.value,
      endValue: end.value,
      change,
      changePercent,
      high,
      low,
      volatility,
      dataQuality: "high",
      dataPointCount: dataPoints.length,
      interpolatedPoints: 0,
      timeRange,
      calculatedAt: Date.now(),
    };
  }

  private calculateVolatility(dataPoints: PerformanceDataPoint[]): number {
    if (dataPoints.length < 3) return 0;

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < dataPoints.length; i++) {
      const prevValue = dataPoints[i - 1].value;
      const currValue = dataPoints[i].value;
      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }

    if (returns.length === 0) return 0;

    // Calculate standard deviation
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  private emptyMetrics(timeRange: PerformanceTimeRange): PerformanceMetrics {
    return {
      startValue: 0,
      endValue: 0,
      change: 0,
      changePercent: 0,
      high: 0,
      low: 0,
      dataQuality: "low",
      dataPointCount: 0,
      interpolatedPoints: 0,
      timeRange,
      calculatedAt: Date.now(),
    };
  }
}
```

#### Hybrid Strategy (Combined Portfolio)

```typescript
// lib/performance/strategies/HybridStrategy.ts

import {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceTimeRange,
} from "../types";
import { DiscreteStrategy } from "./DiscreteStrategy";
import { ContinuousStrategy } from "./ContinuousStrategy";

export interface CategoryPerformance {
  category: string;
  valueType: "discrete" | "continuous";
  metrics: PerformanceMetrics;
  dataPoints: PerformanceDataPoint[];
  weight: number; // Current percentage of total portfolio
}

export class HybridStrategy {
  /**
   * Combine discrete and continuous performance calculations
   *
   * For a mixed portfolio:
   * 1. Calculate continuous assets with price data (high precision)
   * 2. Calculate discrete assets with snapshots (lower precision)
   * 3. Merge timelines and aggregate values
   * 4. Report data quality based on composition
   */
  combine(
    discretePerformance: CategoryPerformance[],
    continuousPerformance: CategoryPerformance[],
    timeRange: PerformanceTimeRange,
  ): {
    metrics: PerformanceMetrics;
    dataPoints: PerformanceDataPoint[];
    breakdown: CategoryPerformance[];
  } {
    const allCategories = [...discretePerformance, ...continuousPerformance];

    // Merge all data points into a unified timeline
    const timelineMap = new Map<
      number,
      {
        discreteValue: number;
        continuousValue: number;
        discreteCost: number;
        continuousCost: number;
        discreteConfidence: number;
        continuousConfidence: number;
      }
    >();

    // Process discrete data points
    for (const cat of discretePerformance) {
      for (const dp of cat.dataPoints) {
        const existing = timelineMap.get(dp.timestamp) || {
          discreteValue: 0,
          continuousValue: 0,
          discreteCost: 0,
          continuousCost: 0,
          discreteConfidence: 0,
          continuousConfidence: 0,
        };
        existing.discreteValue += dp.value;
        existing.discreteCost += dp.costBasis ?? 0;
        existing.discreteConfidence = Math.max(
          existing.discreteConfidence,
          dp.confidence,
        );
        timelineMap.set(dp.timestamp, existing);
      }
    }

    // Process continuous data points
    for (const cat of continuousPerformance) {
      for (const dp of cat.dataPoints) {
        const existing = timelineMap.get(dp.timestamp) || {
          discreteValue: 0,
          continuousValue: 0,
          discreteCost: 0,
          continuousCost: 0,
          discreteConfidence: 0,
          continuousConfidence: 0,
        };
        existing.continuousValue += dp.value;
        existing.continuousCost += dp.costBasis ?? 0;
        existing.continuousConfidence = Math.max(
          existing.continuousConfidence,
          dp.confidence,
        );
        timelineMap.set(dp.timestamp, existing);
      }
    }

    // Build merged data points
    const sortedTimestamps = Array.from(timelineMap.keys()).sort(
      (a, b) => a - b,
    );

    // Forward-fill discrete values (they're constant between snapshots)
    let lastDiscreteValue = 0;
    let lastDiscreteCost = 0;

    const mergedDataPoints: PerformanceDataPoint[] = [];

    for (const ts of sortedTimestamps) {
      const data = timelineMap.get(ts)!;

      // Use forward-filled discrete value if no discrete data at this point
      const discreteValue =
        data.discreteValue > 0 ? data.discreteValue : lastDiscreteValue;
      const discreteCost =
        data.discreteCost > 0 ? data.discreteCost : lastDiscreteCost;

      if (data.discreteValue > 0) {
        lastDiscreteValue = data.discreteValue;
        lastDiscreteCost = data.discreteCost;
      }

      const totalValue = discreteValue + data.continuousValue;
      const totalCost = discreteCost + data.continuousCost;

      // Weighted confidence
      const discreteWeight = discreteValue / (totalValue || 1);
      const continuousWeight = data.continuousValue / (totalValue || 1);
      const confidence =
        discreteWeight * data.discreteConfidence +
        continuousWeight * data.continuousConfidence;

      mergedDataPoints.push({
        timestamp: ts,
        date: new Date(ts).toISOString(),
        value: totalValue,
        costBasis: totalCost > 0 ? totalCost : null,
        source: data.continuousValue > 0 ? "calculated" : "snapshot",
        confidence: confidence || 0.5,
      });
    }

    // Calculate aggregate metrics
    const metrics = this.calculateAggregateMetrics(
      mergedDataPoints,
      allCategories,
      timeRange,
    );

    return {
      metrics,
      dataPoints: mergedDataPoints,
      breakdown: allCategories,
    };
  }

  private calculateAggregateMetrics(
    dataPoints: PerformanceDataPoint[],
    categories: CategoryPerformance[],
    timeRange: PerformanceTimeRange,
  ): PerformanceMetrics {
    if (dataPoints.length < 2) {
      return this.emptyMetrics(timeRange);
    }

    const start = dataPoints[0];
    const end = dataPoints[dataPoints.length - 1];

    const change = end.value - start.value;
    const changePercent = start.value > 0 ? (change / start.value) * 100 : 0;

    const values = dataPoints.map((dp) => dp.value);
    const high = Math.max(...values);
    const low = Math.min(...values);

    // Data quality based on composition
    const continuousWeight = categories
      .filter((c) => c.valueType === "continuous")
      .reduce((sum, c) => sum + c.weight, 0);

    const interpolatedCount = dataPoints.filter(
      (dp) => dp.source === "interpolated",
    ).length;

    const dataQuality =
      continuousWeight > 0.7
        ? "high"
        : continuousWeight > 0.3 || interpolatedCount < dataPoints.length / 4
          ? "medium"
          : "low";

    return {
      startValue: start.value,
      endValue: end.value,
      change,
      changePercent,
      high,
      low,
      dataQuality,
      dataPointCount: dataPoints.length,
      interpolatedPoints: interpolatedCount,
      timeRange,
      calculatedAt: Date.now(),
    };
  }

  private emptyMetrics(timeRange: PerformanceTimeRange): PerformanceMetrics {
    return {
      startValue: 0,
      endValue: 0,
      change: 0,
      changePercent: 0,
      high: 0,
      low: 0,
      dataQuality: "low",
      dataPointCount: 0,
      interpolatedPoints: 0,
      timeRange,
      calculatedAt: Date.now(),
    };
  }
}
```

---

## API Design

### React Hooks

```typescript
// hooks/performance/usePerformance.ts

import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  PerformanceTimeRange,
  PerformanceResult,
  ValueType,
} from "@/lib/performance/types";
import { TIME_RANGE_CONFIG, getTimeRange } from "@/lib/performance/timeRanges";

export interface UsePerformanceOptions {
  timeRange: PerformanceTimeRange;
  categories?: string[]; // Filter to specific categories
  currency?: "eur" | "usd" | "chf";
}

export interface UsePerformanceResult {
  data: PerformanceResult | null;
  isLoading: boolean;
  error: Error | null;

  // Metadata
  timeRange: PerformanceTimeRange;
  availableRanges: PerformanceTimeRange[];
  dataQualityWarning?: string;
}

/**
 * Main hook for unified performance calculation
 *
 * This hook:
 * 1. Determines which strategy to use based on requested categories
 * 2. Fetches required data (snapshots, prices)
 * 3. Calculates performance metrics
 * 4. Returns unified result with data quality indicators
 */
export function usePerformance(
  options: UsePerformanceOptions,
): UsePerformanceResult {
  const { timeRange, categories, currency = "eur" } = options;

  // Get time range configuration
  const rangeConfig = TIME_RANGE_CONFIG[timeRange];
  const { start, end } = getTimeRange(timeRange);

  // Fetch portfolio snapshots (for discrete assets)
  const snapshots = useQuery(api.portfolioSnapshots.getSnapshots, {
    startDate: start.getTime(),
    endDate: end.getTime(),
    limit: 1000,
  });

  // Fetch vault items (for continuous - metals)
  const vaultItems = useQuery(api.vault.getItems);

  // TODO: Fetch metal prices via useSWR/React Query
  // const metalPrices = useMetalPricesRange(...)

  // Calculate performance
  const result = useMemo(() => {
    if (snapshots === undefined || vaultItems === undefined) {
      return null;
    }

    // Implementation would use the strategies defined above
    // ...
  }, [snapshots, vaultItems, timeRange, categories, currency]);

  return {
    data: result,
    isLoading: snapshots === undefined || vaultItems === undefined,
    error: null,
    timeRange,
    availableRanges: Object.keys(TIME_RANGE_CONFIG) as PerformanceTimeRange[],
  };
}
```

### Time Range Hook

```typescript
// hooks/performance/useTimeRange.ts

import { useState, useCallback, useMemo } from "react";
import { PerformanceTimeRange, ValueType } from "@/lib/performance/types";
import { TIME_RANGE_CONFIG } from "@/lib/performance/timeRanges";

export interface UseTimeRangeResult {
  timeRange: PerformanceTimeRange;
  setTimeRange: (range: PerformanceTimeRange) => void;

  // UI helpers
  availableRanges: {
    value: PerformanceTimeRange;
    label: string;
    disabled: boolean;
  }[];
  isValidForValueType: (valueType: ValueType) => boolean;
}

/**
 * Hook for managing time range selection
 *
 * Provides available ranges based on value type constraints
 */
export function useTimeRange(
  defaultRange: PerformanceTimeRange = "3M",
  valueType: ValueType = "hybrid",
): UseTimeRangeResult {
  const [timeRange, setTimeRange] =
    useState<PerformanceTimeRange>(defaultRange);

  const availableRanges = useMemo(() => {
    return (Object.keys(TIME_RANGE_CONFIG) as PerformanceTimeRange[]).map(
      (range) => {
        const config = TIME_RANGE_CONFIG[range];

        let disabled = false;
        if (valueType === "discrete" && !config.supportsDiscrete) {
          disabled = true;
        }
        if (valueType === "continuous" && !config.supportsContinuous) {
          disabled = true;
        }

        return {
          value: range,
          label: config.label,
          disabled,
        };
      },
    );
  }, [valueType]);

  const isValidForValueType = useCallback(
    (vt: ValueType) => {
      const config = TIME_RANGE_CONFIG[timeRange];
      if (vt === "discrete") return config.supportsDiscrete;
      if (vt === "continuous") return config.supportsContinuous;
      return true;
    },
    [timeRange],
  );

  return {
    timeRange,
    setTimeRange,
    availableRanges,
    isValidForValueType,
  };
}
```

---

## Concrete Integration Plan

This section provides a detailed, step-by-step integration plan with concrete tasks that can be worked through sequentially.

### Overview

| Phase | Focus                   | Status      | Dependencies |
| ----- | ----------------------- | ----------- | ------------ |
| 1     | Extend Finance Service  | ✅ Complete | None         |
| 2     | Core Types & Config     | ✅ Complete | Phase 1      |
| 3     | Strategy Interface      | ✅ Complete | Phase 2      |
| 4     | Discrete Strategy       | ✅ Complete | Phase 3      |
| 5     | Continuous Strategy     | ✅ Complete | Phase 3      |
| 6     | Hybrid Aggregator       | ✅ Complete | Phases 4 & 5 |
| 7     | React Hooks             | ✅ Complete | Phase 6      |
| 8     | Integration & Migration | ✅ Complete | Phase 7      |

### Implementation Progress

**All Phases Complete!**

**Completed Files:**

- `services/finance/financeService.ts` - Extended with new TimeRange values, MS constants, helper functions
- `frontend/lib/performance/types.ts` - Core type definitions
- `frontend/lib/performance/config.ts` - Asset category configuration
- `frontend/lib/performance/index.ts` - Barrel exports
- `frontend/lib/performance/strategies/types.ts` - Strategy interface types
- `frontend/lib/performance/strategies/base.ts` - Abstract base strategy class
- `frontend/lib/performance/strategies/discrete.ts` - Discrete (snapshot-based) strategy
- `frontend/lib/performance/strategies/continuous.ts` - Continuous (price-based) strategy
- `frontend/lib/performance/strategies/hybrid.ts` - Hybrid strategy combining discrete + continuous
- `frontend/lib/performance/strategies/index.ts` - Strategy exports
- `frontend/hooks/performance/index.ts` - Hook exports
- `frontend/hooks/performance/useTimeRangeSelection.ts` - Time range state management
- `frontend/hooks/performance/useDiscretePerformance.ts` - Snapshot-based performance hook
- `frontend/hooks/performance/useContinuousPerformance.ts` - Price-based performance hook
- `frontend/hooks/performance/usePerformance.ts` - Unified performance hook
- `frontend/hooks/performance/usePortfolioYTD.ts` - Bridge hook for backward compatibility
- `frontend/hooks/performance/useMetalsYTD.ts` - Bridge hook for metals YTD
- `frontend/components/atomic/molecules/performance/PerformanceChart.tsx` - Unified chart component
- `frontend/components/atomic/molecules/performance/index.ts` - Performance component exports

**Deprecated (with notices added):**

- `frontend/lib/types/investments.ts` → `calculateYTDPerformance()` - Use `usePortfolioYTD()` instead
- `frontend/hooks/metals.ts` → `useYTDPortfolioPerformance()` - Use `useMetalsYTD()` instead

---

### Phase 1: Extend Finance Service

**Goal**: Add missing time ranges to `services/finance/financeService.ts` and export utilities for reuse.

#### Task 1.1: Add New Time Ranges to Existing Types

**File**: `services/finance/financeService.ts`

```typescript
// BEFORE:
export type TimeRange =
  | "Hour"
  | "Day"
  | "Week"
  | "Month"
  | "Year"
  | "YTD"
  | "ALL";

// AFTER:
export type TimeRange =
  | "Hour"
  | "Day"
  | "Week"
  | "Month"
  | "3Month" // NEW
  | "6Month" // NEW
  | "Year"
  | "3Year" // NEW
  | "5Year" // NEW
  | "YTD"
  | "ALL";
```

#### Task 1.2: Add New MS Constants

**File**: `services/finance/financeService.ts`

```typescript
// Add after existing constants
const MS_PER_3_MONTHS = MS_PER_MONTH * 3;
const MS_PER_6_MONTHS = MS_PER_MONTH * 6;
const MS_PER_3_YEARS = MS_PER_YEAR * 3;
const MS_PER_5_YEARS = MS_PER_YEAR * 5;
```

#### Task 1.3: Update `getTimeRangeInMilliseconds`

**File**: `services/finance/financeService.ts`

```typescript
export function getTimeRangeInMilliseconds(timeRange: TimeRange) {
  const now = new Date();

  switch (timeRange) {
    // ... existing cases ...
    case "3Month":
      return MS_PER_3_MONTHS;
    case "6Month":
      return MS_PER_6_MONTHS;
    case "3Year":
      return MS_PER_3_YEARS;
    case "5Year":
      return MS_PER_5_YEARS;
    // ... rest unchanged
  }
}
```

#### Task 1.4: Add `getTimeRangeStartDate` Helper

**File**: `services/finance/financeService.ts`

```typescript
/**
 * Get the start date for a given time range
 * Returns the timestamp in milliseconds
 */
export function getTimeRangeStartDate(timeRange: TimeRange): number {
  const now = Date.now();

  switch (timeRange) {
    case "Hour":
      return now - MS_PER_HOUR;
    case "Day":
      return now - MS_PER_DAY;
    case "Week":
      return now - MS_PER_WEEK;
    case "Month":
      return now - MS_PER_MONTH;
    case "3Month":
      return now - MS_PER_3_MONTHS;
    case "6Month":
      return now - MS_PER_6_MONTHS;
    case "Year":
      return now - MS_PER_YEAR;
    case "3Year":
      return now - MS_PER_3_YEARS;
    case "5Year":
      return now - MS_PER_5_YEARS;
    case "YTD": {
      const currentYear = new Date().getUTCFullYear();
      return new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0)).getTime();
    }
    case "ALL":
      return new Date(Date.UTC(2024, 0, 1, 0, 0, 0, 0)).getTime(); // Platform launch
    default:
      return now - MS_PER_DAY;
  }
}
```

#### Task 1.5: Add `getDefaultIntervalForRange` Helper

**File**: `services/finance/financeService.ts`

```typescript
/**
 * Get the recommended aggregation interval for a time range
 * Used for chart data point density
 */
export function getDefaultIntervalForRange(timeRange: TimeRange): TimeInterval {
  switch (timeRange) {
    case "Hour":
      return "minute";
    case "Day":
      return "hour";
    case "Week":
    case "Month":
    case "3Month":
      return "day";
    case "6Month":
    case "Year":
    case "YTD":
      return "day"; // Could be "week" for performance
    case "3Year":
    case "5Year":
    case "ALL":
      return "week"; // Or "month" for very long ranges
    default:
      return "day";
  }
}
```

#### Task 1.6: Export All Constants

**File**: `services/finance/financeService.ts`

```typescript
// Add exports at the bottom of the file
export {
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  MS_PER_WEEK,
  MS_PER_MONTH,
  MS_PER_QUARTER,
  MS_PER_YEAR,
  MS_PER_3_MONTHS,
  MS_PER_6_MONTHS,
  MS_PER_3_YEARS,
  MS_PER_5_YEARS,
};
```

---

### Phase 2: Core Types & Configuration

**Goal**: Create the performance module structure with types and configuration.

#### Task 2.1: Create Directory Structure

```bash
mkdir -p frontend/lib/performance/strategies
mkdir -p frontend/hooks/performance
```

#### Task 2.2: Create Core Types

**File**: `frontend/lib/performance/types.ts`

```typescript
/**
 * Performance Calculation Service - Core Types
 *
 * Unified types for performance calculations across all asset categories.
 * Distinguishes between discrete (snapshot-based) and continuous (price-based) values.
 */

import { TimeRange, TimeInterval } from "@/../services/finance/financeService";

// Re-export for convenience
export { TimeRange, TimeInterval };

/**
 * UI-friendly time range mapping
 * Maps short labels (1W, 1M) to service TimeRange values
 */
export type PerformanceTimeRangeLabel =
  | "1H"
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "6M"
  | "YTD"
  | "1Y"
  | "3Y"
  | "5Y"
  | "ALL";

/**
 * Mapping from UI labels to TimeRange
 */
export const TIME_RANGE_LABEL_MAP: Record<
  PerformanceTimeRangeLabel,
  TimeRange
> = {
  "1H": "Hour",
  "1D": "Day",
  "1W": "Week",
  "1M": "Month",
  "3M": "3Month",
  "6M": "6Month",
  YTD: "YTD",
  "1Y": "Year",
  "3Y": "3Year",
  "5Y": "5Year",
  ALL: "ALL",
};

/**
 * Reverse mapping from TimeRange to UI labels
 */
export const TIME_RANGE_TO_LABEL: Record<TimeRange, PerformanceTimeRangeLabel> =
  {
    Hour: "1H",
    Day: "1D",
    Week: "1W",
    Month: "1M",
    "3Month": "3M",
    "6Month": "6M",
    Year: "1Y",
    "3Year": "3Y",
    "5Year": "5Y",
    YTD: "YTD",
    ALL: "ALL",
  };

/**
 * Classification of how asset values are determined
 */
export type ValueType = "discrete" | "continuous";

/**
 * Data source reliability
 */
export type DataSource = "snapshot" | "calculated" | "interpolated";

/**
 * Quality indicator for performance data
 */
export type DataQuality = "high" | "medium" | "low";

/**
 * A single point in a performance time series
 */
export interface PerformanceDataPoint {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** ISO date string for display */
  date: string;
  /** Total value at this point */
  value: number;
  /** Cost basis if known */
  costBasis: number | null;
  /** How this data point was derived */
  source: DataSource;
  /** Confidence in this data point (0-1) */
  confidence: number;
}

/**
 * Performance metrics calculated for a time period
 */
export interface PerformanceMetrics {
  // Core values
  startValue: number;
  endValue: number;
  absoluteChange: number;
  percentChange: number;

  // Range statistics
  highValue: number;
  lowValue: number;

  // Quality metadata
  dataQuality: DataQuality;
  dataPointCount: number;
  interpolatedPointCount: number;

  // Time context
  timeRange: TimeRange;
  startTimestamp: number;
  endTimestamp: number;
  calculatedAt: number;

  // Optional advanced metrics (Phase 8)
  annualizedReturn?: number;
  volatility?: number;
}

/**
 * Complete performance calculation result
 */
export interface PerformanceResult {
  metrics: PerformanceMetrics;
  dataPoints: PerformanceDataPoint[];
  valueType: ValueType;
}

/**
 * Configuration for an asset category
 */
export interface AssetCategoryConfig {
  id: string;
  name: string;
  valueType: ValueType;
  /** For discrete: field in snapshot categoryBreakdown */
  snapshotCategory?: string;
  /** For continuous: which price provider to use */
  priceProvider?: "metals" | "crypto" | "stocks";
  /** Whether this category can be upgraded to continuous in the future */
  canUpgradeToContinuous: boolean;
}

/**
 * Portfolio snapshot data (from Convex)
 */
export interface SnapshotData {
  timestamp: number;
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalCostBasis?: number;
  categoryBreakdown?: Array<{
    category: string;
    value: number;
    costBasis?: number;
  }>;
}
```

#### Task 2.3: Create Asset Category Configuration

**File**: `frontend/lib/performance/config.ts`

```typescript
/**
 * Performance Calculation Service - Configuration
 *
 * Defines asset categories and their value types.
 * NOTE: Crypto and Stocks are marked as discrete for now but configured
 * to allow upgrade to continuous when price history APIs are implemented.
 */

import { AssetCategoryConfig, PerformanceTimeRangeLabel } from "./types";

/**
 * Asset category configurations
 *
 * DISCRETE: Values only known at sync time (snapshots)
 * CONTINUOUS: Values can be calculated at any time using price history
 */
export const ASSET_CATEGORIES: AssetCategoryConfig[] = [
  // ═══════════════════════════════════════════════════════════════
  // DISCRETE VALUE ASSETS (snapshot-based)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "cash",
    name: "Cash & Savings",
    valueType: "discrete",
    snapshotCategory: "cash",
    canUpgradeToContinuous: false, // Bank balances are inherently discrete
  },
  {
    id: "equities",
    name: "Equities",
    valueType: "discrete",
    snapshotCategory: "equities",
    priceProvider: "stocks",
    canUpgradeToContinuous: true, // Can upgrade with stock price API
  },
  {
    id: "bonds",
    name: "Bonds",
    valueType: "discrete",
    snapshotCategory: "bonds",
    canUpgradeToContinuous: false, // Bond pricing is complex
  },
  {
    id: "real-estate",
    name: "Real Estate",
    valueType: "discrete",
    snapshotCategory: "realEstate",
    canUpgradeToContinuous: false, // Manual valuations
  },
  {
    id: "crypto",
    name: "Cryptocurrency",
    valueType: "discrete", // TODO: Upgrade when crypto price API is integrated
    snapshotCategory: "crypto",
    priceProvider: "crypto",
    canUpgradeToContinuous: true, // Can upgrade with crypto price API
  },
  {
    id: "collectibles",
    name: "Collectibles",
    valueType: "discrete",
    snapshotCategory: "collectibles",
    canUpgradeToContinuous: false, // Manual valuations
  },

  // ═══════════════════════════════════════════════════════════════
  // CONTINUOUS VALUE ASSETS (price-based)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "commodities",
    name: "Commodities (Precious Metals)",
    valueType: "continuous",
    snapshotCategory: "commodities",
    priceProvider: "metals",
    canUpgradeToContinuous: false, // Already continuous
  },

  // ═══════════════════════════════════════════════════════════════
  // LIABILITIES (discrete, negative values)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "liabilities",
    name: "Liabilities",
    valueType: "discrete",
    snapshotCategory: "liabilities",
    canUpgradeToContinuous: false, // Loan balances are discrete
  },
];

/**
 * Get category config by ID
 */
export function getCategoryConfig(
  categoryId: string,
): AssetCategoryConfig | undefined {
  return ASSET_CATEGORIES.find((c) => c.id === categoryId);
}

/**
 * Get all discrete categories
 */
export function getDiscreteCategories(): AssetCategoryConfig[] {
  return ASSET_CATEGORIES.filter((c) => c.valueType === "discrete");
}

/**
 * Get all continuous categories
 */
export function getContinuousCategories(): AssetCategoryConfig[] {
  return ASSET_CATEGORIES.filter((c) => c.valueType === "continuous");
}

/**
 * Time range display configuration
 */
export interface TimeRangeDisplayConfig {
  label: PerformanceTimeRangeLabel;
  displayName: string;
  shortName: string;
  /** Whether this range is meaningful for discrete-only portfolios */
  supportsDiscrete: boolean;
  /** Whether this range is meaningful for continuous data */
  supportsContinuous: boolean;
}

export const TIME_RANGE_DISPLAY: TimeRangeDisplayConfig[] = [
  {
    label: "1H",
    displayName: "1 Hour",
    shortName: "1H",
    supportsDiscrete: false,
    supportsContinuous: true,
  },
  {
    label: "1D",
    displayName: "1 Day",
    shortName: "1D",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "1W",
    displayName: "1 Week",
    shortName: "1W",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "1M",
    displayName: "1 Month",
    shortName: "1M",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "3M",
    displayName: "3 Months",
    shortName: "3M",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "6M",
    displayName: "6 Months",
    shortName: "6M",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "YTD",
    displayName: "Year to Date",
    shortName: "YTD",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "1Y",
    displayName: "1 Year",
    shortName: "1Y",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "3Y",
    displayName: "3 Years",
    shortName: "3Y",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "5Y",
    displayName: "5 Years",
    shortName: "5Y",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
  {
    label: "ALL",
    displayName: "All Time",
    shortName: "All",
    supportsDiscrete: true,
    supportsContinuous: true,
  },
];

/**
 * Get available time ranges for a value type
 */
export function getAvailableTimeRanges(
  valueType: "discrete" | "continuous" | "hybrid",
): TimeRangeDisplayConfig[] {
  return TIME_RANGE_DISPLAY.filter((config) => {
    if (valueType === "discrete") return config.supportsDiscrete;
    if (valueType === "continuous") return config.supportsContinuous;
    return true; // hybrid supports all
  });
}
```

#### Task 2.4: Create Index File

**File**: `frontend/lib/performance/index.ts`

```typescript
/**
 * Performance Calculation Service
 *
 * Unified performance calculations for all asset categories.
 * Handles both discrete (snapshot-based) and continuous (price-based) assets.
 */

// Types
export * from "./types";

// Configuration
export * from "./config";

// Strategies (added in later phases)
// export * from "./strategies";
```

---

### Phase 3: Discrete Strategy Implementation

**Goal**: Implement snapshot-based performance calculation for discrete value assets.

#### Task 3.1: Create Discrete Strategy

**File**: `frontend/lib/performance/strategies/DiscreteStrategy.ts`

```typescript
/**
 * Discrete Strategy - Snapshot-based Performance Calculation
 *
 * For assets where we only know values at sync points (bank accounts, broker positions, etc.)
 * Uses portfolio snapshots from Convex and interpolates between them when needed.
 */

import {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceResult,
  SnapshotData,
  DataQuality,
  TimeRange,
} from "../types";
import {
  getTimeRangeStartDate,
  getTimeIntervalInMilliseconds,
} from "@/../services/finance/financeService";

export interface DiscreteStrategyInput {
  snapshots: SnapshotData[];
  timeRange: TimeRange;
  categoryFilter?: string; // Optional: filter to specific category
}

export interface InterpolationResult {
  value: number;
  costBasis: number | null;
  isInterpolated: boolean;
  confidence: number;
}

/**
 * Calculate performance from portfolio snapshots
 */
export function calculateDiscretePerformance(
  input: DiscreteStrategyInput,
): PerformanceResult {
  const { snapshots, timeRange, categoryFilter } = input;

  const startTimestamp = getTimeRangeStartDate(timeRange);
  const endTimestamp = Date.now();

  // Sort snapshots by timestamp
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  // Extract values (either total or category-specific)
  const snapshotValues = sortedSnapshots.map((s) => ({
    timestamp: s.timestamp,
    value: categoryFilter
      ? (s.categoryBreakdown?.find((c) => c.category === categoryFilter)
          ?.value ?? 0)
      : s.totalAssets,
    costBasis: categoryFilter
      ? (s.categoryBreakdown?.find((c) => c.category === categoryFilter)
          ?.costBasis ?? null)
      : (s.totalCostBasis ?? null),
  }));

  // Find start and end values
  const startResult = findNearestValue(snapshotValues, startTimestamp);
  const endResult = findNearestValue(snapshotValues, endTimestamp);

  // Build data points for the range
  const dataPoints = buildDataPoints(
    snapshotValues,
    startTimestamp,
    endTimestamp,
    startResult,
    endResult,
  );

  // Calculate metrics
  const metrics = calculateMetrics(
    dataPoints,
    timeRange,
    startTimestamp,
    endTimestamp,
  );

  return {
    metrics,
    dataPoints,
    valueType: "discrete",
  };
}

/**
 * Find the nearest value to a target timestamp
 */
function findNearestValue(
  snapshots: Array<{
    timestamp: number;
    value: number;
    costBasis: number | null;
  }>,
  targetTimestamp: number,
): InterpolationResult | null {
  if (snapshots.length === 0) return null;

  // Check for exact match
  const exact = snapshots.find((s) => s.timestamp === targetTimestamp);
  if (exact) {
    return {
      value: exact.value,
      costBasis: exact.costBasis,
      isInterpolated: false,
      confidence: 1.0,
    };
  }

  // Find surrounding snapshots
  const before = snapshots.filter((s) => s.timestamp < targetTimestamp).pop();
  const after = snapshots.find((s) => s.timestamp > targetTimestamp);

  // Only before exists: use it (assume value holds until next snapshot)
  if (before && !after) {
    // Confidence decreases with time since last snapshot
    const timeSince = targetTimestamp - before.timestamp;
    const daysSince = timeSince / (24 * 60 * 60 * 1000);
    const confidence = Math.max(0.5, 1 - daysSince * 0.02); // -2% per day, min 50%

    return {
      value: before.value,
      costBasis: before.costBasis,
      isInterpolated: true,
      confidence,
    };
  }

  // Only after exists: use it
  if (!before && after) {
    return {
      value: after.value,
      costBasis: after.costBasis,
      isInterpolated: true,
      confidence: 0.7, // Lower confidence for future extrapolation
    };
  }

  // Both exist: interpolate (though for discrete values, step function is more accurate)
  if (before && after) {
    // Use step function: value stays at "before" until "after" snapshot
    // This is more accurate for bank balances which don't change gradually
    return {
      value: before.value,
      costBasis: before.costBasis,
      isInterpolated: true,
      confidence: 0.85, // Good confidence since we have surrounding data
    };
  }

  return null;
}

/**
 * Build data points for the time range
 */
function buildDataPoints(
  snapshots: Array<{
    timestamp: number;
    value: number;
    costBasis: number | null;
  }>,
  startTimestamp: number,
  endTimestamp: number,
  startResult: InterpolationResult | null,
  endResult: InterpolationResult | null,
): PerformanceDataPoint[] {
  const dataPoints: PerformanceDataPoint[] = [];

  // Add start point
  if (startResult) {
    dataPoints.push({
      timestamp: startTimestamp,
      date: new Date(startTimestamp).toISOString(),
      value: startResult.value,
      costBasis: startResult.costBasis,
      source: startResult.isInterpolated ? "interpolated" : "snapshot",
      confidence: startResult.confidence,
    });
  }

  // Add actual snapshots within range
  for (const snapshot of snapshots) {
    if (
      snapshot.timestamp > startTimestamp &&
      snapshot.timestamp < endTimestamp
    ) {
      dataPoints.push({
        timestamp: snapshot.timestamp,
        date: new Date(snapshot.timestamp).toISOString(),
        value: snapshot.value,
        costBasis: snapshot.costBasis,
        source: "snapshot",
        confidence: 1.0,
      });
    }
  }

  // Add end point
  if (endResult) {
    dataPoints.push({
      timestamp: endTimestamp,
      date: new Date(endTimestamp).toISOString(),
      value: endResult.value,
      costBasis: endResult.costBasis,
      source: endResult.isInterpolated ? "interpolated" : "snapshot",
      confidence: endResult.confidence,
    });
  }

  return dataPoints;
}

/**
 * Calculate performance metrics from data points
 */
function calculateMetrics(
  dataPoints: PerformanceDataPoint[],
  timeRange: TimeRange,
  startTimestamp: number,
  endTimestamp: number,
): PerformanceMetrics {
  if (dataPoints.length < 2) {
    return emptyMetrics(timeRange, startTimestamp, endTimestamp);
  }

  const startPoint = dataPoints[0];
  const endPoint = dataPoints[dataPoints.length - 1];

  const absoluteChange = endPoint.value - startPoint.value;
  const percentChange =
    startPoint.value > 0 ? (absoluteChange / startPoint.value) * 100 : 0;

  const values = dataPoints.map((dp) => dp.value);
  const highValue = Math.max(...values);
  const lowValue = Math.min(...values);

  const interpolatedCount = dataPoints.filter(
    (dp) => dp.source === "interpolated",
  ).length;

  // Determine data quality
  let dataQuality: DataQuality;
  if (interpolatedCount === 0) {
    dataQuality = "high";
  } else if (interpolatedCount < dataPoints.length / 2) {
    dataQuality = "medium";
  } else {
    dataQuality = "low";
  }

  return {
    startValue: startPoint.value,
    endValue: endPoint.value,
    absoluteChange,
    percentChange,
    highValue,
    lowValue,
    dataQuality,
    dataPointCount: dataPoints.length,
    interpolatedPointCount: interpolatedCount,
    timeRange,
    startTimestamp,
    endTimestamp,
    calculatedAt: Date.now(),
  };
}

/**
 * Create empty metrics for error cases
 */
function emptyMetrics(
  timeRange: TimeRange,
  startTimestamp: number,
  endTimestamp: number,
): PerformanceMetrics {
  return {
    startValue: 0,
    endValue: 0,
    absoluteChange: 0,
    percentChange: 0,
    highValue: 0,
    lowValue: 0,
    dataQuality: "low",
    dataPointCount: 0,
    interpolatedPointCount: 0,
    timeRange,
    startTimestamp,
    endTimestamp,
    calculatedAt: Date.now(),
  };
}
```

#### Task 3.2: Add Tests for Discrete Strategy

**File**: `frontend/lib/performance/strategies/__tests__/DiscreteStrategy.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { calculateDiscretePerformance } from "../DiscreteStrategy";
import { SnapshotData } from "../../types";

describe("DiscreteStrategy", () => {
  const mockSnapshots: SnapshotData[] = [
    {
      timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
      date: "2026-01-01",
      totalAssets: 100000,
      totalLiabilities: 0,
      netWorth: 100000,
    },
    {
      timestamp: Date.now() - 20 * 24 * 60 * 60 * 1000,
      date: "2026-01-11",
      totalAssets: 105000,
      totalLiabilities: 0,
      netWorth: 105000,
    },
    {
      timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000,
      date: "2026-01-21",
      totalAssets: 103000,
      totalLiabilities: 0,
      netWorth: 103000,
    },
    {
      timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
      date: "2026-01-31",
      totalAssets: 110000,
      totalLiabilities: 0,
      netWorth: 110000,
    },
  ];

  it("calculates performance for 1 month range", () => {
    const result = calculateDiscretePerformance({
      snapshots: mockSnapshots,
      timeRange: "Month",
    });

    expect(result.metrics.endValue).toBeGreaterThan(result.metrics.startValue);
    expect(result.metrics.percentChange).toBeGreaterThan(0);
    expect(result.valueType).toBe("discrete");
  });

  it("reports data quality based on interpolation", () => {
    const result = calculateDiscretePerformance({
      snapshots: mockSnapshots,
      timeRange: "Month",
    });

    expect(result.metrics.dataQuality).toBeDefined();
    expect(["high", "medium", "low"]).toContain(result.metrics.dataQuality);
  });

  it("handles empty snapshots", () => {
    const result = calculateDiscretePerformance({
      snapshots: [],
      timeRange: "Month",
    });

    expect(result.metrics.dataPointCount).toBe(0);
    expect(result.metrics.dataQuality).toBe("low");
  });
});
```

---

### Phase 4: Continuous Strategy Implementation

**Goal**: Implement price-based performance calculation for continuous value assets (precious metals).

#### Task 4.1: Create Continuous Strategy

**File**: `frontend/lib/performance/strategies/ContinuousStrategy.ts`

```typescript
/**
 * Continuous Strategy - Price-based Performance Calculation
 *
 * For assets where we can calculate precise values at any point in time
 * using historical prices and inventory (precious metals).
 */

import {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceResult,
  DataQuality,
  TimeRange,
} from "../types";
import {
  getTimeRangeStartDate,
  getDefaultIntervalForRange,
} from "@/../services/finance/financeService";

/**
 * Holding data representing an owned item
 */
export interface HoldingData {
  id: string;
  assetType: string; // "gold", "silver", "platinum", "palladium"
  quantity: number;
  fineWeightGrams: number;
  sellPremium: number;
  purchaseDate: number; // Timestamp when acquired
  purchasePricePerUnit?: number;
}

/**
 * Historical price point
 */
export interface PricePoint {
  timestamp: number;
  price: number;
}

/**
 * Price data for multiple assets
 */
export interface PriceData {
  [assetType: string]: PricePoint[];
}

export interface ContinuousStrategyInput {
  holdings: HoldingData[];
  priceData: PriceData;
  timeRange: TimeRange;
  /** Function to calculate item value given spot price */
  calculateValue: (holding: HoldingData, spotPrice: number) => number;
}

/**
 * Calculate performance using historical prices
 */
export function calculateContinuousPerformance(
  input: ContinuousStrategyInput,
): PerformanceResult {
  const { holdings, priceData, timeRange, calculateValue } = input;

  const startTimestamp = getTimeRangeStartDate(timeRange);
  const endTimestamp = Date.now();

  // Collect all unique timestamps from price data
  const allTimestamps = new Set<number>();
  for (const prices of Object.values(priceData)) {
    for (const pp of prices) {
      if (pp.timestamp >= startTimestamp && pp.timestamp <= endTimestamp) {
        allTimestamps.add(pp.timestamp);
      }
    }
  }

  // Sort timestamps
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

  // Build price lookup
  const priceLookup = buildPriceLookup(priceData, sortedTimestamps);

  // Calculate portfolio value at each timestamp
  const dataPoints = calculateDataPoints(
    holdings,
    sortedTimestamps,
    priceLookup,
    calculateValue,
  );

  // Calculate metrics
  const metrics = calculateMetrics(
    dataPoints,
    timeRange,
    startTimestamp,
    endTimestamp,
  );

  return {
    metrics,
    dataPoints,
    valueType: "continuous",
  };
}

/**
 * Build a price lookup map with forward-filling for missing prices
 */
function buildPriceLookup(
  priceData: PriceData,
  timestamps: number[],
): Map<number, Record<string, number>> {
  const lookup = new Map<number, Record<string, number>>();
  const lastKnownPrices: Record<string, number> = {};

  // Initialize with all asset types
  const assetTypes = Object.keys(priceData);

  for (const ts of timestamps) {
    const pricesAtTime: Record<string, number> = {};

    for (const assetType of assetTypes) {
      // Find price at this timestamp
      const assetPrices = priceData[assetType];
      const pricePoint = assetPrices.find((pp) => pp.timestamp === ts);

      if (pricePoint) {
        pricesAtTime[assetType] = pricePoint.price;
        lastKnownPrices[assetType] = pricePoint.price;
      } else if (lastKnownPrices[assetType] !== undefined) {
        // Forward-fill
        pricesAtTime[assetType] = lastKnownPrices[assetType];
      }
    }

    lookup.set(ts, pricesAtTime);
  }

  return lookup;
}

/**
 * Calculate portfolio value at each timestamp
 */
function calculateDataPoints(
  holdings: HoldingData[],
  timestamps: number[],
  priceLookup: Map<number, Record<string, number>>,
  calculateValue: (holding: HoldingData, price: number) => number,
): PerformanceDataPoint[] {
  const dataPoints: PerformanceDataPoint[] = [];

  for (const ts of timestamps) {
    const prices = priceLookup.get(ts);
    if (!prices) continue;

    let totalValue = 0;
    let totalCost = 0;

    for (const holding of holdings) {
      // Skip if holding didn't exist at this time
      if (holding.purchaseDate > ts) continue;

      const price = prices[holding.assetType];
      if (price === undefined) continue;

      totalValue += calculateValue(holding, price);

      if (holding.purchasePricePerUnit) {
        totalCost += holding.purchasePricePerUnit * holding.quantity;
      }
    }

    if (totalValue > 0) {
      dataPoints.push({
        timestamp: ts,
        date: new Date(ts).toISOString(),
        value: totalValue,
        costBasis: totalCost > 0 ? totalCost : null,
        source: "calculated",
        confidence: 1.0,
      });
    }
  }

  return dataPoints;
}

/**
 * Calculate performance metrics
 */
function calculateMetrics(
  dataPoints: PerformanceDataPoint[],
  timeRange: TimeRange,
  startTimestamp: number,
  endTimestamp: number,
): PerformanceMetrics {
  if (dataPoints.length < 2) {
    return emptyMetrics(timeRange, startTimestamp, endTimestamp);
  }

  const startPoint = dataPoints[0];
  const endPoint = dataPoints[dataPoints.length - 1];

  const absoluteChange = endPoint.value - startPoint.value;
  const percentChange =
    startPoint.value > 0 ? (absoluteChange / startPoint.value) * 100 : 0;

  const values = dataPoints.map((dp) => dp.value);
  const highValue = Math.max(...values);
  const lowValue = Math.min(...values);

  // Calculate volatility (standard deviation of returns)
  const volatility = calculateVolatility(dataPoints);

  return {
    startValue: startPoint.value,
    endValue: endPoint.value,
    absoluteChange,
    percentChange,
    highValue,
    lowValue,
    dataQuality: "high", // Continuous data is always high quality
    dataPointCount: dataPoints.length,
    interpolatedPointCount: 0,
    timeRange,
    startTimestamp,
    endTimestamp,
    calculatedAt: Date.now(),
    volatility,
  };
}

/**
 * Calculate annualized volatility
 */
function calculateVolatility(dataPoints: PerformanceDataPoint[]): number {
  if (dataPoints.length < 3) return 0;

  const returns: number[] = [];
  for (let i = 1; i < dataPoints.length; i++) {
    const prevValue = dataPoints[i - 1].value;
    const currValue = dataPoints[i].value;
    if (prevValue > 0) {
      returns.push((currValue - prevValue) / prevValue);
    }
  }

  if (returns.length === 0) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;

  // Annualize (assuming daily data points, 252 trading days)
  return Math.sqrt(variance) * Math.sqrt(252);
}

function emptyMetrics(
  timeRange: TimeRange,
  startTimestamp: number,
  endTimestamp: number,
): PerformanceMetrics {
  return {
    startValue: 0,
    endValue: 0,
    absoluteChange: 0,
    percentChange: 0,
    highValue: 0,
    lowValue: 0,
    dataQuality: "low",
    dataPointCount: 0,
    interpolatedPointCount: 0,
    timeRange,
    startTimestamp,
    endTimestamp,
    calculatedAt: Date.now(),
  };
}
```

---

### Phase 5: Hybrid Strategy & Strategy Index

**Goal**: Combine discrete and continuous strategies for mixed portfolios.

#### Task 5.1: Create Hybrid Strategy

**File**: `frontend/lib/performance/strategies/HybridStrategy.ts`

```typescript
/**
 * Hybrid Strategy - Combined Performance Calculation
 *
 * Combines discrete and continuous strategies for portfolios with mixed assets.
 * Merges timelines and reports overall data quality.
 */

import {
  PerformanceDataPoint,
  PerformanceMetrics,
  PerformanceResult,
  DataQuality,
  TimeRange,
} from "../types";

export interface CategoryPerformance {
  categoryId: string;
  categoryName: string;
  result: PerformanceResult;
  currentWeight: number; // Current percentage of total portfolio
}

export interface HybridStrategyInput {
  discreteResults: CategoryPerformance[];
  continuousResults: CategoryPerformance[];
  timeRange: TimeRange;
}

export interface HybridPerformanceResult extends PerformanceResult {
  categoryBreakdown: CategoryPerformance[];
  discreteWeight: number;
  continuousWeight: number;
}

/**
 * Combine discrete and continuous performance results
 */
export function calculateHybridPerformance(
  input: HybridStrategyInput,
): HybridPerformanceResult {
  const { discreteResults, continuousResults, timeRange } = input;

  const allCategories = [...discreteResults, ...continuousResults];

  // Merge data points from all categories
  const mergedDataPoints = mergeDataPoints(discreteResults, continuousResults);

  // Calculate portfolio weights
  const totalCurrentValue = allCategories.reduce(
    (sum, cat) => sum + cat.result.metrics.endValue,
    0,
  );

  const discreteValue = discreteResults.reduce(
    (sum, cat) => sum + cat.result.metrics.endValue,
    0,
  );

  const continuousValue = continuousResults.reduce(
    (sum, cat) => sum + cat.result.metrics.endValue,
    0,
  );

  const discreteWeight =
    totalCurrentValue > 0 ? discreteValue / totalCurrentValue : 0;
  const continuousWeight =
    totalCurrentValue > 0 ? continuousValue / totalCurrentValue : 0;

  // Calculate combined metrics
  const metrics = calculateCombinedMetrics(
    mergedDataPoints,
    allCategories,
    timeRange,
    discreteWeight,
    continuousWeight,
  );

  return {
    metrics,
    dataPoints: mergedDataPoints,
    valueType: discreteWeight > 0.5 ? "discrete" : "continuous",
    categoryBreakdown: allCategories,
    discreteWeight,
    continuousWeight,
  };
}

/**
 * Merge data points from all categories
 */
function mergeDataPoints(
  discreteResults: CategoryPerformance[],
  continuousResults: CategoryPerformance[],
): PerformanceDataPoint[] {
  // Collect all timestamps
  const timestampMap = new Map<
    number,
    {
      discreteValue: number;
      continuousValue: number;
      discreteCost: number;
      continuousCost: number;
      discreteConfidence: number;
      continuousConfidence: number;
    }
  >();

  // Process discrete data points
  for (const cat of discreteResults) {
    for (const dp of cat.result.dataPoints) {
      const existing = timestampMap.get(dp.timestamp) || {
        discreteValue: 0,
        continuousValue: 0,
        discreteCost: 0,
        continuousCost: 0,
        discreteConfidence: 0,
        continuousConfidence: 0,
      };
      existing.discreteValue += dp.value;
      existing.discreteCost += dp.costBasis ?? 0;
      existing.discreteConfidence = Math.max(
        existing.discreteConfidence,
        dp.confidence,
      );
      timestampMap.set(dp.timestamp, existing);
    }
  }

  // Process continuous data points
  for (const cat of continuousResults) {
    for (const dp of cat.result.dataPoints) {
      const existing = timestampMap.get(dp.timestamp) || {
        discreteValue: 0,
        continuousValue: 0,
        discreteCost: 0,
        continuousCost: 0,
        discreteConfidence: 0,
        continuousConfidence: 0,
      };
      existing.continuousValue += dp.value;
      existing.continuousCost += dp.costBasis ?? 0;
      existing.continuousConfidence = Math.max(
        existing.continuousConfidence,
        dp.confidence,
      );
      timestampMap.set(dp.timestamp, existing);
    }
  }

  // Build merged data points with forward-filled discrete values
  const sortedTimestamps = Array.from(timestampMap.keys()).sort(
    (a, b) => a - b,
  );
  let lastDiscreteValue = 0;
  let lastDiscreteCost = 0;

  const mergedDataPoints: PerformanceDataPoint[] = [];

  for (const ts of sortedTimestamps) {
    const data = timestampMap.get(ts)!;

    // Forward-fill discrete value
    const discreteValue =
      data.discreteValue > 0 ? data.discreteValue : lastDiscreteValue;
    const discreteCost =
      data.discreteCost > 0 ? data.discreteCost : lastDiscreteCost;

    if (data.discreteValue > 0) {
      lastDiscreteValue = data.discreteValue;
      lastDiscreteCost = data.discreteCost;
    }

    const totalValue = discreteValue + data.continuousValue;
    const totalCost = discreteCost + data.continuousCost;

    // Weighted confidence
    const discreteWeight = totalValue > 0 ? discreteValue / totalValue : 0;
    const continuousWeight =
      totalValue > 0 ? data.continuousValue / totalValue : 0;
    const confidence =
      discreteWeight * data.discreteConfidence +
        continuousWeight * data.continuousConfidence || 0.5;

    mergedDataPoints.push({
      timestamp: ts,
      date: new Date(ts).toISOString(),
      value: totalValue,
      costBasis: totalCost > 0 ? totalCost : null,
      source: data.continuousValue > 0 ? "calculated" : "snapshot",
      confidence,
    });
  }

  return mergedDataPoints;
}

/**
 * Calculate combined metrics
 */
function calculateCombinedMetrics(
  dataPoints: PerformanceDataPoint[],
  categories: CategoryPerformance[],
  timeRange: TimeRange,
  discreteWeight: number,
  continuousWeight: number,
): PerformanceMetrics {
  if (dataPoints.length < 2) {
    return emptyMetrics(timeRange);
  }

  const startPoint = dataPoints[0];
  const endPoint = dataPoints[dataPoints.length - 1];

  const absoluteChange = endPoint.value - startPoint.value;
  const percentChange =
    startPoint.value > 0 ? (absoluteChange / startPoint.value) * 100 : 0;

  const values = dataPoints.map((dp) => dp.value);
  const highValue = Math.max(...values);
  const lowValue = Math.min(...values);

  const interpolatedCount = dataPoints.filter(
    (dp) => dp.source === "interpolated",
  ).length;

  // Data quality based on portfolio composition and interpolation
  let dataQuality: DataQuality;
  if (continuousWeight > 0.7) {
    dataQuality = "high";
  } else if (
    continuousWeight > 0.3 ||
    interpolatedCount < dataPoints.length / 4
  ) {
    dataQuality = "medium";
  } else {
    dataQuality = "low";
  }

  return {
    startValue: startPoint.value,
    endValue: endPoint.value,
    absoluteChange,
    percentChange,
    highValue,
    lowValue,
    dataQuality,
    dataPointCount: dataPoints.length,
    interpolatedPointCount: interpolatedCount,
    timeRange,
    startTimestamp: startPoint.timestamp,
    endTimestamp: endPoint.timestamp,
    calculatedAt: Date.now(),
  };
}

function emptyMetrics(timeRange: TimeRange): PerformanceMetrics {
  return {
    startValue: 0,
    endValue: 0,
    absoluteChange: 0,
    percentChange: 0,
    highValue: 0,
    lowValue: 0,
    dataQuality: "low",
    dataPointCount: 0,
    interpolatedPointCount: 0,
    timeRange,
    startTimestamp: Date.now(),
    endTimestamp: Date.now(),
    calculatedAt: Date.now(),
  };
}
```

#### Task 5.2: Create Strategies Index

**File**: `frontend/lib/performance/strategies/index.ts`

```typescript
export {
  calculateDiscretePerformance,
  type DiscreteStrategyInput,
} from "./DiscreteStrategy";
export {
  calculateContinuousPerformance,
  type ContinuousStrategyInput,
  type HoldingData,
  type PriceData,
} from "./ContinuousStrategy";
export {
  calculateHybridPerformance,
  type HybridStrategyInput,
  type HybridPerformanceResult,
  type CategoryPerformance,
} from "./HybridStrategy";
```

#### Task 5.3: Update Main Index

**File**: `frontend/lib/performance/index.ts`

```typescript
/**
 * Performance Calculation Service
 *
 * Unified performance calculations for all asset categories.
 * Handles both discrete (snapshot-based) and continuous (price-based) assets.
 */

// Types
export * from "./types";

// Configuration
export * from "./config";

// Strategies
export * from "./strategies";
```

---

### Phase 6: React Hooks

**Goal**: Create React hooks for easy consumption of the performance service.

#### Task 6.1: Create Main Performance Hook

**File**: `frontend/hooks/performance/usePerformance.ts`

```typescript
/**
 * usePerformance Hook
 *
 * Main hook for unified performance calculations.
 * Automatically determines strategy based on category configuration.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  TimeRange,
  PerformanceTimeRangeLabel,
  TIME_RANGE_LABEL_MAP,
  PerformanceResult,
  SnapshotData,
} from "@/lib/performance/types";
import { ASSET_CATEGORIES, getCategoryConfig } from "@/lib/performance/config";
import { calculateDiscretePerformance } from "@/lib/performance/strategies/DiscreteStrategy";

export interface UsePerformanceOptions {
  timeRange: PerformanceTimeRangeLabel;
  categoryId?: string; // Optional: filter to specific category
}

export interface UsePerformanceResult {
  result: PerformanceResult | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to calculate performance for discrete assets (snapshot-based)
 */
export function useDiscretePerformance(
  options: UsePerformanceOptions,
): UsePerformanceResult {
  const { timeRange: timeRangeLabel, categoryId } = options;

  // Map UI label to TimeRange
  const timeRange = TIME_RANGE_LABEL_MAP[timeRangeLabel];

  // Fetch portfolio snapshots
  const snapshots = useQuery(api.portfolioSnapshots.getSnapshots, {
    limit: 1000,
  });

  const isLoading = snapshots === undefined;

  const result = useMemo(() => {
    if (!snapshots) return null;

    // Convert Convex snapshots to our SnapshotData format
    const formattedSnapshots: SnapshotData[] = snapshots.map((s) => ({
      timestamp: s.timestamp,
      date: s.date,
      totalAssets: s.totalAssets,
      totalLiabilities: s.totalLiabilities,
      netWorth: s.netWorth,
      totalCostBasis: s.totalCostBasis,
      categoryBreakdown: s.categoryBreakdown,
    }));

    // Get category config if filtering
    const categoryConfig = categoryId
      ? getCategoryConfig(categoryId)
      : undefined;

    return calculateDiscretePerformance({
      snapshots: formattedSnapshots,
      timeRange,
      categoryFilter: categoryConfig?.snapshotCategory,
    });
  }, [snapshots, timeRange, categoryId]);

  return {
    result,
    isLoading,
    error: null,
  };
}

// TODO: Add useContinuousPerformance for metals
// TODO: Add useHybridPerformance for combined portfolios
```

#### Task 6.2: Create Time Range Hook

**File**: `frontend/hooks/performance/useTimeRange.ts`

```typescript
/**
 * useTimeRange Hook
 *
 * Manages time range selection with value type awareness.
 */

import { useState, useCallback, useMemo } from "react";
import { PerformanceTimeRangeLabel, ValueType } from "@/lib/performance/types";
import {
  TIME_RANGE_DISPLAY,
  TimeRangeDisplayConfig,
  getAvailableTimeRanges,
} from "@/lib/performance/config";

export interface UseTimeRangeResult {
  timeRange: PerformanceTimeRangeLabel;
  setTimeRange: (range: PerformanceTimeRangeLabel) => void;
  availableRanges: TimeRangeDisplayConfig[];
  isRangeAvailable: (range: PerformanceTimeRangeLabel) => boolean;
}

export function useTimeRange(
  defaultRange: PerformanceTimeRangeLabel = "3M",
  valueType: ValueType | "hybrid" = "hybrid",
): UseTimeRangeResult {
  const [timeRange, setTimeRangeInternal] =
    useState<PerformanceTimeRangeLabel>(defaultRange);

  const availableRanges = useMemo(
    () => getAvailableTimeRanges(valueType),
    [valueType],
  );

  const isRangeAvailable = useCallback(
    (range: PerformanceTimeRangeLabel) => {
      return availableRanges.some((r) => r.label === range);
    },
    [availableRanges],
  );

  const setTimeRange = useCallback(
    (range: PerformanceTimeRangeLabel) => {
      if (isRangeAvailable(range)) {
        setTimeRangeInternal(range);
      }
    },
    [isRangeAvailable],
  );

  return {
    timeRange,
    setTimeRange,
    availableRanges,
    isRangeAvailable,
  };
}
```

#### Task 6.3: Create Hooks Index

**File**: `frontend/hooks/performance/index.ts`

```typescript
export {
  useDiscretePerformance,
  type UsePerformanceOptions,
  type UsePerformanceResult,
} from "./usePerformance";
export { useTimeRange, type UseTimeRangeResult } from "./useTimeRange";
```

---

### Phase 7: Component Migration

**Goal**: Migrate existing components to use the new performance service.

#### Task 7.1: Create TimeRangeSelector Component

**File**: `frontend/components/atomic/molecules/performance/TimeRangeSelector.tsx`

```typescript
"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { useTimeRange } from "@/hooks/performance";
import { PerformanceTimeRangeLabel, ValueType } from "@/lib/performance/types";

interface TimeRangeSelectorProps {
  value: PerformanceTimeRangeLabel;
  onChange: (range: PerformanceTimeRangeLabel) => void;
  valueType?: ValueType | "hybrid";
  className?: string;
}

export function TimeRangeSelector({
  value,
  onChange,
  valueType = "hybrid",
  className,
}: TimeRangeSelectorProps) {
  const { availableRanges, isRangeAvailable } = useTimeRange(value, valueType);

  return (
    <div className={cn("flex gap-1", className)}>
      {availableRanges.map((range) => (
        <Button
          key={range.label}
          variant={value === range.label ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onChange(range.label)}
          disabled={!isRangeAvailable(range.label)}
          className="px-2 h-7 text-xs"
        >
          {range.shortName}
        </Button>
      ))}
    </div>
  );
}
```

#### Task 7.2: Update CategoryPerformanceChart

Modify `frontend/components/atomic/molecules/investments/CategoryPerformanceChart.tsx` to use the new time range system while maintaining backward compatibility.

#### Task 7.3: Update PortfolioChart (Metals)

Modify `frontend/components/atomic/molecules/metals/PortfolioChart.tsx` to use the unified types.

#### Task 7.4: Update usePortfolioOverview

Add deprecation notice and gradually migrate to new hooks.

---

### Phase 8: Integration & Migration ✅

**Goal**: Create bridge hooks for backward compatibility and update documentation.

#### Task 8.1: Create Bridge Hooks ✅

Created backward-compatible hooks that use the new service internally:

**File**: `frontend/hooks/performance/usePortfolioYTD.ts`

```typescript
// Bridge hook for portfolio YTD (replaces calculateYTDPerformance)
export function usePortfolioYTD(): PortfolioYTDResult;
export function useCategoryYTD(category: string): PortfolioYTDResult;
```

**File**: `frontend/hooks/performance/useMetalsYTD.ts`

```typescript
// Bridge hook for metals YTD (replaces useYTDPortfolioPerformance)
export function useMetalsYTD(currency?: MetalsCurrency): MetalsYTDResult;
export function useMetalsPerformance(
  timeRange: TimeRange,
  currency?: MetalsCurrency,
);
```

#### Task 8.2: Create PerformanceChart Component ✅

Created unified chart component using the new time range system:

**File**: `frontend/components/atomic/molecules/performance/PerformanceChart.tsx`

- Uses unified `TimeRange` type
- Supports all time ranges (1H, 1D, 1W, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, ALL)
- Color-codes based on positive/negative performance
- Supports portfolio/networth view toggle

#### Task 8.3: Add Deprecation Notices ✅

Added `@deprecated` JSDoc tags to:

- `frontend/lib/types/investments.ts` → `calculateYTDPerformance()`
- `frontend/hooks/metals.ts` → `useYTDPortfolioPerformance()`

#### Task 8.4: Update Documentation ✅

Updated this document with implementation status and quick start guide.

---

## Summary: Task Checklist

### Phase 1: Extend Finance Service ✅

- [x] 1.1 Add new TimeRange values (3Month, 6Month, 3Year, 5Year)
- [x] 1.2 Add MS constants for new ranges
- [x] 1.3 Update `getTimeRangeInMilliseconds()`
- [x] 1.4 Add `getTimeRangeStartTimestamp()` helper
- [x] 1.5 Add `getDefaultIntervalForRange()` helper
- [x] 1.6 Export all constants

### Phase 2: Core Types & Config ✅

- [x] 2.1 Create directory structure
- [x] 2.2 Create `lib/performance/types.ts`
- [x] 2.3 Create `lib/performance/config.ts`
- [x] 2.4 Create `lib/performance/index.ts`

### Phase 3: Strategy Interface ✅

- [x] 3.1 Create `IPerformanceStrategy` interface
- [x] 3.2 Create `BasePerformanceStrategy` abstract class

### Phase 4: Discrete Strategy ✅

- [x] 4.1 Create `DiscretePerformanceStrategy.ts`
- [x] 4.2 Add tests for discrete strategy (21 tests)

### Phase 5: Continuous Strategy ✅

- [x] 5.1 Create `ContinuousPerformanceStrategy.ts`
- [x] 5.2 Add tests for continuous strategy (20 tests)

### Phase 6: Hybrid Strategy ✅

- [x] 6.1 Create `HybridPerformanceStrategy.ts`
- [x] 6.2 Create strategies index
- [x] 6.3 Update main index

### Phase 7: React Hooks ✅

- [x] 7.1 Create `usePerformance.ts`
- [x] 7.2 Create `useDiscretePerformance.ts`
- [x] 7.3 Create `useContinuousPerformance.ts`
- [x] 7.4 Create `useTimeRangeSelection.ts`
- [x] 7.5 Create hooks index

### Phase 8: Integration & Migration ✅

- [x] 8.1 Create bridge hooks (`usePortfolioYTD`, `useMetalsYTD`)
- [x] 8.2 Create `PerformanceChart` component
- [x] 8.3 Add deprecation notices to old functions
- [x] 8.4 Update documentation

---

## Remaining Work (Optional Enhancements)

The core implementation is complete. The following are optional enhancements:

### Component Migration (Low Priority)

- [ ] Update `CategoryPerformanceChart` to use new types internally
- [ ] Update `PortfolioChart` (metals) to use unified types
- [ ] Update `usePortfolioOverview` to use new hooks internally

### Testing ✅ Complete

- [x] Add unit tests for DiscretePerformanceStrategy (21 tests)
- [x] Add unit tests for ContinuousPerformanceStrategy (20 tests)
- [x] Add unit tests for HybridPerformanceStrategy (20 tests)
- [ ] Add integration tests for React hooks (optional)

Tests are located in `services/performance/` and can be run with:

```bash
cd services && bun run test
```

### Advanced Features (Future)

- [ ] Implement TWRR (Time-Weighted Rate of Return)
- [ ] Implement MWRR (Money-Weighted Rate of Return)
- [ ] Add volatility/Sharpe ratio calculations
- [ ] Upgrade crypto/stocks to continuous when APIs support historical prices

---

## Migration Strategy

### Backward Compatibility

During migration, we'll maintain backward compatibility by:

1. **Keeping existing hooks** until all consumers are migrated
2. **Creating adapter functions** that convert new types to old types
3. **Feature flags** to gradually roll out new calculations

### Deprecation Plan

```typescript
// hooks/convex/portfolio.ts

/**
 * @deprecated Use usePerformance() from hooks/performance instead
 * This hook will be removed in v2.0
 */
export function usePortfolioOverview(...) {
  console.warn("usePortfolioOverview is deprecated. Use usePerformance instead.");
  // ... existing implementation
}
```

### Data Quality Communication

The new service will clearly communicate data quality to users:

```typescript
// Component example
function PerformanceDisplay({ performance }: Props) {
  return (
    <>
      <PerformanceChart data={performance.dataPoints} />

      {performance.metrics.dataQuality === "low" && (
        <Alert variant="warning">
          Performance calculation is based on limited data.
          Values between sync points are estimated.
        </Alert>
      )}

      {performance.metrics.interpolatedPoints > 0 && (
        <Tooltip content={`${performance.metrics.interpolatedPoints} data points were interpolated`}>
          <InfoIcon />
        </Tooltip>
      )}
    </>
  );
}
```

---

## Summary

This design document proposes a **unified performance calculation service** that:

1. **Consolidates** all time range definitions and performance calculations
2. **Separates** discrete (snapshot-based) and continuous (price-based) calculations
3. **Provides** a clean strategy pattern for different asset types
4. **Reports** data quality so users understand calculation accuracy
5. **Enables** future enhancements like TWRR, MWRR, and Sharpe Ratio
6. **Maintains** backward compatibility during migration

The key insight is that **bank balances and gold items fundamentally differ** in how we can calculate historical values:

- Bank balances: we only know them at sync times
- Gold items: we can calculate precise value at any time using historical prices

By acknowledging this difference and using appropriate strategies, we can provide accurate performance metrics while being transparent about data quality.
