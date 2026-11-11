import { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { loadFxRates } from "../fxRates";
import {
  bankAccountWithBaseFields,
  brokerAccountWithBaseFields,
  positionWithBaseFields,
} from "../../../services/finance/currency";
import { valueVaultItem } from "../../../services/finance/metals";
import {
  bankAccountValue,
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
  toHoldingCategory,
  type NormalizedHolding,
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
 *   credit/loan balance as reported, a provider position's negative value
 *   negated, a broker account's margin debit, a loan's balance.
 * - Vault items are valued at live spot (metalSpotPrices) with the shared
 *   metals valuation, falling back to cost when no fresh spot price exists.
 * - Loans count when active or defaulted (D1).
 */

type BankAccountDoc = Doc<"plaidAccounts">;
type BrokerPositionDoc = Doc<"brokerPositions">;
type BrokerAccountDoc = Doc<"brokerAccounts">;

/** A holding together with the stored document it was read from. */
export type LoadedHolding =
  | (NormalizedHolding & { source: "bank"; doc: BankAccountDoc })
  | (NormalizedHolding & { source: "brokerPosition"; doc: BrokerPositionDoc })
  | (NormalizedHolding & { source: "brokerAccount"; doc: BrokerAccountDoc })
  | (NormalizedHolding & {
      source: "bitpanda";
      doc: Doc<"bitpandaHoldings">;
    })
  | (NormalizedHolding & { source: "vault"; doc: Doc<"vaultItems"> })
  | (NormalizedHolding & { source: "loan"; doc: Doc<"loans"> });

/** Amount owed for a provider position classified as a liability. */
function positionOwed(value: number): number {
  // A debt is stored as a negative position value (e.g. negative cash)
  return -value;
}

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
    holdings.push({
      id: doc._id,
      provider: "snaptrade",
      source: "brokerPosition",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: category === "liabilities" ? positionOwed(value) : value,
      costBase: positionCostBasis(doc),
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
  for (const doc of bitpandaHoldings) {
    const category = toHoldingCategory(doc.investmentCategory);
    const value = positionValue(doc);
    holdings.push({
      id: doc._id,
      provider: "bitpanda",
      source: "bitpanda",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: category === "liabilities" ? positionOwed(value) : value,
      // Bitpanda reports no cost basis
      costBase: null,
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
      const { value, cost, pricedAtSpot } = valueVaultItem(doc, spot, now);
      holdings.push({
        id: doc._id,
        provider: "manual",
        source: "vault",
        category: "commodities",
        subcategory: "metals",
        name: doc.customName ?? doc.metalType,
        valueBase: value,
        costBase: cost,
        // Valued at cost without a fresh spot price: no market timestamp
        pricedAt: pricedAtSpot && spot ? spot.sourceTimestamp : null,
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
 * the snapshot's category breakdown and cost totals.
 */
export async function computeNetWorth(ctx: QueryCtx, userId: string) {
  const aggregate = aggregateNetWorth(await loadHoldings(ctx, userId));
  const { categoryBreakdown, totalCostBasis, totalCoveredValue } =
    buildSnapshotBreakdown(aggregate);

  return {
    totalAssets: aggregate.totalAssets,
    totalLiabilities: aggregate.totalLiabilities,
    netWorth: aggregate.netWorth,
    totalCostBasis,
    totalCoveredValue,
    categoryBreakdown,
    asOf: aggregate.asOf,
  };
}
