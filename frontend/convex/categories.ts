import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { InvestmentCategory } from "../lib/types/classification";
import { getUserId } from "./lib/auth";
import { loadHoldings, type LoadedHolding } from "./lib/netWorth";
import {
  aggregateNetWorth,
  CREDIT_BALANCE_SUBCATEGORY,
  placeHolding,
  profitLossCostBase,
  type CategoryAggregate,
  type HoldingSource,
  type NetWorthAggregate,
} from "../../services/portfolio/aggregate";
import type { CategoryHolding } from "../../services/portfolio/categorySummary";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * A position in a category, from any provider. `provider` discriminates the
 * stored document: SnapTrade broker positions carry cost basis and P&L,
 * Bitpanda holdings do not (those fields are always undefined for them).
 */
export type CategoryPosition =
  | (Doc<"brokerPositions"> & { provider: "snaptrade" })
  | (Doc<"bitpandaHoldings"> & {
      provider: "bitpanda";
      totalCostBasis?: undefined;
      unrealizedPL?: undefined;
    });

/**
 * The user's holdings and their aggregate (lib/netWorth.ts loadHoldings,
 * services/portfolio/aggregate.ts): every category query reads through the
 * same loader as the server-side net worth, so a category page, the
 * dashboard and the snapshots always agree. Null when unauthenticated.
 */
async function loadAggregate(
  ctx: QueryCtx,
): Promise<{
  userId: string;
  holdings: LoadedHolding[];
  aggregate: NetWorthAggregate;
} | null> {
  const userId = await getUserId(ctx);
  if (!userId) return null;
  const holdings = await loadHoldings(ctx, userId);
  return { userId, holdings, aggregate: aggregateNetWorth(holdings) };
}

/** The holdings counted in a category (a credit balance counts as cash). */
function inCategory(
  holdings: LoadedHolding[],
  category: InvestmentCategory,
): LoadedHolding[] {
  return holdings.filter((h) => placeHolding(h).category === category);
}

/** The provider positions (broker, Bitpanda) among some holdings. */
function toCategoryPositions(holdings: LoadedHolding[]): CategoryPosition[] {
  const positions: CategoryPosition[] = [];
  for (const h of holdings) {
    if (h.source === "brokerPosition") {
      positions.push({ ...h.doc, provider: "snaptrade" });
    } else if (h.source === "bitpanda") {
      positions.push({ ...h.doc, provider: "bitpanda" });
    }
  }
  return positions;
}

/**
 * The vault items among some holdings as top-holding rows: EUR value at the
 * spot mirror and cost, as the aggregate counts them (lib/netWorth.ts), named
 * like the vault pages (custom name, else the catalog name).
 */
async function toVaultHoldings(
  ctx: QueryCtx,
  holdings: LoadedHolding[],
): Promise<CategoryHolding[]> {
  return await Promise.all(
    holdings.flatMap((h) =>
      h.source === "vault"
        ? [
            (async () => {
              const catalog = h.doc.catalogItemId
                ? await ctx.db.get(h.doc.catalogItemId)
                : null;
              return {
                id: h.id,
                name: h.doc.customName || catalog?.name || h.name,
                subcategory: h.subcategory,
                value: h.valueBase,
                // None when valued at cost: its P/L is unknown
                costBasis: profitLossCostBase(h),
              };
            })(),
          ]
        : [],
    ),
  );
}

/** Per-subcategory count and total of a category aggregate. */
function subcategoryTotals(
  category: CategoryAggregate,
): Record<string, { count: number; total: number }> {
  return Object.fromEntries(
    Object.entries(category.bySubcategory).map(([sub, s]) => [
      sub,
      { count: s.count, total: s.value },
    ]),
  );
}

function sourceTotal(
  category: CategoryAggregate,
  sources: HoldingSource[],
): number {
  return sources.reduce((sum, s) => sum + (category.bySource[s] ?? 0), 0);
}

/**
 * All positions in a category across providers, with the category summary
 * (value, cost-covered P&L and coverage, per subcategory too) from the
 * shared aggregator. Vault items (manual metals, commodities only) have no
 * position row and come as vaultHoldings. The summary also counts
 * account-level holdings that have no row (a Plaid investment account
 * classified into the category); accountLevelValue is their total, so the
 * positions and vaultHoldings sum to summary.value − accountLevelValue.
 */
async function getCategoryPositions(
  ctx: QueryCtx,
  category: InvestmentCategory,
) {
  const loaded = await loadAggregate(ctx);
  if (!loaded) return null;
  const holdings = inCategory(loaded.holdings, category);
  const summary = loaded.aggregate.byCategory[category];
  return {
    positions: toCategoryPositions(holdings),
    vaultHoldings: await toVaultHoldings(ctx, holdings),
    summary,
    accountLevelValue: sourceTotal(summary, ["bank"]),
  };
}

// ═══════════════════════════════════════════════════════════════
// CASH & MONEY MARKETS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all cash & money market holdings
 * Includes: checking, savings, money market, CDs, broker cash, forex
 */
export const getCashHoldings = query({
  args: {},
  handler: async (ctx) => {
    const loaded = await loadAggregate(ctx);
    if (!loaded) return null;
    const { userId } = loaded;
    const cash = inCategory(loaded.holdings, "cash");
    const summary = loaded.aggregate.byCategory.cash;

    // Institution names for the bank accounts
    const plaidItems = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const itemToInstitution = new Map(
      plaidItems.map((item) => [item.itemId, item.institutionName]),
    );

    const bankAccounts = cash.flatMap((h) =>
      h.source === "bank" && h.category === "cash"
        ? [
            {
              ...h.doc,
              institutionName:
                itemToInstitution.get(h.doc.itemId) ?? undefined,
            },
          ]
        : [],
    );

    // Uninvested broker account cash, each row with its EUR amount (a
    // margin debit is a liability, see getLiabilities)
    const brokerAccountCash = cash.flatMap((h) =>
      h.source === "brokerAccount"
        ? [{ ...h.doc, cashInBaseCurrency: h.valueBase }]
        : [],
    );

    // Totals per source that reconcile with the rows: a credit balance (a
    // card or an overpaid loan, money owed to the user) is its own total
    let bankTotal = 0;
    let brokerCashTotal = 0;
    let bitpandaTotal = 0;
    let creditBalanceTotal = 0;
    for (const h of cash) {
      const { subcategory, value } = placeHolding(h);
      if (subcategory === CREDIT_BALANCE_SUBCATEGORY) creditBalanceTotal += value;
      else if (h.source === "bank") bankTotal += value;
      else if (h.source === "brokerAccount" || h.source === "brokerPosition")
        brokerCashTotal += value;
      else if (h.source === "bitpanda") bitpandaTotal += value;
    }

    return {
      bankAccounts,
      brokerCash: toCategoryPositions(cash),
      brokerAccountCash,
      summary: {
        totalValue: summary.value,
        bankTotal,
        brokerCashTotal,
        bitpandaTotal,
        creditBalanceTotal,
        accountCount: summary.count,
        bySubcategory: subcategoryTotals(summary),
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// LIABILITIES
// ═══════════════════════════════════════════════════════════════

/** One liability row: the amount owed in EUR (positive). */
export interface LiabilityRow {
  id: string;
  source: HoldingSource;
  name: string;
  subcategory: string;
  owedInBaseCurrency: number;
}

/**
 * Get all liability holdings: Plaid credit and loan accounts, broker margin
 * debits and liability positions, Bitpanda liabilities and manual loans
 * (active and defaulted). Totals come from the shared aggregator, so they
 * equal the dashboard's and the snapshots' liabilities; a credit balance
 * counts as cash there, not as negative debt.
 */
export const getLiabilities = query({
  args: {},
  handler: async (ctx) => {
    const loaded = await loadAggregate(ctx);
    if (!loaded) return null;
    const { aggregate } = loaded;
    const summary = aggregate.byCategory.liabilities;

    const rows: LiabilityRow[] = inCategory(
      loaded.holdings,
      "liabilities",
    ).map((h) => ({
      id: h.id,
      source: h.source,
      name: h.name,
      subcategory: h.subcategory,
      owedInBaseCurrency: h.valueBase,
    }));

    return {
      rows,
      summary: {
        totalLiabilities: summary.value,
        // Non-loan liabilities; loans are counted in loansCount
        accountCount: aggregate.liabilityAccountsCount,
        loansCount: aggregate.loansCount,
        monthlyPayment: aggregate.monthlyLoanPayment,
        bySubcategory: subcategoryTotals(summary),
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// EQUITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all equity holdings (stocks, ETFs, funds, options) across providers
 */
export const getEquities = query({
  args: {},
  handler: (ctx) => getCategoryPositions(ctx, "equities"),
});

// ═══════════════════════════════════════════════════════════════
// BONDS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all bond holdings across providers
 */
export const getBonds = query({
  args: {},
  handler: (ctx) => getCategoryPositions(ctx, "bonds"),
});

// ═══════════════════════════════════════════════════════════════
// CRYPTO
// ═══════════════════════════════════════════════════════════════

/**
 * Get all crypto holdings across providers
 */
export const getCrypto = query({
  args: {},
  handler: (ctx) => getCategoryPositions(ctx, "crypto"),
});

// ═══════════════════════════════════════════════════════════════
// COMMODITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all commodity holdings: vault metals valued at the spot mirror, plus
 * Bitpanda and broker metals and other commodities, so the commodities page
 * covers the same holdings as the dashboard and the snapshots (M-A1)
 */
export const getCommodities = query({
  args: {},
  handler: (ctx) => getCategoryPositions(ctx, "commodities"),
});

// ═══════════════════════════════════════════════════════════════
// REAL ESTATE
// ═══════════════════════════════════════════════════════════════

/**
 * Get all real estate holdings across providers (primarily REITs; physical
 * real estate is manual entry)
 */
export const getRealEstate = query({
  args: {},
  handler: (ctx) => getCategoryPositions(ctx, "real-estate"),
});

// ═══════════════════════════════════════════════════════════════
// CRYPTO TRANSACTIONS (unified: Bitpanda + broker crypto)
// ═══════════════════════════════════════════════════════════════

/**
 * Get unified crypto transactions for the current user.
 * Sources Bitpanda transactions whose symbol is a held crypto asset, plus
 * broker (SnapTrade) transactions for symbols classified as crypto.
 */
export const getCryptoTransactions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;
    const limit = args.limit ?? 100;

    // Fallback only: symbols currently held as crypto on Bitpanda. Used to
    // classify transactions synced before assetType was stored on them.
    const bitpandaCryptoHoldings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "crypto"),
      )
      .collect();
    const bitpandaCryptoSymbols = new Set(
      bitpandaCryptoHoldings.map((h) => h.symbol.toUpperCase()),
    );

    // Symbols held as crypto via brokers
    const brokerCryptoPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "crypto"),
      )
      .collect();
    const brokerCryptoSymbols = new Set(
      brokerCryptoPositions.map((p) => p.symbol.toUpperCase()),
    );

    const unified: Array<{
      _id: string;
      provider: "bitpanda" | "snaptrade";
      type: string;
      symbol: string;
      quantity: number;
      value: number;
      currency: string;
      date: string;
    }> = [];

    const bitpandaTransactions = await ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_date", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    for (const tx of bitpandaTransactions) {
      // Prefer the asset class stored on the transaction (independent of
      // current holdings); fall back to the held-symbol set for rows synced
      // before assetType was recorded.
      const isCrypto = tx.assetType
        ? tx.assetType === "crypto"
        : bitpandaCryptoSymbols.has(tx.symbol.toUpperCase());
      if (!isCrypto) continue;
      unified.push({
        _id: tx._id,
        provider: "bitpanda",
        type: tx.type,
        symbol: tx.symbol,
        quantity: tx.quantity,
        value: tx.amount,
        currency: tx.currency,
        date: tx.transactionDate,
      });
    }

    const brokerTransactions = await ctx.db
      .query("brokerTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const tx of brokerTransactions) {
      const symbol = tx.symbol?.toUpperCase();
      if (!symbol || !brokerCryptoSymbols.has(symbol)) continue;
      unified.push({
        _id: tx._id,
        provider: "snaptrade",
        type: tx.type,
        symbol: tx.symbol ?? "",
        quantity: tx.quantity ?? 0,
        value: tx.amount,
        currency: tx.currency,
        date: tx.tradeDate,
      });
    }

    // Bitpanda's cross-endpoint copies are removed once, at sync time
    // (services/bitpanda/normalize.ts dedupeAcrossEndpoints); every stored
    // row is a transaction of its own. Most recent first.
    unified.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return unified.slice(0, limit);
  },
});
