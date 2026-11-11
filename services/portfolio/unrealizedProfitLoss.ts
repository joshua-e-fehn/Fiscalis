/**
 * Unrealised profit/loss over the part of a portfolio that has a cost basis.
 *
 * Cash, most crypto and collectibles carry no cost basis. Subtracting a
 * partial cost basis from total assets counts those holdings as pure profit,
 * so P/L is computed only over cost-bearing categories (their value and cost
 * together), and `coverage` reports which share of assets that is. Within a
 * category only the holdings that carry a cost basis count: each category
 * reports its P/L over those holdings, and the covered value is derived from
 * it (`coveredValueOf`), never assumed to be the category's full value.
 */

export interface CategoryValuation {
  /** Current value of the category (every holding) */
  value: number;
  /** Cost basis of the holdings that have one, null when none has */
  costBasis: number | null;
  /**
   * P/L of the holdings the cost basis covers (as reported by the category's
   * own summary), null when unknown. The covered value follows from it:
   * coveredValue = costBasis + profitLoss, so holdings without a cost basis
   * (Bitpanda wallets, vault items without a purchase price) never count
   * as profit.
   */
  profitLoss: number | null;
}

/** A single holding's value and cost basis (null/undefined when unknown) */
export interface HoldingValuation {
  value: number;
  costBasis: number | null | undefined;
}

/**
 * Sum of value over the holdings that carry a cost basis, so a category's
 * partial cost basis is compared with the value it actually covers.
 */
export function sumCostCoveredValue(holdings: HoldingValuation[]): number {
  return holdings.reduce(
    (sum, h) => (h.costBasis != null ? sum + h.value : sum),
    0,
  );
}

export interface UnrealizedProfitLoss {
  /** Sum of cost basis over cost-bearing categories, null when none */
  costBasis: number | null;
  /** Sum of value over the same categories */
  coveredValue: number;
  /** coveredValue - costBasis, null when no category has a cost basis */
  profitLoss: number | null;
  /** profitLoss / costBasis * 100, null when cost basis is not positive */
  profitLossPercent: number | null;
  /** coveredValue / total value (0..1), null when total value is not positive */
  coverage: number | null;
}

export function summarizeUnrealizedProfitLoss(
  categories: CategoryValuation[],
): UnrealizedProfitLoss {
  const totalValue = categories.reduce((sum, c) => sum + c.value, 0);
  const costBearing = categories
    .map((c) => ({
      costBasis: c.costBasis,
      covered: coveredValueOf(c.costBasis, c.profitLoss),
    }))
    // A category counts when its cost-bearing holdings have a value or a
    // cost: holdings that became worthless are a loss of their whole cost,
    // only a category with neither (nothing held) is left out
    .filter(
      (c): c is { costBasis: number; covered: number } =>
        c.costBasis !== null &&
        c.covered !== null &&
        (c.covered > 0 || c.costBasis > 0),
    );

  if (costBearing.length === 0) {
    return {
      costBasis: null,
      coveredValue: 0,
      profitLoss: null,
      profitLossPercent: null,
      coverage: totalValue > 0 ? 0 : null,
    };
  }

  const costBasis = costBearing.reduce((sum, c) => sum + c.costBasis, 0);
  const coveredValue = costBearing.reduce((sum, c) => sum + c.covered, 0);
  const profitLoss = coveredValue - costBasis;

  return {
    costBasis,
    coveredValue,
    profitLoss,
    profitLossPercent: costBasis > 0 ? (profitLoss / costBasis) * 100 : null,
    coverage: totalValue > 0 ? coveredValue / totalValue : null,
  };
}

/**
 * Value of the holdings a cost basis covers, recovered from a summary's
 * cost basis and the P/L it reports over those holdings.
 */
export function coveredValueOf(
  costBasis: number | null,
  profitLoss: number | null,
): number | null {
  return costBasis !== null && profitLoss !== null
    ? costBasis + profitLoss
    : null;
}

/**
 * The cost line a chart draws against the full value: the cost basis plus
 * the value of holdings without one. By construction value − costLine is the
 * reported P/L, so a chart and a KPI card showing the same summary agree.
 * Null when there is no P/L.
 */
export function costLine(
  value: number,
  profitLoss: number | null,
): number | null {
  return profitLoss === null ? null : value - profitLoss;
}

/**
 * Cost line of a stored snapshot (or one of its category entries). Snapshots
 * written before `coveredValue` existed lack it; they fall back to `value`,
 * i.e. the cost basis as stored.
 */
export function snapshotCostLine(entry: {
  value: number;
  costBasis?: number | null;
  coveredValue?: number | null;
}): number | null {
  if (entry.costBasis == null) return null;
  const covered = Math.min(entry.coveredValue ?? entry.value, entry.value);
  return costLine(entry.value, covered - entry.costBasis);
}
