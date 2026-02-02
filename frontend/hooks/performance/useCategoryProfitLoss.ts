/**
 * Category Profit/Loss Hook
 *
 * Calculates P/L for a category using either:
 * 1. Explicit cost basis from portfolio snapshots (if available)
 * 2. First non-zero snapshot value as inferred cost basis
 *
 * This provides unified P/L calculation across all investment categories,
 * even when providers (like Vezgo for crypto) don't provide cost basis data.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import type { SnapshotData } from "@/lib/performance";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CategoryProfitLossResult {
  /** Current value of the category */
  currentValue: number;
  /** Cost basis (explicit or inferred from first snapshot) */
  costBasis: number | null;
  /** Absolute profit/loss */
  profitLoss: number | null;
  /** Percentage profit/loss */
  profitLossPercent: number | null;
  /** Whether cost basis was inferred from first snapshot */
  isCostBasisInferred: boolean;
  /** Loading state */
  isLoading: boolean;
}

export interface UseCategoryProfitLossOptions {
  /** The category to calculate P/L for */
  category: string;
  /** Current value of the category (from live data) */
  currentValue: number;
  /** Explicit cost basis if available (from provider) */
  explicitCostBasis?: number | null;
  /** Whether to enable the query */
  enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate P/L for a category
 *
 * When explicit cost basis is not available (e.g., crypto from Vezgo),
 * uses the first non-zero snapshot value for this category as the cost basis.
 *
 * @example
 * ```tsx
 * const { profitLoss, profitLossPercent } = useCategoryProfitLoss({
 *   category: "crypto",
 *   currentValue: 161.61,
 * });
 * ```
 */
export function useCategoryProfitLoss(
  options: UseCategoryProfitLossOptions,
): CategoryProfitLossResult {
  const {
    category,
    currentValue,
    explicitCostBasis = null,
    enabled = true,
  } = options;

  // Fetch portfolio snapshots
  const rawSnapshots = useQuery(
    api.portfolioSnapshots.getSnapshots,
    enabled ? { limit: 730 } : "skip",
  );

  const isLoading = rawSnapshots === undefined;

  const result = useMemo<Omit<CategoryProfitLossResult, "isLoading">>(() => {
    // If we have explicit cost basis, use it
    if (explicitCostBasis !== null && explicitCostBasis > 0) {
      const profitLoss = currentValue - explicitCostBasis;
      const profitLossPercent = (profitLoss / explicitCostBasis) * 100;

      return {
        currentValue,
        costBasis: explicitCostBasis,
        profitLoss,
        profitLossPercent,
        isCostBasisInferred: false,
      };
    }

    // No explicit cost basis - try to infer from first snapshot
    if (!rawSnapshots || rawSnapshots.length === 0) {
      return {
        currentValue,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        isCostBasisInferred: false,
      };
    }

    // Find the first non-zero snapshot for this category
    // Sort snapshots by timestamp ascending
    const sortedSnapshots = [...rawSnapshots].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    let firstNonZeroValue: number | null = null;

    for (const snapshot of sortedSnapshots) {
      if (snapshot.categoryBreakdown) {
        const categoryData = snapshot.categoryBreakdown.find(
          (c) => c.category === category,
        );
        if (categoryData && categoryData.value > 0) {
          firstNonZeroValue = categoryData.value;
          break;
        }
      }
    }

    // If we found a first non-zero value, use it as cost basis
    if (firstNonZeroValue !== null && currentValue > 0) {
      const profitLoss = currentValue - firstNonZeroValue;
      const profitLossPercent = (profitLoss / firstNonZeroValue) * 100;

      return {
        currentValue,
        costBasis: firstNonZeroValue,
        profitLoss,
        profitLossPercent,
        isCostBasisInferred: true,
      };
    }

    // No historical data found
    return {
      currentValue,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      isCostBasisInferred: false,
    };
  }, [category, currentValue, explicitCostBasis, rawSnapshots]);

  return {
    ...result,
    isLoading,
  };
}

/**
 * Calculate P/L for the entire portfolio
 *
 * Uses explicit cost basis if available, otherwise infers from first snapshot.
 */
export function usePortfolioProfitLoss(
  currentValue: number,
  explicitCostBasis?: number | null,
  enabled = true,
): CategoryProfitLossResult {
  const rawSnapshots = useQuery(
    api.portfolioSnapshots.getSnapshots,
    enabled ? { limit: 730 } : "skip",
  );

  const isLoading = rawSnapshots === undefined;

  const result = useMemo<Omit<CategoryProfitLossResult, "isLoading">>(() => {
    // If we have explicit cost basis, use it
    if (
      explicitCostBasis !== null &&
      explicitCostBasis !== undefined &&
      explicitCostBasis > 0
    ) {
      const profitLoss = currentValue - explicitCostBasis;
      const profitLossPercent = (profitLoss / explicitCostBasis) * 100;

      return {
        currentValue,
        costBasis: explicitCostBasis,
        profitLoss,
        profitLossPercent,
        isCostBasisInferred: false,
      };
    }

    // No explicit cost basis - try to infer from first snapshot
    if (!rawSnapshots || rawSnapshots.length === 0) {
      return {
        currentValue,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        isCostBasisInferred: false,
      };
    }

    // Find the first non-zero snapshot
    const sortedSnapshots = [...rawSnapshots].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    let firstNonZeroValue: number | null = null;

    for (const snapshot of sortedSnapshots) {
      if (snapshot.totalAssets > 0) {
        firstNonZeroValue = snapshot.totalAssets;
        break;
      }
    }

    // If we found a first non-zero value, use it as cost basis
    if (firstNonZeroValue !== null && currentValue > 0) {
      const profitLoss = currentValue - firstNonZeroValue;
      const profitLossPercent = (profitLoss / firstNonZeroValue) * 100;

      return {
        currentValue,
        costBasis: firstNonZeroValue,
        profitLoss,
        profitLossPercent,
        isCostBasisInferred: true,
      };
    }

    return {
      currentValue,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      isCostBasisInferred: false,
    };
  }, [currentValue, explicitCostBasis, rawSnapshots]);

  return {
    ...result,
    isLoading,
  };
}
