/**
 * The one net-worth aggregator.
 *
 * Every reader of "what does this user own and owe" goes through here: the
 * server-side net worth (snapshots, GET /api/v1/net-worth), the dashboard
 * overview (portfolio.getOverview), the category queries and the unified
 * positions table. frontend/convex/lib/netWorth.ts loads each provider table
 * once and maps every row to a NormalizedHolding; this module only groups and
 * totals them, so the routing rules live in one place:
 *
 * - a holding's category is its stored investmentCategory (override-aware);
 *   a missing or unknown one is "unclassified", still counted in the totals;
 * - values and costs are in the base currency (EUR) only;
 * - a liability's value is the amount owed (positive = owed). A negative
 *   amount owed (a credit-card credit balance, an overpaid loan) is money
 *   owed to the user: it counts as a small cash asset, never as debt;
 * - cost and P/L follow the coverage policy of categorySummary.ts.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import {
  buildCategorySummary,
  type CategorySummaryData,
} from "./categorySummary";
import {
  summarizeUnrealizedProfitLoss,
  type UnrealizedProfitLoss,
} from "./unrealizedProfitLoss";

// ═══════════════════════════════════════════════════════════════
// Holdings
// ═══════════════════════════════════════════════════════════════

/** Every category a holding can land in, in display order. */
export const HOLDING_CATEGORIES = [
  "cash",
  "equities",
  "bonds",
  "crypto",
  "commodities",
  "real-estate",
  "collectibles",
  "unclassified",
  "liabilities",
] as const;

export type HoldingCategory = (typeof HOLDING_CATEGORIES)[number];

/** The asset categories (every category except liabilities). */
export const ASSET_CATEGORIES = HOLDING_CATEGORIES.filter(
  (c): c is Exclude<HoldingCategory, "liabilities"> => c !== "liabilities",
);

export type HoldingProvider = "plaid" | "snaptrade" | "bitpanda" | "manual";

/**
 * Where a holding comes from. Separates, for example, vault metals (manual,
 * valued at spot) from Bitpanda and broker metals in the same category.
 */
export type HoldingSource =
  | "bank"
  | "brokerPosition"
  | "brokerAccount"
  | "bitpanda"
  | "vault"
  | "loan";

export interface NormalizedHolding {
  /** Id of the stored document (unique per source) */
  id: string;
  provider: HoldingProvider;
  source: HoldingSource;
  category: HoldingCategory;
  subcategory: string;
  name: string;
  /**
   * Base-currency amount. For an asset its value; for a liability the
   * amount owed (positive = owed, negative = a credit balance).
   */
  valueBase: number;
  /** Cost basis in the base currency; null when unknown (never 0 for that) */
  costBase: number | null;
  /** When the value was last priced or synced (ms); null for manual records */
  pricedAt: number | null;
  /** Monthly-equivalent scheduled payment of a loan, in the base currency */
  monthlyPaymentBase?: number;
}

/** Map a stored investmentCategory to a category; unknown → unclassified. */
export function toHoldingCategory(
  category: string | null | undefined,
): HoldingCategory {
  return (HOLDING_CATEGORIES as readonly string[]).includes(category ?? "")
    ? (category as HoldingCategory)
    : "unclassified";
}

/** Subcategory of a credit balance counted as cash. */
export const CREDIT_BALANCE_SUBCATEGORY = "credit-balance";

/**
 * Where a holding is counted: liabilities with a positive amount owed stay
 * liabilities; a negative amount owed becomes a cash asset of that size.
 */
export function placeHolding(h: NormalizedHolding): {
  category: HoldingCategory;
  subcategory: string;
  value: number;
} {
  if (h.category === "liabilities" && h.valueBase < 0) {
    return {
      category: "cash",
      subcategory: CREDIT_BALANCE_SUBCATEGORY,
      value: -h.valueBase,
    };
  }
  return { category: h.category, subcategory: h.subcategory, value: h.valueBase };
}

// ═══════════════════════════════════════════════════════════════
// Aggregation
// ═══════════════════════════════════════════════════════════════

export interface CategoryAggregate extends CategorySummaryData {
  /** Value per source, e.g. vault vs Bitpanda metals in commodities */
  bySource: Partial<Record<HoldingSource, number>>;
}

export interface NetWorthAggregate {
  totalAssets: number;
  /** Amount owed, positive */
  totalLiabilities: number;
  netWorth: number;
  /** Every category, including empty ones; liabilities' value is owed */
  byCategory: Record<HoldingCategory, CategoryAggregate>;
  /** Unrealised P/L over the asset categories' cost-covered holdings */
  unrealized: UnrealizedProfitLoss;
  /** Sum of the loans' monthly-equivalent scheduled payments */
  monthlyLoanPayment: number;
  /** Number of loans counted as liabilities */
  loansCount: number;
  /**
   * Data freshness: the oldest pricedAt among the holdings that have one
   * (a stale provider sync or spot price makes the whole figure that old).
   * Null when no holding carries one.
   */
  asOf: number | null;
}

export function aggregateNetWorth(
  holdings: NormalizedHolding[],
): NetWorthAggregate {
  const placed = holdings.map((h) => ({ h, at: placeHolding(h) }));

  const byCategory = {} as Record<HoldingCategory, CategoryAggregate>;
  for (const category of HOLDING_CATEGORIES) {
    const inCategory = placed.filter((p) => p.at.category === category);
    const isLiability = category === "liabilities";
    const summary = buildCategorySummary(
      inCategory.map(({ h, at }) => ({
        id: h.id,
        name: h.name,
        subcategory: at.subcategory,
        value: at.value,
        // A loan's principal is not a cost basis
        costBasis: isLiability ? null : h.costBase,
      })),
    );
    const bySource: Partial<Record<HoldingSource, number>> = {};
    for (const { h, at } of inCategory) {
      bySource[h.source] = (bySource[h.source] ?? 0) + at.value;
    }
    byCategory[category] = { ...summary, bySource };
  }

  const totalAssets = ASSET_CATEGORIES.reduce(
    (sum, c) => sum + byCategory[c].value,
    0,
  );
  const totalLiabilities = byCategory.liabilities.value;

  const unrealized = summarizeUnrealizedProfitLoss(
    ASSET_CATEGORIES.map((c) => ({
      value: byCategory[c].value,
      costBasis: byCategory[c].costBasis,
      profitLoss: byCategory[c].profitLoss,
    })),
  );

  const loans = holdings.filter((h) => h.source === "loan");
  const pricedAts = holdings
    .map((h) => h.pricedAt)
    .filter((t): t is number => t !== null && Number.isFinite(t));

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    byCategory,
    unrealized,
    monthlyLoanPayment: loans.reduce(
      (sum, h) => sum + (h.monthlyPaymentBase ?? 0),
      0,
    ),
    loansCount: loans.length,
    asOf: pricedAts.length > 0 ? Math.min(...pricedAts) : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Snapshot breakdown
// ═══════════════════════════════════════════════════════════════

/** One entry of a snapshot's categoryBreakdown (schema: portfolioSnapshots). */
export interface SnapshotCategoryEntry {
  category: string;
  value: number;
  /** Cost of the holdings that have one; absent when none has */
  costBasis?: number;
  /** Value of the holdings costBasis covers; set with costBasis */
  coveredValue?: number;
  /** Value per source (e.g. vault vs Bitpanda metals) */
  sources?: Array<{ source: HoldingSource; value: number }>;
}

/**
 * The snapshot's category breakdown (asset categories with a value) and
 * cost totals. Every category with a cost basis also records the value that
 * cost covers, so a reader compares cost only with that value
 * (snapshotCostLine), and its value per source, so the vault metals
 * (continuous valuation) can be told apart from provider metals.
 */
export function buildSnapshotBreakdown(aggregate: NetWorthAggregate): {
  categoryBreakdown: SnapshotCategoryEntry[];
  totalCostBasis: number | undefined;
  totalCoveredValue: number | undefined;
} {
  const categoryBreakdown: SnapshotCategoryEntry[] = [];
  let totalCostBasis: number | undefined;
  let totalCoveredValue: number | undefined;

  for (const category of ASSET_CATEGORIES) {
    const c = aggregate.byCategory[category];
    if (c.costBasis !== null) {
      totalCostBasis = (totalCostBasis ?? 0) + c.costBasis;
      totalCoveredValue = (totalCoveredValue ?? 0) + c.coveredValue;
    }
    if (c.value === 0) continue;
    const sources = (Object.keys(c.bySource) as HoldingSource[]).map(
      (source) => ({ source, value: c.bySource[source] ?? 0 }),
    );
    categoryBreakdown.push({
      category,
      value: c.value,
      ...(c.costBasis !== null
        ? { costBasis: c.costBasis, coveredValue: c.coveredValue }
        : {}),
      sources,
    });
  }

  return { categoryBreakdown, totalCostBasis, totalCoveredValue };
}
