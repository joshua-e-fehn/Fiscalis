# Fiscalis Services

<div align="center">

**Shared calculation services and utilities for the Fiscalis platform.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?style=flat-square&logo=bun)](https://bun.sh/)
[![Vitest](https://img.shields.io/badge/Vitest-Testing-6E9F18?style=flat-square&logo=vitest)](https://vitest.dev/)

</div>

---

## Overview

This package contains shared calculation services that are used across the Fiscalis platform. These services are framework-agnostic and can be imported into the frontend, backend, or any other TypeScript/JavaScript project.

---

## Modules

### Finance Service (`finance/`)

Core financial calculations for time-series analysis, interest calculations, and loan amortization.

#### Time Constants & Utilities

```typescript
import {
  MS_PER_DAY,
  MS_PER_WEEK,
  MS_PER_MONTH,
  MS_PER_YEAR,
  MS,
  getTimeRangeInMilliseconds,
  getTimeRangeStartTimestamp,
  getDefaultIntervalForRange,
} from "@fiscalis/services/finance";

// Time range types
type TimeRange =
  | "Hour"
  | "Day"
  | "Week"
  | "Month"
  | "3Month"
  | "6Month"
  | "Year"
  | "3Year"
  | "5Year"
  | "YTD"
  | "ALL";

// Get milliseconds for a time range
const msInWeek = getTimeRangeInMilliseconds("Week"); // 604800000

// Get start timestamp for charting
const startTs = getTimeRangeStartTimestamp("YTD"); // Start of current year
```

#### Interest Calculations

```typescript
import {
  calculateAverageCompoundInterest,
  calculateAverageInterest,
  calculateEndCapitalValueWithCompoundInterest,
  calculateEndCapitalValueWithInterest,
  calculateStartCapitalValueWithCompoundInterest,
  calculateCapitalGainDurationWithCompoundInterest,
} from "@fiscalis/services/finance";

// Calculate compound interest rate between two points in time
const rate = calculateAverageCompoundInterest(
  { time: new Date("2024-01-01"), capitalValue: 10000 },
  { time: new Date("2025-01-01"), capitalValue: 10500 },
  "year",
);
// Returns ~0.05 (5% annual return)

// Project future value with compound interest
const futureValue = calculateEndCapitalValueWithCompoundInterest(
  10000, // start capital
  0.07, // 7% annual rate
  10, // 10 years
);
// Returns ~19,671.51
```

#### Loan Calculator

The loan calculator supports multiple loan types with full amortization schedules:

```typescript
import {
  calculateLoan,
  LoanInput,
  LoanType,
  AmortizationSchedule,
} from "@fiscalis/services/finance";

// Supported loan types
type LoanType =
  | "ANNUITY" // Constant payment (most common)
  | "CONSTANT_PRINCIPAL" // Decreasing payments (Tilgungsdarlehen)
  | "BULLET" // Interest-only with principal at end
  | "INTEREST_ONLY_THEN"; // Grace period then amortization

// Example: Calculate a mortgage
const loanInput: LoanInput = {
  loanType: "ANNUITY",
  principal: 300000, // €300,000
  annualInterestRate: 0.035, // 3.5%
  termPeriods: 360, // 30 years (monthly)
  paymentInterval: "month",
  startDate: new Date("2024-01-01"),
  // Optional: prepayments
  prepayments: [{ date: new Date("2025-06-01"), amount: 10000 }],
  recurringPrepayments: {
    amount: 200,
    interval: "month",
    startDate: new Date("2024-02-01"),
  },
};

const schedule: AmortizationSchedule = calculateLoan(loanInput);
// Returns: { rows: AmortizationRow[], summary: LoanSummary }
```

**AmortizationRow Structure:**

```typescript
interface AmortizationRow {
  periodIndex: number;
  periodStart: Date;
  periodEnd: Date;
  paymentDate: Date;
  openingBalance: number;
  interestAmount: number;
  principalAmount: number;
  prepaymentAmount: number;
  totalPayment: number;
  closingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}
```

---

### Performance Service (`performance/`)

Portfolio performance calculation strategies using different methodologies.

#### Calculation Strategies

| Strategy       | File                         | Use Case                   |
| -------------- | ---------------------------- | -------------------------- |
| **Discrete**   | `discreteStrategy.test.ts`   | Point-in-time calculations |
| **Continuous** | `continuousStrategy.test.ts` | Time-weighted returns      |
| **Hybrid**     | `hybridStrategy.test.ts`     | Combined approach          |

These strategies implement different methods for calculating:

- Time-Weighted Return (TWR)
- Money-Weighted Return (MWR / IRR)
- Modified Dietz Method
- Daily/Period Returns

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0+

### Installation

```bash
# Install dependencies
bun install
```

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test finance/financeService.test.ts

# Run with coverage
bun test --coverage
```

### Running Individual Services

```bash
# Run the finance service directly
bun run financeService
```

---

## Project Structure

```
services/
├── finance/
│   ├── financeService.ts        # Main finance calculations
│   └── financeService.test.ts   # Finance service tests
│
├── performance/
│   ├── continuousStrategy.test.ts  # Continuous TWR tests
│   ├── discreteStrategy.test.ts    # Discrete calculation tests
│   └── hybridStrategy.test.ts      # Hybrid approach tests
│
├── package.json                 # Package configuration
├── tsconfig.json               # TypeScript configuration
└── vitest.config.ts            # Vitest test configuration
```

---

## Available Scripts

| Command                  | Description                  |
| ------------------------ | ---------------------------- |
| `bun test`               | Run all tests with Vitest    |
| `bun run financeService` | Run finance service directly |

---

## API Reference

### Time Constants

| Constant        | Value          | Description                 |
| --------------- | -------------- | --------------------------- |
| `MS_PER_SECOND` | 1,000          | Milliseconds per second     |
| `MS_PER_MINUTE` | 60,000         | Milliseconds per minute     |
| `MS_PER_HOUR`   | 3,600,000      | Milliseconds per hour       |
| `MS_PER_DAY`    | 86,400,000     | Milliseconds per day        |
| `MS_PER_WEEK`   | 604,800,000    | Milliseconds per week       |
| `MS_PER_MONTH`  | 2,592,000,000  | ~30 days in milliseconds    |
| `MS_PER_YEAR`   | 31,557,600,000 | 365.25 days in milliseconds |

### Time Range Functions

| Function                        | Parameters     | Returns            |
| ------------------------------- | -------------- | ------------------ |
| `getTimeRangeInMilliseconds`    | `TimeRange`    | `number` (ms)      |
| `getTimeRangeStartTimestamp`    | `TimeRange`    | `number` (Unix ms) |
| `getDefaultIntervalForRange`    | `TimeRange`    | `TimeInterval`     |
| `getTimeIntervalInMilliseconds` | `TimeInterval` | `number` (ms)      |

### Interest Functions

| Function                                           | Description                         |
| -------------------------------------------------- | ----------------------------------- |
| `calculateAverageCompoundInterest`                 | Compound annual growth rate (CAGR)  |
| `calculateAverageInterest`                         | Simple average interest rate        |
| `calculateEndCapitalValueWithCompoundInterest`     | Future value with compound interest |
| `calculateEndCapitalValueWithInterest`             | Future value with simple interest   |
| `calculateStartCapitalValueWithCompoundInterest`   | Present value (discounting)         |
| `calculateCapitalGainDurationWithCompoundInterest` | Time to reach target value          |

### Loan Functions

| Function                       | Description                         |
| ------------------------------ | ----------------------------------- |
| `calculateLoan`                | Generate full amortization schedule |
| `calculateAnnuityPayment`      | Calculate constant payment amount   |
| `calculateInterestOnlyPayment` | Calculate interest-only payment     |

---

## Usage in Frontend

The services can be imported directly in the frontend:

```typescript
// frontend/lib/utils/calculations.ts
import {
  getTimeRangeStartTimestamp,
  calculateAverageCompoundInterest,
} from "../../services/finance/financeService";

// Use in hooks or components
export function usePortfolioPerformance(timeRange: TimeRange) {
  const startTs = getTimeRangeStartTimestamp(timeRange);
  // ... fetch data and calculate
}
```

---

## Testing

Tests are written using [Vitest](https://vitest.dev/) for fast, native ESM support.

```typescript
// Example test
import { describe, it, expect } from "vitest";
import { calculateEndCapitalValueWithCompoundInterest } from "./financeService";

describe("Compound Interest", () => {
  it("calculates future value correctly", () => {
    const result = calculateEndCapitalValueWithCompoundInterest(1000, 0.1, 1);
    expect(result).toBeCloseTo(1100, 2);
  });
});
```

---

## Contributing

1. Add new calculations to the appropriate service file
2. Write comprehensive tests for all edge cases
3. Export new functions from the module index
4. Update this README with documentation

---

## License

This project is private and proprietary.
