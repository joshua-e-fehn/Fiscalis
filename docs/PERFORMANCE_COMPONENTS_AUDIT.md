# Performance Components Audit

> Last Updated: February 2, 2026

This document provides a comprehensive overview of all performance-related components across the application and their migration status to the new unified performance calculation service.

## Summary Overview

| Status               | Count | Description                                          |
| -------------------- | ----- | ---------------------------------------------------- |
| ✅ Using New Service | 11    | All category pages now use unified performance hooks |
| 🔧 Chart Components  | 2     | Updated to use unified MS constants                  |

---

## ✅ Migration Complete

All pages have been migrated to use the new unified performance service via `CategoryDashboardSection` or direct hook usage.

| Page                 | File                                                         | Hook Used                                                     | Status           |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ---------------- |
| **Crypto**           | `app/(root)/assets/crypto/page.tsx`                          | `useCategoryYTD("crypto")`                                    | ✅ New Service   |
| **Metals**           | `components/atomic/organisms/metals/MetalsPage.tsx`          | `useMetalsYTD(currency)`                                      | ✅ New Service   |
| **Metals Inventory** | `components/atomic/organisms/metals/MetalsInventoryPage.tsx` | `useMetalsYTD(currency)`                                      | ✅ New Service   |
| **Equities**         | `app/(root)/assets/equities/page.tsx`                        | `CategoryDashboardSection` → `useCategoryYTD("equities")`     | ✅ New Service   |
| **Bonds**            | `app/(root)/assets/bonds/page.tsx`                           | `CategoryDashboardSection` → `useCategoryYTD("bonds")`        | ✅ New Service   |
| **Cash**             | `app/(root)/assets/cash/page.tsx`                            | `CategoryDashboardSection` → `useCategoryYTD("cash")`         | ✅ New Service   |
| **Commodities**      | `app/(root)/assets/commodities/page.tsx`                     | `CategoryDashboardSection` → `useCategoryYTD("commodities")`  | ✅ New Service   |
| **Collectibles**     | `app/(root)/assets/collectibles/page.tsx`                    | `CategoryDashboardSection` → `useCategoryYTD("collectibles")` | ✅ New Service   |
| **Real Estate**      | `app/(root)/assets/real-estate/page.tsx`                     | `CategoryDashboardSection` → `useCategoryYTD("real-estate")`  | ✅ New Service   |
| **Liabilities**      | `app/(root)/liabilities/page.tsx`                            | `CategoryDashboardSection` → `useCategoryYTD("liabilities")`  | ✅ New Service   |
| **Dashboard**        | `app/(root)/dashboard/page.tsx`                              | `CategoryPerformanceChart` (updated)                          | ✅ Chart Updated |

---

## CategoryDashboardSection (Updated)

The `CategoryDashboardSection` component now accepts a required `category` prop and internally uses `useCategoryYTD(category)` from the unified performance service:

```tsx
// components/atomic/molecules/investments/CategoryDashboardSection.tsx
interface CategoryDashboardSectionProps {
  category: InvestmentCategory; // Required - used for YTD calculation
  summary: CategorySummary | null;
  currency?: InvestmentCurrency;
  isLoading?: boolean;
  showTopHoldings?: boolean;
  className?: string;
}

export function CategoryDashboardSection({
  category,
  summary,
  // ...
}: CategoryDashboardSectionProps) {
  // Use the unified performance service for YTD calculation
  const ytd = useCategoryYTD(category, { enabled: !isLoading });

  // ...
  <CategoryYTDCard
    ytdProfitLoss={ytd.ytdProfitLoss}
    ytdProfitLossPercent={ytd.ytdProfitLossPercent}
    // ...
  />;
}
```

### Usage in Pages

```tsx
// Example: equities/page.tsx
<CategoryDashboardSection
  category="equities" // Now required
  summary={summary}
  currency="eur"
  isLoading={isLoading}
/>
```

---

## Chart Components Status

| Component                    | File                                                                   | Time Constants                 | Status     |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------ | ---------- |
| **CategoryPerformanceChart** | `components/atomic/molecules/investments/CategoryPerformanceChart.tsx` | Uses `MS` from finance service | ✅ Updated |
| **PortfolioChart** (Metals)  | `components/atomic/molecules/metals/PortfolioChart.tsx`                | Uses `MS` from finance service | ✅ Updated |

Both chart components now use the unified `MS` constants from the finance service instead of hardcoded magic numbers:

```tsx
import { MS } from "@/../services/finance/financeService";

const timeRangeMs: Record<ChartTimeRange, number | null> = {
  "1W": MS.DAY * 7,
  "1M": MS.DAY * 30,
  "3M": MS.DAY * 90,
  "6M": MS.DAY * 180,
  "1Y": MS.DAY * 365,
  ALL: null,
};
```

---

## Deprecated Code (Can Now Be Removed)

The following deprecated functions are no longer used by any page components:

| File                       | Function/Hook                  | Status            |
| -------------------------- | ------------------------------ | ----------------- |
| `lib/types/investments.ts` | `calculateYTDPerformance()`    | ✅ No longer used |
| `hooks/metals.ts`          | `useYTDPortfolioPerformance()` | ✅ No longer used |

These can be safely removed in a future cleanup PR.

---

## Visual Summary

```
Performance Service Usage (All Migrated!)
─────────────────────────────────────────
✅ CategoryDashboardSection (6 pages)  ██████████████████████████  equities, bonds, cash, commodities, collectibles, real-estate
✅ Direct Hook Usage (3 pages)         ████████████░░░░░░░░░░░░░░  crypto, metals, metals-inventory
✅ Chart Components (2)                ████████░░░░░░░░░░░░░░░░░░  CategoryPerformanceChart, PortfolioChart
```

---

## Related Documentation

- [PERFORMANCE_CALCULATION_SERVICE.md](./PERFORMANCE_CALCULATION_SERVICE.md) - Full implementation details
- [hooks/performance/index.ts](../frontend/hooks/performance/index.ts) - Available hooks and exports

---

## Hook Reference

### New Hooks (Recommended)

| Hook                         | Use Case                                              | Strategy   |
| ---------------------------- | ----------------------------------------------------- | ---------- |
| `usePerformance()`           | Combined portfolio performance                        | Hybrid     |
| `useDiscretePerformance()`   | Snapshot-based assets (stocks, crypto, bank accounts) | Discrete   |
| `useContinuousPerformance()` | Price-based assets (precious metals)                  | Continuous |

### Bridge Hooks (For Migration)

| Hook                       | Replaces                       | Strategy   |
| -------------------------- | ------------------------------ | ---------- |
| `usePortfolioYTD()`        | `calculateYTDPerformance()`    | Discrete   |
| `useCategoryYTD(category)` | `calculateYTDPerformance()`    | Discrete   |
| `useMetalsYTD(currency)`   | `useYTDPortfolioPerformance()` | Continuous |
