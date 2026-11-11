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
  /**
   * The cost basis in the currency it was paid in, when that is not the
   * base currency (a USD broker position). Its base value moves with the
   * exchange rate; a flow is derived from the native cost so an FX move is
   * never taken for a purchase or sale.
   */
  costNative?: { amount: number; currency: string };
  /**
   * Identity across provider syncs, which replace their documents (and so
   * change `id`); defaults to `id`. Snapshot flows match holdings by it.
   */
  key?: string;
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
    liabilityAccountsCount: placed.filter(
      (p) => p.at.category === "liabilities" && p.h.source !== "loan",
    ).length,
    asOf: pricedAts.length > 0 ? Math.min(...pricedAts) : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Snapshot breakdown
// ═══════════════════════════════════════════════════════════════

/** One holding of a snapshot source entry: what its next flow is read from. */
export interface SnapshotHoldingEntry {
  /** NormalizedHolding.key (else its id) */
  key: string;
  value: number;
  /** Cost basis in the base currency; absent without one */
  cost?: number;
  /** Cost basis in `currency`, when it was paid in another currency */
  costNative?: number;
  currency?: string;
}

/** One source's share of a snapshot category entry. */
export interface SnapshotSourceEntry {
  source: string;
  value: number;
  /**
   * The source's holdings in a flow-adjusted category, kept so the next
   * day's snapshot can derive its flows. takeSnapshot strips them from rows
   * older than the previous day's, and getSnapshots never returns them.
   */
  holdings?: SnapshotHoldingEntry[];
  /** External flow into the source since the previous snapshot */
  netFlow?: number;
  /** Part of netFlow is assumed (see holdingNetFlow) */
  netFlowEstimated?: boolean;
}

/** One entry of a snapshot's categoryBreakdown (schema: portfolioSnapshots). */
export interface SnapshotCategoryEntry {
  category: string;
  value: number;
  /** Cost of the holdings that have one; absent when none has */
  costBasis?: number;
  /** Value of the holdings costBasis covers; set with costBasis */
  coveredValue?: number;
  /** Value per source, e.g. vault vs Bitpanda metals */
  sources?: SnapshotSourceEntry[];
  /**
   * External flow into the category since the previous day's snapshot, the
   * sum of its sources' (categoryFlowFromHoldings). Absent on the first
   * snapshot, outside the flow-adjusted categories, and when the previous
   * row has no holdings to compare with (rows written before flows
   * existed): readers then estimate it (snapshotCategoryFlow).
   */
  netFlow?: number;
  /** Part of netFlow is assumed (see holdingNetFlow) */
  netFlowEstimated?: boolean;
}

/** A holding's snapshot entry at its placed value. */
function toHoldingEntry(h: NormalizedHolding, value: number): SnapshotHoldingEntry {
  if (h.costBase === null) return { key: h.key ?? h.id, value };
  return {
    key: h.key ?? h.id,
    value,
    cost: h.costBase,
    ...(h.costNative
      ? { costNative: h.costNative.amount, currency: h.costNative.currency }
      : {}),
  };
}

/** Two holdings under one key (e.g. two wallets of a symbol) as one. */
function mergeHoldingEntries(
  a: SnapshotHoldingEntry,
  b: SnapshotHoldingEntry,
): SnapshotHoldingEntry {
  const merged: SnapshotHoldingEntry = { key: a.key, value: a.value + b.value };
  // A key only partly covered by a cost basis counts as uncovered
  if (a.cost === undefined || b.cost === undefined) return merged;
  merged.cost = a.cost + b.cost;
  if (
    a.costNative !== undefined &&
    b.costNative !== undefined &&
    a.currency === b.currency
  ) {
    merged.costNative = a.costNative + b.costNative;
    merged.currency = a.currency;
  }
  return merged;
}

/** The holdings of each flow-adjusted category by source, merged by key. */
function snapshotHoldings(
  holdings: readonly NormalizedHolding[],
): Map<string, Map<string, SnapshotHoldingEntry[]>> {
  const byCategory = new Map<string, Map<string, Map<string, SnapshotHoldingEntry>>>();
  for (const h of holdings) {
    const at = placeHolding(h);
    if (!isFlowAdjustedCategory(at.category)) continue;
    const bySource = byCategory.get(at.category) ?? new Map();
    byCategory.set(at.category, bySource);
    const byKey: Map<string, SnapshotHoldingEntry> =
      bySource.get(h.source) ?? new Map();
    bySource.set(h.source, byKey);
    const entry = toHoldingEntry(h, at.value);
    const existing = byKey.get(entry.key);
    byKey.set(entry.key, existing ? mergeHoldingEntries(existing, entry) : entry);
  }
  return new Map(
    [...byCategory].map(([category, bySource]) => [
      category,
      new Map([...bySource].map(([source, byKey]) => [source, [...byKey.values()]])),
    ]),
  );
}

/**
 * The snapshot's category breakdown (asset categories with a value or a
 * cost basis) and cost totals. Every category with a cost basis also records the value that
 * cost covers, so a reader compares cost only with that value
 * (snapshotCostLine), and its value per source, so the vault metals
 * (continuous valuation) can be told apart from provider metals. Sources of
 * a flow-adjusted category also keep their holdings.
 *
 * With the previous day's breakdown (`previous`; an empty array when that
 * snapshot held nothing), each flow-adjusted entry and its sources also
 * record their net external flow since then (categoryFlowFromHoldings),
 * unless the previous row has no holdings to compare with.
 */
export function buildSnapshotBreakdown(
  aggregate: NetWorthAggregate,
  holdings: readonly NormalizedHolding[],
  previous?: readonly SnapshotCategoryEntry[],
): {
  categoryBreakdown: SnapshotCategoryEntry[];
  totalCostBasis: number | undefined;
  totalCoveredValue: number | undefined;
} {
  const categoryBreakdown: SnapshotCategoryEntry[] = [];
  let totalCostBasis: number | undefined;
  let totalCoveredValue: number | undefined;
  const holdingsByCategory = snapshotHoldings(holdings);

  for (const category of ASSET_CATEGORIES) {
    const c = aggregate.byCategory[category];
    if (c.costBasis !== null) {
      totalCostBasis = (totalCostBasis ?? 0) + c.costBasis;
      totalCoveredValue = (totalCoveredValue ?? 0) + c.coveredValue;
    }
    // An empty category is left out, but one whose holdings became
    // worthless keeps its cost: the snapshot records that loss
    if (c.value === 0 && !(c.costBasis !== null && c.costBasis > 0)) continue;
    const held = holdingsByCategory.get(category);
    const sources = (Object.keys(c.bySource) as HoldingSource[]).map(
      (source): SnapshotSourceEntry => {
        const list = held?.get(source);
        return {
          source,
          value: c.bySource[source] ?? 0,
          ...(list ? { holdings: list } : {}),
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
    if (previous && isFlowAdjustedCategory(category)) {
      const flow = categoryFlowFromHoldings(
        previous.find((p) => p.category === category),
        entry,
      );
      if (flow) {
        entry.netFlow = flow.total.amount;
        if (flow.total.estimated) entry.netFlowEstimated = true;
        for (const s of sources) {
          const f = flow.bySource.get(s.source)!;
          s.netFlow = f.amount;
          if (f.estimated) s.netFlowEstimated = true;
        }
      }
    }
    categoryBreakdown.push(entry);
  }

  return { categoryBreakdown, totalCostBasis, totalCoveredValue };
}

/** A breakdown without the holdings kept for the next day's flows. */
export function withoutSnapshotHoldings(
  breakdown: readonly SnapshotCategoryEntry[],
): SnapshotCategoryEntry[] {
  return breakdown.map((e) =>
    e.sources?.some((s) => s.holdings !== undefined)
      ? {
          ...e,
          sources: e.sources.map((s) => {
            const { holdings: _holdings, ...rest } = s;
            void _holdings;
            return rest;
          }),
        }
      : e,
  );
}

// ═══════════════════════════════════════════════════════════════
// External flows between snapshots
// ═══════════════════════════════════════════════════════════════
// Investment categories report performance net of money moved in and out
// (D2): P/L = change in value − net flows. Provider data carries no cash
// ledger, so the flow between two snapshots is derived holding by holding
// from what the snapshot writer stores; readers use the stored flows and
// only estimate where a row has none.

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
  /** Assumed (0) for a holding without a cost basis at one of the two ends */
  estimated: boolean;
}

/**
 * Net external flow into one holding between two snapshots:
 *
 * - it appears (no value before): its value now came in, a purchase or a
 *   newly connected account, never a gain;
 * - it disappears: its last value went out, a sale or a disconnection;
 * - a cost basis at both ends: a rise in cost is a purchase at that cost; a
 *   fall is a sale of that share of the holding, its proceeds estimated at
 *   the previous value. A cost paid in another currency is compared in
 *   that currency and the rise converted at today's rate, so an exchange
 *   rate move is performance, never a flow;
 * - otherwise the flow is assumed 0, so the change counts as performance,
 *   and flagged estimated. That includes a holding that gains or loses its
 *   cost basis (trades synced after the holdings, a missing rate): a change
 *   of coverage is not money moved, and its lifetime gain is not booked on
 *   the day it is first costed.
 */
export function holdingNetFlow(
  prev: SnapshotHoldingEntry | undefined,
  cur: SnapshotHoldingEntry | undefined,
): NetFlow {
  const before = prev?.value ?? 0;
  const after = cur?.value ?? 0;
  if (before === 0) return { amount: after, estimated: false };
  if (after === 0) return { amount: -before, estimated: false };
  if (prev!.cost === undefined || cur!.cost === undefined) {
    return { amount: 0, estimated: true };
  }

  const native =
    prev!.costNative !== undefined &&
    cur!.costNative !== undefined &&
    prev!.currency === cur!.currency;
  const prevCost = native ? prev!.costNative! : prev!.cost;
  const curCost = native ? cur!.costNative! : cur!.cost;
  const change = curCost - prevCost;
  if (change >= 0) {
    // Today's base value of one unit of the native cost
    const rate = native && curCost !== 0 ? cur!.cost / curCost : 1;
    return { amount: change * rate, estimated: false };
  }
  if (!(prevCost > 0)) return { amount: 0, estimated: true };
  return {
    amount: Math.max(change / prevCost, -1) * before,
    estimated: false,
  };
}

/** Sum of the holdings' flows of one source, null without holdings at an end. */
function sourceFlowFromHoldings(
  prev: SnapshotSourceEntry | undefined,
  cur: SnapshotSourceEntry | undefined,
): NetFlow | null {
  if ((prev && !prev.holdings) || (cur && !cur.holdings)) return null;
  const keys = new Set(
    [...(prev?.holdings ?? []), ...(cur?.holdings ?? [])].map((h) => h.key),
  );
  let amount = 0;
  let estimated = false;
  for (const key of keys) {
    const flow = holdingNetFlow(
      prev?.holdings?.find((h) => h.key === key),
      cur?.holdings?.find((h) => h.key === key),
    );
    amount += flow.amount;
    estimated ||= flow.estimated;
  }
  return { amount, estimated };
}

/**
 * Net external flow into a category between two snapshots, in total and per
 * source, from the holdings both rows store. Null when the previous row
 * (or a source in it) stores none: a row written before flows existed is
 * never compared with a new one, whose cost coverage it cannot match.
 */
export function categoryFlowFromHoldings(
  prev: SnapshotCategoryEntry | undefined,
  cur: SnapshotCategoryEntry | undefined,
): { total: NetFlow; bySource: Map<string, NetFlow> } | null {
  if ((prev && !prev.sources) || (cur && !cur.sources)) return null;
  const names = new Set(
    [...(prev?.sources ?? []), ...(cur?.sources ?? [])].map((s) => s.source),
  );
  const bySource = new Map<string, NetFlow>();
  const total: NetFlow = { amount: 0, estimated: false };
  for (const name of names) {
    const flow = sourceFlowFromHoldings(
      prev?.sources?.find((s) => s.source === name),
      cur?.sources?.find((s) => s.source === name),
    );
    if (!flow) return null;
    bySource.set(name, flow);
    total.amount += flow.amount;
    total.estimated ||= flow.estimated;
  }
  return { total, bySource };
}

/**
 * Net external flow into a category between two consecutive snapshots,
 * leaving out the `exclude`d sources (valued by another strategy): the
 * flow the snapshot writer stored, else an estimate from values alone
 * (valueOnlyFlow).
 */
export function snapshotCategoryFlow(
  prev: SnapshotCategoryEntry | undefined,
  cur: SnapshotCategoryEntry | undefined,
  exclude: ReadonlySet<string> = new Set(),
): NetFlow {
  return storedFlow(prev, cur, exclude) ?? valueOnlyFlow(prev, cur, exclude);
}

/** The stored flow less the excluded sources', null when not stored. */
function storedFlow(
  prev: SnapshotCategoryEntry | undefined,
  cur: SnapshotCategoryEntry | undefined,
  exclude: ReadonlySet<string>,
): NetFlow | null {
  if (cur?.netFlow === undefined) return null;
  if (exclude.size === 0) {
    return { amount: cur.netFlow, estimated: cur.netFlowEstimated ?? false };
  }
  if (!cur.sources) return null;
  let amount = cur.netFlow;
  let estimated = false;
  for (const s of cur.sources) {
    if (s.netFlow === undefined) return null;
    if (exclude.has(s.source)) amount -= s.netFlow;
    else estimated ||= s.netFlowEstimated ?? false;
  }
  for (const name of exclude) {
    if (cur.sources.some((s) => s.source === name)) continue;
    // Gone since the previous row: its flow was its last value going out
    amount += prev?.sources?.find((s) => s.source === name)?.value ?? 0;
  }
  return { amount, estimated };
}

/**
 * A flow estimated from values alone, for rows without a stored one: a
 * source (or, without per-source values, the category) that appears or
 * disappears is money in or out at its value; otherwise the flow is
 * assumed 0 and flagged estimated.
 */
function valueOnlyFlow(
  prev: SnapshotCategoryEntry | undefined,
  cur: SnapshotCategoryEntry | undefined,
  exclude: ReadonlySet<string>,
): NetFlow {
  const step = (before: number, after: number): NetFlow =>
    before === 0
      ? { amount: after, estimated: false }
      : after === 0
        ? { amount: -before, estimated: false }
        : { amount: 0, estimated: true };

  if ((!prev || prev.sources) && (!cur || cur.sources)) {
    const names = new Set(
      [...(prev?.sources ?? []), ...(cur?.sources ?? [])].map((s) => s.source),
    );
    let amount = 0;
    let estimated = false;
    for (const name of names) {
      if (exclude.has(name)) continue;
      const flow = step(
        prev?.sources?.find((s) => s.source === name)?.value ?? 0,
        cur?.sources?.find((s) => s.source === name)?.value ?? 0,
      );
      amount += flow.amount;
      estimated ||= flow.estimated;
    }
    return { amount, estimated };
  }

  const net = (e: SnapshotCategoryEntry | undefined) =>
    e
      ? e.value -
        [...exclude].reduce(
          (sum, name) =>
            sum + (e.sources?.find((s) => s.source === name)?.value ?? 0),
          0,
        )
      : 0;
  return step(net(prev), net(cur));
}
