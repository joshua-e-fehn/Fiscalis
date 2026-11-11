/**
 * Unrealised profit/loss over the part of a portfolio that has a cost basis.
 *
 * Cash, most crypto and collectibles carry no cost basis. Subtracting a
 * partial cost basis from total assets counts those holdings as pure profit,
 * so P/L is computed only over cost-bearing categories (their value and cost
 * together), and `coverage` reports which share of assets that is.
 */

export interface CategoryValuation {
  /** Current value of the category */
  value: number;
  /** Cost basis of the category, null when unknown */
  costBasis: number | null;
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
  const costBearing = categories.filter(
    (c): c is { value: number; costBasis: number } =>
      c.costBasis !== null && c.value > 0,
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
  const coveredValue = costBearing.reduce((sum, c) => sum + c.value, 0);
  const profitLoss = coveredValue - costBasis;

  return {
    costBasis,
    coveredValue,
    profitLoss,
    profitLossPercent: costBasis > 0 ? (profitLoss / costBasis) * 100 : null,
    coverage: totalValue > 0 ? coveredValue / totalValue : null,
  };
}
