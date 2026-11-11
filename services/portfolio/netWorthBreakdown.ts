/**
 * Provider-to-category bucketing for the server-side net worth
 * (frontend/convex/lib/netWorth.ts), which writes every portfolio snapshot.
 *
 * Kept pure so the routing and the snapshot's cost fields are unit-tested;
 * netWorth.ts only reads the documents and passes them in.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import {
  positionCostBasis,
  positionValue,
  summarizeHoldings,
  type HoldingsSummary,
  type PositionLike,
} from "./categorySummary";
import type { HoldingValuation } from "./unrealizedProfitLoss";

/** A stored provider position with its classified investment category. */
export interface CategorizedPosition extends PositionLike {
  investmentCategory?: string;
}

/** The cost-bearing investment categories, in snapshot order. */
export const INVESTMENT_CATEGORIES = [
  "equities",
  "bonds",
  "crypto",
  "commodities",
] as const;

export type InvestmentCategoryId = (typeof INVESTMENT_CATEGORIES)[number];

export interface ProviderBuckets {
  /** Value, cost and P/L per investment category (coverage-based) */
  categories: Record<InvestmentCategoryId, HoldingsSummary>;
  /** Cash held at the providers (base currency) */
  cash: number;
  /** Liabilities held at the providers, as a positive amount */
  liabilities: number;
}

/**
 * Route provider holdings to categories:
 * - broker positions to bonds or crypto by their category, everything else
 *   (equities, commodities, unclassified) to equities, with cost converted
 *   to the base currency (positionCostBasis);
 * - vault items to commodities, as already valued (valueVaultItem);
 * - Bitpanda holdings to equities, bonds or commodities by their category,
 *   everything else to crypto; they carry no cost basis, so they add value
 *   only;
 * - either provider's cash and liabilities to the totals.
 */
export function bucketProviderHoldings(input: {
  brokerPositions: CategorizedPosition[];
  vaultHoldings: HoldingValuation[];
  bitpandaHoldings: CategorizedPosition[];
}): ProviderBuckets {
  const holdings: Record<InvestmentCategoryId, HoldingValuation[]> = {
    equities: [],
    bonds: [],
    crypto: [],
    commodities: [...input.vaultHoldings],
  };
  let cash = 0;
  let liabilities = 0;

  const route = (
    category: string | undefined,
    holding: HoldingValuation,
    routed: readonly InvestmentCategoryId[],
    fallback: InvestmentCategoryId,
  ) => {
    if (category === "cash") cash += holding.value;
    else if (category === "liabilities")
      liabilities += Math.abs(holding.value);
    else {
      const target = routed.find((c) => c === category) ?? fallback;
      holdings[target].push(holding);
    }
  };

  // Broker commodity positions count as equities, like the category pages
  // (whose commodities are the vault only)
  for (const p of input.brokerPositions) {
    route(
      p.investmentCategory,
      { value: positionValue(p), costBasis: positionCostBasis(p) },
      ["bonds", "crypto"],
      "equities",
    );
  }
  for (const h of input.bitpandaHoldings) {
    route(
      h.investmentCategory,
      { value: positionValue(h), costBasis: null },
      ["equities", "bonds", "commodities"],
      "crypto",
    );
  }

  return {
    categories: {
      equities: summarizeHoldings(holdings.equities),
      bonds: summarizeHoldings(holdings.bonds),
      crypto: summarizeHoldings(holdings.crypto),
      commodities: summarizeHoldings(holdings.commodities),
    },
    cash,
    liabilities,
  };
}

/** One entry of a snapshot's categoryBreakdown (schema: portfolioSnapshots). */
export interface SnapshotCategoryEntry {
  category: string;
  value: number;
  /** Cost of the holdings that have one; absent when none has */
  costBasis?: number;
  /** Value of the holdings costBasis covers; set with costBasis */
  coveredValue?: number;
}

/**
 * The snapshot's category breakdown and cost totals. Every category with a
 * cost basis also records the value that cost covers, so a reader compares
 * cost only with that value (services snapshotCostLine).
 */
export function buildSnapshotBreakdown(
  cash: number,
  categories: Record<InvestmentCategoryId, HoldingsSummary>,
): {
  categoryBreakdown: SnapshotCategoryEntry[];
  /** Value of all investment categories */
  investmentsValue: number;
  totalCostBasis: number | undefined;
  totalCoveredValue: number | undefined;
} {
  const categoryBreakdown: SnapshotCategoryEntry[] = [];
  if (cash > 0) categoryBreakdown.push({ category: "cash", value: cash });

  let investmentsValue = 0;
  let totalCostBasis: number | undefined;
  let totalCoveredValue: number | undefined;

  for (const category of INVESTMENT_CATEGORIES) {
    const c = categories[category];
    investmentsValue += c.value;
    if (c.costBasis !== null) {
      totalCostBasis = (totalCostBasis ?? 0) + c.costBasis;
      totalCoveredValue = (totalCoveredValue ?? 0) + c.coveredValue;
    }
    if (c.value > 0) {
      categoryBreakdown.push(
        c.costBasis !== null
          ? {
              category,
              value: c.value,
              costBasis: c.costBasis,
              coveredValue: c.coveredValue,
            }
          : { category, value: c.value },
      );
    }
  }

  return {
    categoryBreakdown,
    investmentsValue,
    totalCostBasis,
    totalCoveredValue,
  };
}
