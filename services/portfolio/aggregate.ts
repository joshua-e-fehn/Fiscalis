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

/**
 * Amount owed for a provider position (broker, Bitpanda) classified as a
 * liability: its absolute value. A debt is usually stored as a negative
 * position (negative cash), but a user override can put a positive position
 * in liabilities too; either way it is debt. A position has no credit
 * balance, unlike a Plaid account or a loan.
 */
export function positionOwed(value: number): number {
  return Math.abs(value);
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
  /** Cost basis and the value it covers per source (sources with a cost basis) */
  costBySource: Partial<
    Record<HoldingSource, { costBasis: number; coveredValue: number }>
  >;
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
   * Number of non-loan holdings counted as liabilities (credit cards,
   * provider loan accounts, margin debits, liability positions). Loans are
   * counted in loansCount only.
   */
  liabilityAccountsCount: number;
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
    const costBySource: CategoryAggregate["costBySource"] = {};
    for (const { h, at } of inCategory) {
      bySource[h.source] = (bySource[h.source] ?? 0) + at.value;
      if (!isLiability && h.costBase !== null) {
        const c = costBySource[h.source] ?? { costBasis: 0, coveredValue: 0 };
        c.costBasis += h.costBase;
        c.coveredValue += at.value;
        costBySource[h.source] = c;
      }
    }
    byCategory[category] = { ...summary, bySource, costBySource };
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
    liabilityAccountsCount: placed.filter(
      (p) => p.at.category === "liabilities" && p.h.source !== "loan",
    ).length,
    asOf: pricedAts.length > 0 ? Math.min(...pricedAts) : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Snapshot breakdown
// ═══════════════════════════════════════════════════════════════

/** One source's share of a snapshot category entry. */
export interface SnapshotSourceEntry {
  source: string;
  value: number;
  /** Cost of the source's holdings that have one; absent when none has */
  costBasis?: number;
  /**
   * Value of the holdings costBasis covers (0 without a cost basis).
   * Written on every source since flows exist; its absence marks a row
   * written before per-source costs were stored.
   */
  coveredValue?: number;
}

/** One entry of a snapshot's categoryBreakdown (schema: portfolioSnapshots). */
export interface SnapshotCategoryEntry {
  category: string;
  value: number;
  /** Cost of the holdings that have one; absent when none has */
  costBasis?: number;
  /** Value of the holdings costBasis covers; set with costBasis */
  coveredValue?: number;
  /** Value (and cost) per source, e.g. vault vs Bitpanda metals */
  sources?: SnapshotSourceEntry[];
  /**
   * External flow into the category since the previous day's snapshot
   * (snapshotCategoryFlow); absent on the first snapshot and on rows
   * written before flows existed
   */
  netFlow?: number;
  /** Part of netFlow is assumed (holdings without a cost basis) */
  netFlowEstimated?: boolean;
}

/**
 * The snapshot's category breakdown (asset categories with a value) and
 * cost totals. Every category with a cost basis also records the value that
 * cost covers, so a reader compares cost only with that value
 * (snapshotCostLine), and its value and cost per source, so the vault
 * metals (continuous valuation) can be told apart from provider metals.
 *
 * With the previous day's breakdown (`previous`; an empty array when that
 * snapshot held nothing), each entry also records its net external flow
 * since then (snapshotCategoryFlow).
 */
export function buildSnapshotBreakdown(
  aggregate: NetWorthAggregate,
  previous?: readonly SnapshotCategoryEntry[],
): {
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
      (source): SnapshotSourceEntry => {
        const cost = c.costBySource[source];
        return {
          source,
          value: c.bySource[source] ?? 0,
          ...(cost ? { costBasis: cost.costBasis } : {}),
          coveredValue: cost?.coveredValue ?? 0,
        };
      },
    );
    const entry: SnapshotCategoryEntry = {
      category,
      value: c.value,
      ...(c.costBasis !== null
        ? { costBasis: c.costBasis, coveredValue: c.coveredValue }
        : {}),
      sources,
    };
    if (previous) {
      const flow = snapshotCategoryFlow(
        previous.find((p) => p.category === category),
        entry,
      );
      entry.netFlow = flow.amount;
      if (flow.estimated) entry.netFlowEstimated = true;
    }
    categoryBreakdown.push(entry);
  }

  return { categoryBreakdown, totalCostBasis, totalCoveredValue };
}

// ═══════════════════════════════════════════════════════════════
// External flows between snapshots
// ═══════════════════════════════════════════════════════════════
// Investment categories report performance net of money moved in and out
// (D2): P/L = change in value − net flows. Provider data carries no cash
// ledger, so the flow between two snapshots is derived from what they
// store; the snapshot writer and the performance engine call the same
// functions, so a stored netFlow and a recomputed one agree.

/**
 * Categories whose performance is flow-adjusted (D2). Net worth, cash and
 * liabilities report a plain change in value: saving legitimately raises
 * them.
 */
export const FLOW_ADJUSTED_CATEGORIES: readonly HoldingCategory[] = [
  "equities",
  "bonds",
  "crypto",
  "commodities",
  "real-estate",
  "collectibles",
];

export function isFlowAdjustedCategory(category: string): boolean {
  return (FLOW_ADJUSTED_CATEGORIES as readonly string[]).includes(category);
}

/** An external flow and whether it is assumed rather than derived. */
export interface NetFlow {
  /** Money put in (> 0) or taken out (< 0), in the base currency */
  amount: number;
  /** Assumed 0 for holdings without a cost basis at one of the two ends */
  estimated: boolean;
}

/** The fields of a snapshot entry (category or source) a flow is read from. */
export interface FlowEntry {
  value: number;
  costBasis?: number | null;
  coveredValue?: number | null;
}

/**
 * Net external flow into one group of holdings (a source, or a whole
 * category) between two snapshots:
 *
 * - it appears (no value before): its value now came in, a purchase or a
 *   newly connected account, never a gain;
 * - it disappears: its last value went out, a sale or a disconnection;
 * - a cost basis at both ends: a rise in cost is a purchase at that cost;
 *   a fall is a sale, its proceeds estimated at the previous market/cost
 *   ratio of the covered holdings; value without a cost basis inside the
 *   group counts as a flow, so only cost-covered holdings make P/L (the
 *   coverage policy of categorySummary.ts);
 * - otherwise (no cost basis at one end) the flow is assumed 0, so the
 *   change counts as performance, and flagged estimated.
 */
export function snapshotNetFlow(
  prev: FlowEntry | undefined,
  cur: FlowEntry | undefined,
): NetFlow {
  const before = prev?.value ?? 0;
  const after = cur?.value ?? 0;
  if (before === 0) return { amount: after, estimated: false };
  if (after === 0) return { amount: -before, estimated: false };

  const prevCost = prev?.costBasis ?? null;
  const curCost = cur?.costBasis ?? null;
  if (prevCost === null || curCost === null) {
    return { amount: 0, estimated: true };
  }

  const prevCovered = coveredOf(prev!);
  const costChange = curCost - prevCost;
  const covered =
    costChange < 0 && prevCost > 0
      ? costChange * (prevCovered / prevCost)
      : costChange;
  const uncoveredChange =
    after - coveredOf(cur!) - (before - prevCovered);
  return { amount: covered + uncoveredChange, estimated: false };
}

/** Value a cost basis covers; rows without coveredValue fall back to value. */
function coveredOf(e: FlowEntry): number {
  if (e.costBasis == null) return 0;
  return Math.min(e.coveredValue ?? e.value, e.value);
}

/** Whether an entry stores cost per source (written since flows exist). */
function hasSourceCosts(e: SnapshotCategoryEntry | undefined): boolean {
  return (
    e === undefined ||
    (e.sources !== undefined &&
      e.sources.every((s) => s.coveredValue !== undefined))
  );
}

/**
 * Net external flow into a category between two snapshots, leaving out
 * the `exclude`d sources (valued by another strategy). Rows that store cost
 * per source are compared source by source; older rows category-wide, and
 * an excluded source is then split off by value alone (estimated).
 */
export function snapshotCategoryFlow(
  prev: SnapshotCategoryEntry | undefined,
  cur: SnapshotCategoryEntry | undefined,
  exclude: ReadonlySet<string> = new Set(),
): NetFlow {
  if (hasSourceCosts(prev) && hasSourceCosts(cur)) {
    const names = new Set(
      [...(prev?.sources ?? []), ...(cur?.sources ?? [])].map((s) => s.source),
    );
    let amount = 0;
    let estimated = false;
    for (const name of names) {
      if (exclude.has(name)) continue;
      const flow = snapshotNetFlow(
        prev?.sources?.find((s) => s.source === name),
        cur?.sources?.find((s) => s.source === name),
      );
      amount += flow.amount;
      estimated ||= flow.estimated;
    }
    return { amount, estimated };
  }

  const total = snapshotNetFlow(prev, cur);
  const excluded = [...exclude];
  if (excluded.length === 0) return total;
  let amount = total.amount;
  for (const name of excluded) {
    const valueOf = (e: SnapshotCategoryEntry | undefined) => {
      const s = e?.sources?.find((x) => x.source === name);
      return s ? { value: s.value } : undefined;
    };
    amount -= snapshotNetFlow(valueOf(prev), valueOf(cur)).amount;
  }
  return { amount, estimated: true };
}
