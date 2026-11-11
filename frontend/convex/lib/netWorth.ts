import { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { loadFxRates } from "../fxRates";
import {
  BASE_CURRENCY,
  bankAccountWithBaseFields,
  brokerAccountWithBaseFields,
  positionWithBaseFields,
  toBase,
} from "../../../services/finance/currency";
import { valueVaultItem } from "../../../services/finance/metals";
import {
  averageCostPerUnit,
  bankAccountValue,
  type AverageCost,
  bitpandaCostBasis,
  brokerAccountCash,
  brokerAccountMarginDebt,
  loanBalanceInBase,
  loanCountsAsLiability,
  loanMonthlyPaymentInBase,
  positionCostBasis,
  positionValue,
} from "../../../services/portfolio/categorySummary";
import {
  aggregateNetWorth,
  buildSnapshotBreakdown,
  positionOwed,
  toHoldingCategory,
  type NormalizedHolding,
  type SnapshotCategoryEntry,
} from "../../../services/portfolio/aggregate";

/**
 * The one loader behind every net-worth figure: it reads each provider table
 * once and maps every row to a NormalizedHolding, which
 * services/portfolio/aggregate.ts groups and totals. computeNetWorth
 * (snapshots, GET /api/v1/net-worth), portfolio.getOverview (dashboard,
 * liabilities, retirement), portfolio.getUnifiedPositions and the
 * categories.* queries all read through it, so they always agree.
 *
 * - Values are in the base currency (EUR): provider documents are read only
 *   through their *InBaseCurrency fields, stamped at sync time from the
 *   fxRates mirror (rows stored before that are stamped here), and manual
 *   loans are converted by their currency. An amount without a rate counts
 *   0, never 1:1 as EUR.
 * - The category is the stored investmentCategory, which already reflects
 *   user overrides; a missing one is "unclassified".
 * - A liability's value is the amount owed (positive = owed): a Plaid
 *   credit/loan balance as reported, a provider position's absolute value
 *   (positionOwed), a broker account's margin debit, a loan's balance.
 * - Vault items are valued at live spot (metalSpotPrices) with the shared
 *   metals valuation, falling back to cost when no fresh spot price exists.
 * - A Bitpanda holding's cost basis is the average cost of its symbol from
 *   the synced trades (rewards at no cost) times the quantity held, and
 *   none when more is held than the trades account for (categorySummary.ts
 *   averageCostPerUnit, bitpandaCostBasis); Bitpanda reports none itself.
 * - Each holding carries a key that survives provider re-syncs, and a
 *   foreign-currency position its native cost, for the snapshot flows
 *   (aggregate.ts holdingNetFlow).
 * - Loans count when active or defaulted (D1).
 */

type BankAccountDoc = Doc<"plaidAccounts">;
type BrokerPositionDoc = Doc<"brokerPositions">;
type BrokerAccountDoc = Doc<"brokerAccounts">;
/** A Bitpanda holding with its cost basis derived from the synced trades */
type BitpandaHoldingDoc = Doc<"bitpandaHoldings"> & {
  costBasisInBaseCurrency?: number;
};

/** A holding together with the stored document it was read from. */
export type LoadedHolding =
  | (NormalizedHolding & { source: "bank"; doc: BankAccountDoc })
  | (NormalizedHolding & { source: "brokerPosition"; doc: BrokerPositionDoc })
  | (NormalizedHolding & { source: "brokerAccount"; doc: BrokerAccountDoc })
  | (NormalizedHolding & { source: "bitpanda"; doc: BitpandaHoldingDoc })
  | (NormalizedHolding & { source: "vault"; doc: Doc<"vaultItems"> })
  | (NormalizedHolding & { source: "loan"; doc: Doc<"loans"> });

export async function loadHoldings(
  ctx: QueryCtx,
  userId: string,
): Promise<LoadedHolding[]> {
  const rates = await loadFxRates(ctx);
  const now = Date.now();
  const holdings: LoadedHolding[] = [];

  // 1. Bank accounts (Plaid)
  const bankAccounts = await ctx.db
    .query("plaidAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const raw of bankAccounts) {
    const doc = bankAccountWithBaseFields(raw, rates);
    const category = toHoldingCategory(doc.investmentCategory);
    holdings.push({
      id: doc._id,
      key: `bank:${doc.accountId}`,
      provider: "plaid",
      source: "bank",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.name || doc.officialName || "Account",
      // Plaid reports a credit/loan balance as the amount owed
      valueBase: bankAccountValue(doc),
      costBase: null,
      pricedAt: doc.lastSynced,
      doc,
    });
  }

  // 2. Broker positions and account cash (SnapTrade)
  const brokerPositions = await ctx.db
    .query("brokerPositions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const raw of brokerPositions) {
    const doc = positionWithBaseFields(raw, rates);
    const category = toHoldingCategory(doc.investmentCategory);
    const value = positionValue(doc);
    const costBase = positionCostBasis(doc);
    holdings.push({
      id: doc._id,
      // Positions are replaced on every sync; the account and symbol stay
      key: `brokerPosition:${doc.accountId}:${doc.symbol}`,
      provider: "snaptrade",
      source: "brokerPosition",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: category === "liabilities" ? positionOwed(value) : value,
      costBase,
      ...(costBase !== null &&
      doc.totalCostBasis !== undefined &&
      doc.currency !== BASE_CURRENCY
        ? { costNative: { amount: doc.totalCostBasis, currency: doc.currency } }
        : {}),
      pricedAt: doc.lastSyncAt ?? doc.createdAt,
      doc,
    });
  }

  const brokerAccounts = await ctx.db
    .query("brokerAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const raw of brokerAccounts) {
    const doc = brokerAccountWithBaseFields(raw, rates);
    const cash = brokerAccountCash(doc);
    const marginDebt = brokerAccountMarginDebt(doc);
    if (cash <= 0 && marginDebt <= 0) continue;
    const isDebit = marginDebt > 0;
    holdings.push({
      id: doc._id,
      provider: "snaptrade",
      source: "brokerAccount",
      category: isDebit ? "liabilities" : "cash",
      subcategory: isDebit ? "margin-loans" : "broker-cash",
      name: `${doc.institutionName || doc.name} - ${isDebit ? "Margin" : "Cash"}`,
      valueBase: isDebit ? marginDebt : cash,
      costBase: null,
      pricedAt: doc.lastSyncAt ?? doc.createdAt,
      doc,
    });
  }

  // 3. Bitpanda holdings (crypto, metals, stocks, fiat; values in EUR)
  const bitpandaHoldings = await ctx.db
    .query("bitpandaHoldings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const averageCost =
    bitpandaHoldings.length > 0
      ? averageCostPerUnit(
          await ctx.db
            .query("bitpandaTransactions")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect(),
          (amount, currency) => {
            const converted = toBase(amount, currency, rates);
            return converted.ok ? converted.value : null;
          },
        )
      : new Map<string, AverageCost>();
  for (const raw of bitpandaHoldings) {
    const category = toHoldingCategory(raw.investmentCategory);
    const value = positionValue(raw);
    const cost =
      category === "liabilities" ? undefined : bitpandaCostBasis(raw, averageCost);
    const doc: BitpandaHoldingDoc =
      cost === undefined ? raw : { ...raw, costBasisInBaseCurrency: cost.base };
    holdings.push({
      id: doc._id,
      // Holdings are replaced on every sync; the connection and asset stay
      key: `bitpanda:${doc.connectionId}:${doc.assetType}:${doc.symbol.toUpperCase()}`,
      provider: "bitpanda",
      source: "bitpanda",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: category === "liabilities" ? positionOwed(value) : value,
      costBase: cost?.base ?? null,
      // A foreign-currency cost stays put when the rate moves, so the
      // snapshot flow is read from it (holdingNetFlow)
      ...(cost?.native ? { costNative: cost.native } : {}),
      pricedAt: doc.lastSyncAt ?? doc.createdAt,
      doc,
    });
  }

  // 4. Vault items (manual precious metals), valued at live spot
  const vaultItems = await ctx.db
    .query("vaultItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (vaultItems.length > 0) {
    const spotByMetal = new Map(
      (await ctx.db.query("metalSpotPrices").collect()).map((p) => [
        p.metalType,
        p,
      ]),
    );
    for (const doc of vaultItems) {
      const spot = spotByMetal.get(doc.metalType);
      const { value, cost } = valueVaultItem(doc, spot, now);
      holdings.push({
        id: doc._id,
        provider: "manual",
        source: "vault",
        category: "commodities",
        subcategory: "metals",
        name: doc.customName ?? doc.metalType,
        valueBase: value,
        costBase: cost,
        // The spot row's timestamp even when it is stale and the item fell
        // back to cost, so a stale price pulls asOf back; null only without
        // any spot row
        pricedAt: spot ? spot.sourceTimestamp : null,
        doc,
      });
    }
  }

  // 5. Manual loans that count as liabilities (active, defaulted)
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const doc of loans) {
    if (!loanCountsAsLiability(doc.status)) continue;
    holdings.push({
      id: doc._id,
      provider: "manual",
      source: "loan",
      category: "liabilities",
      subcategory: "loans",
      name: doc.name,
      valueBase: loanBalanceInBase(doc, rates),
      costBase: null,
      pricedAt: null,
      monthlyPaymentBase: loanMonthlyPaymentInBase(doc, rates),
      doc,
    });
  }

  return holdings;
}

/**
 * Server-side net worth for one user: the aggregate of loadHoldings plus
 * the snapshot's category breakdown and cost totals. With the previous
 * snapshot's breakdown, each entry also records its net flow since then.
 * `asOf` is the data's freshness (the oldest pricedAt), not the call time.
 */
export async function computeNetWorth(
  ctx: QueryCtx,
  userId: string,
  previousBreakdown?: readonly SnapshotCategoryEntry[],
) {
  const holdings = await loadHoldings(ctx, userId);
  const aggregate = aggregateNetWorth(holdings);
  const { categoryBreakdown, totalCostBasis, totalCoveredValue } =
    buildSnapshotBreakdown(aggregate, holdings, previousBreakdown);

  return {
    totalAssets: aggregate.totalAssets,
    totalLiabilities: aggregate.totalLiabilities,
    netWorth: aggregate.netWorth,
    totalCostBasis,
    totalCoveredValue,
    categoryBreakdown,
    asOf: aggregate.asOf,
    // Every category with its subcategories and sources, for the public API
    byCategory: aggregate.byCategory,
  };
}
