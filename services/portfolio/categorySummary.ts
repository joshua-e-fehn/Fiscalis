/**
 * Value, cost basis and unrealised P/L of a set of holdings, under one
 * policy shared by the category queries, the category hooks, the vault
 * summary and the server-side net worth:
 *
 * - value counts every holding;
 * - cost and P/L count only the holdings with a known cost basis, so a
 *   holding without one (a transfer-in, a Bitpanda wallet) is neither free
 *   profit nor a zero-cost position;
 * - `coverage` says which share of the value the cost basis covers.
 *
 * Framework-free: imported by Convex functions, React hooks and vitest.
 */

import {
  costLine,
  sumCostCoveredValue,
  type HoldingValuation,
} from "./unrealizedProfitLoss";
import { toBase, type FxRates } from "../finance/currency";

export type { HoldingValuation };

export interface HoldingsSummary {
  /** Value of all holdings */
  value: number;
  /** Number of holdings */
  count: number;
  /** Cost basis of the holdings that have one; null when none has */
  costBasis: number | null;
  /** Value of the holdings that have a cost basis */
  coveredValue: number;
  /** coveredValue − costBasis; null when no holding has a cost basis */
  profitLoss: number | null;
  /** profitLoss / costBasis × 100; null when costBasis is not positive */
  profitLossPercent: number | null;
  /** coveredValue / value (0..1); null when value is not positive */
  coverage: number | null;
}

export function summarizeHoldings(
  holdings: HoldingValuation[],
): HoldingsSummary {
  const value = holdings.reduce((sum, h) => sum + h.value, 0);
  const withCost = holdings.filter(
    (h): h is { value: number; costBasis: number } => h.costBasis != null,
  );
  const coveredValue = sumCostCoveredValue(withCost);
  const costBasis =
    withCost.length > 0
      ? withCost.reduce((sum, h) => sum + h.costBasis, 0)
      : null;
  const profitLoss = costBasis === null ? null : coveredValue - costBasis;

  return {
    value,
    count: holdings.length,
    costBasis,
    coveredValue,
    profitLoss,
    profitLossPercent: percentOf(profitLoss, costBasis),
    coverage: value > 0 ? coveredValue / value : null,
  };
}

function percentOf(part: number | null, whole: number | null): number | null {
  return part !== null && whole !== null && whole > 0
    ? (part / whole) * 100
    : null;
}

// ═══════════════════════════════════════════════════════════════
// Provider positions
// ═══════════════════════════════════════════════════════════════

/**
 * The fields of a stored provider position (broker or Bitpanda) we read:
 * only the base-currency (EUR) fields stamped at sync time
 * (services/finance/currency.ts), never the native amounts.
 */
export interface PositionLike {
  _id: string;
  symbol?: string;
  name?: string;
  investmentSubcategory?: string;
  /** Value in the base currency (EUR); absent when it has no rate */
  valueInBaseCurrency?: number;
  /** Total cost basis in the base currency, converted with the value's rate */
  costBasisInBaseCurrency?: number;
}

/** A holding normalised for summaries: base-currency value and cost. */
export interface CategoryHolding extends HoldingValuation {
  id: string;
  name: string;
  subcategory: string;
}

/** Value in EUR; 0 for a position that could not be converted. */
export function positionValue(p: PositionLike): number {
  return p.valueInBaseCurrency ?? 0;
}

/** Cost basis in EUR; null without one (or without a rate). */
export function positionCostBasis(p: PositionLike): number | null {
  return p.costBasisInBaseCurrency ?? null;
}

export function positionToHolding(p: PositionLike): CategoryHolding {
  return {
    id: p._id,
    name: p.symbol ?? p.name ?? "Unknown",
    subcategory: p.investmentSubcategory ?? "unknown",
    value: positionValue(p),
    costBasis: positionCostBasis(p),
  };
}

// ═══════════════════════════════════════════════════════════════
// Accounts and loans
// ═══════════════════════════════════════════════════════════════

/** Bank (Plaid) account balance in EUR; 0 when it could not be converted. */
export function bankAccountValue(account: {
  valueInBaseCurrency?: number;
}): number {
  return account.valueInBaseCurrency ?? 0;
}

/**
 * Uninvested cash of a broker account in EUR: its cash balance, or, for an
 * account without positions, its whole balance (the holdings are cash).
 */
export function brokerAccountCash(
  account: {
    cash?: number;
    balance?: number;
    cashValueInBaseCurrency?: number;
    balanceInBaseCurrency?: number;
  },
  hasPositions: boolean,
): number {
  if ((account.cash ?? 0) > 0) return account.cashValueInBaseCurrency ?? 0;
  if (!hasPositions && (account.balance ?? 0) > 0) {
    return account.balanceInBaseCurrency ?? 0;
  }
  return 0;
}

/**
 * Loan statuses that count as a liability (D1): paid off and refinanced
 * loans do not.
 */
export function loanCountsAsLiability(status: string): boolean {
  return status === "active" || status === "defaulted";
}

/**
 * Outstanding loan balance in EUR, converted at read time by the loan's
 * currency. 0 for a loan that does not count (loanCountsAsLiability) or
 * whose currency has no rate (never read 1:1 as EUR).
 */
export function loanBalanceInBase(
  loan: { currentBalance: number; currency: string; status: string },
  rates: FxRates,
): number {
  if (!loanCountsAsLiability(loan.status)) return 0;
  const converted = toBase(Math.abs(loan.currentBalance), loan.currency, rates);
  return converted.ok ? converted.value : 0;
}

// ═══════════════════════════════════════════════════════════════
// Category summary
// ═══════════════════════════════════════════════════════════════

export interface CategorySummaryData extends HoldingsSummary {
  bySubcategory: Record<string, HoldingsSummary>;
}

/** Category totals plus the same summary per subcategory. */
export function buildCategorySummary(
  holdings: CategoryHolding[],
): CategorySummaryData {
  const groups = new Map<string, CategoryHolding[]>();
  for (const h of holdings) {
    const group = groups.get(h.subcategory);
    if (group) group.push(h);
    else groups.set(h.subcategory, [h]);
  }
  const bySubcategory: Record<string, HoldingsSummary> = {};
  for (const [subcategory, group] of groups) {
    bySubcategory[subcategory] = summarizeHoldings(group);
  }
  return { ...summarizeHoldings(holdings), bySubcategory };
}

/** Unrealised P/L of one holding; null without a cost basis. */
export function holdingProfitLoss(h: HoldingValuation): {
  profitLoss: number | null;
  profitLossPercent: number | null;
} {
  const profitLoss = h.costBasis != null ? h.value - h.costBasis : null;
  return {
    profitLoss,
    profitLossPercent: percentOf(profitLoss, h.costBasis ?? null),
  };
}

/** The `limit` largest holdings by value. */
export function topHoldings<T extends { value: number }>(
  holdings: T[],
  limit: number,
): T[] {
  return [...holdings].sort((a, b) => b.value - a.value).slice(0, limit);
}

/**
 * Split allocation slices into the ones shown individually and an "other"
 * remainder: a slice is shown when it is at least `thresholdPercent` of the
 * total and fewer than `maxSlices - 1` larger slices are shown already
 * (one slot stays for "other"). Input order is kept; pass it sorted.
 */
export function groupSmallSlices<T extends { value: number }>(
  slices: T[],
  options: { thresholdPercent: number; maxSlices: number },
): { shown: T[]; otherValue: number; total: number } {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const shown: T[] = [];
  let otherValue = 0;
  for (const slice of slices) {
    const percent = total > 0 ? (slice.value / total) * 100 : 0;
    if (
      percent >= options.thresholdPercent &&
      shown.length < options.maxSlices - 1
    ) {
      shown.push(slice);
    } else {
      otherValue += slice.value;
    }
  }
  return { shown, otherValue, total };
}

// ═══════════════════════════════════════════════════════════════
// P/L shown on a category page
// ═══════════════════════════════════════════════════════════════

export type ProfitLossSource = "cost-basis" | "first-snapshot";

export interface ResolvedProfitLoss {
  costBasis: number | null;
  /**
   * The cost line a chart draws against the category's full value:
   * currentValue − profitLoss, so the chart's gap and the KPI agree even when
   * only some holdings carry a cost basis. Null when there is no P/L.
   */
  costLine: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  /** Where the figures come from; null when there is no P/L to show */
  source: ProfitLossSource | null;
}

/**
 * The one precedence chain for a category's P/L, used for both the KPI card
 * and the chart's cost line (`costLine`) so they never disagree:
 *
 * 1. the holdings' own cost basis (coverage-based, from the summary);
 * 2. otherwise the category's first non-zero snapshot value as an inferred
 *    cost basis (for providers that report no cost at all).
 */
export function resolveCategoryProfitLoss(input: {
  currentValue: number;
  holdings: Pick<
    HoldingsSummary,
    "costBasis" | "profitLoss" | "profitLossPercent"
  > | null;
  firstSnapshotValue: number | null;
}): ResolvedProfitLoss {
  const { currentValue, holdings, firstSnapshotValue } = input;

  if (holdings && holdings.costBasis !== null && holdings.profitLoss !== null) {
    return {
      costBasis: holdings.costBasis,
      costLine: costLine(currentValue, holdings.profitLoss),
      profitLoss: holdings.profitLoss,
      profitLossPercent:
        holdings.profitLossPercent ??
        percentOf(holdings.profitLoss, holdings.costBasis),
      source: "cost-basis",
    };
  }

  if (
    firstSnapshotValue !== null &&
    firstSnapshotValue > 0 &&
    currentValue > 0
  ) {
    const profitLoss = currentValue - firstSnapshotValue;
    return {
      costBasis: firstSnapshotValue,
      costLine: costLine(currentValue, profitLoss),
      profitLoss,
      profitLossPercent: percentOf(profitLoss, firstSnapshotValue),
      source: "first-snapshot",
    };
  }

  return {
    costBasis: null,
    costLine: null,
    profitLoss: null,
    profitLossPercent: null,
    source: null,
  };
}
