import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { InvestmentCategory } from "../lib/types/classification";
import {
  bankAccountValue,
  brokerAccountCash,
  brokerAccountMarginDebt,
  buildCategorySummary,
  loanBalanceInBase,
  loanCountsAsLiability,
  positionToHolding,
  positionValue,
} from "../../services/portfolio/categorySummary";
import {
  bankAccountWithBaseFields,
  brokerAccountWithBaseFields,
  positionWithBaseFields,
  type FxRates,
} from "../../services/finance/currency";
import { loadFxRates } from "./fxRates";

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
 * Broker positions in a category; rows stored before sync-time stamping get
 * their base-currency fields at read time (positionWithBaseFields).
 */
async function getBrokerPositionsForCategory(
  ctx: QueryCtx,
  userId: string,
  category: InvestmentCategory,
  rates: FxRates,
): Promise<CategoryPosition[]> {
  const positions = await ctx.db
    .query("brokerPositions")
    .withIndex("by_category", (q) =>
      q.eq("userId", userId).eq("investmentCategory", category),
    )
    .collect();
  return positions.map((p) => ({
    ...positionWithBaseFields(p, rates),
    provider: "snaptrade" as const,
  }));
}

async function getBitpandaPositionsForCategory(
  ctx: QueryCtx,
  userId: string,
  category: InvestmentCategory,
): Promise<CategoryPosition[]> {
  const holdings = await ctx.db
    .query("bitpandaHoldings")
    .withIndex("by_category", (q) =>
      q.eq("userId", userId).eq("investmentCategory", category),
    )
    .collect();
  return holdings.map((h) => ({ ...h, provider: "bitpanda" as const }));
}

/**
 * All positions in a category across providers, with the category summary
 * (value, cost-covered P&L and coverage, per subcategory too) computed by
 * the shared buildCategorySummary.
 */
async function getCategoryPositions(
  ctx: QueryCtx,
  category: InvestmentCategory,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const userId = identity.subject;
  const rates = await loadFxRates(ctx);

  const positions = [
    ...(await getBrokerPositionsForCategory(ctx, userId, category, rates)),
    ...(await getBitpandaPositionsForCategory(ctx, userId, category)),
  ];

  return {
    positions,
    summary: buildCategorySummary(positions.map(positionToHolding)),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    // Rows stored before sync-time stamping are stamped at read time
    const rates = await loadFxRates(ctx);

    // Get all Plaid accounts classified as cash
    const bankAccountsRaw = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "cash"),
      )
      .collect();

    // Get plaid items to map institution names
    const plaidItems = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Create a map of itemId to institution name
    const itemToInstitution = new Map(
      plaidItems.map((item) => [item.itemId, item.institutionName]),
    );

    // Enrich bank accounts with institution name
    const bankAccounts = bankAccountsRaw.map((acc) => ({
      ...bankAccountWithBaseFields(acc, rates),
      institutionName: itemToInstitution.get(acc.itemId) ?? undefined,
    }));

    // Get all broker positions classified as cash, plus Bitpanda fiat cash
    const brokerCashPositions = [
      ...(await getBrokerPositionsForCategory(ctx, userId, "cash", rates)),
      ...(await getBitpandaPositionsForCategory(ctx, userId, "cash")),
    ];

    // Get broker accounts with cash balances (uninvested cash)
    const brokerAccounts = (
      await ctx.db
        .query("brokerAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).map((acc) => brokerAccountWithBaseFields(acc, rates));

    // Broker account cash in EUR: the explicit cash balance the sync
    // stored (a margin debit is a liability, see getLiabilities); each row
    // carries it as cashInBaseCurrency for the per-row display
    const brokerAccountsWithCash = brokerAccounts
      .map((acc) => ({
        ...acc,
        cashInBaseCurrency: brokerAccountCash(acc),
      }))
      .filter((acc) => acc.cashInBaseCurrency > 0);

    // Calculate totals (base currency only)
    const bankTotal = bankAccounts.reduce(
      (sum, acc) => sum + bankAccountValue(acc),
      0,
    );

    const brokerCashPositionsTotal = brokerCashPositions.reduce(
      (sum, pos) => sum + positionValue(pos),
      0,
    );

    const brokerAccountCashTotal = brokerAccountsWithCash.reduce(
      (sum, acc) => sum + acc.cashInBaseCurrency,
      0,
    );

    // Group by subcategory
    const bySubcategory: Record<string, { count: number; total: number }> = {};

    for (const acc of bankAccounts) {
      const sub = acc.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total += bankAccountValue(acc);
    }

    for (const pos of brokerCashPositions) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total += positionValue(pos);
    }

    // Add broker account cash to "broker-cash" subcategory
    if (brokerAccountsWithCash.length > 0) {
      if (!bySubcategory["broker-cash"]) {
        bySubcategory["broker-cash"] = { count: 0, total: 0 };
      }
      bySubcategory["broker-cash"].count += brokerAccountsWithCash.length;
      bySubcategory["broker-cash"].total += brokerAccountCashTotal;
    }

    return {
      bankAccounts,
      brokerCash: brokerCashPositions,
      brokerAccountCash: brokerAccountsWithCash,
      summary: {
        totalValue:
          bankTotal + brokerCashPositionsTotal + brokerAccountCashTotal,
        bankTotal,
        brokerCashTotal: brokerCashPositionsTotal + brokerAccountCashTotal,
        accountCount:
          bankAccounts.length +
          brokerCashPositions.length +
          brokerAccountsWithCash.length,
        bySubcategory,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// LIABILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all liability holdings
 * Includes: mortgages, loans, credit cards, margin loans, manual loans
 */
export const getLiabilities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    // Rows stored before sync-time stamping are stamped at read time; loans
    // are converted here by their own currency
    const rates = await loadFxRates(ctx);

    // Get all Plaid accounts classified as liabilities
    const plaidLiabilities = (
      await ctx.db
        .query("plaidAccounts")
        .withIndex("by_category", (q) =>
          q.eq("userId", userId).eq("investmentCategory", "liabilities"),
        )
        .collect()
    ).map((acc) => bankAccountWithBaseFields(acc, rates));

    // Get broker positions classified as liabilities (margin loans)
    const brokerLiabilities = (
      await ctx.db
        .query("brokerPositions")
        .withIndex("by_category", (q) =>
          q.eq("userId", userId).eq("investmentCategory", "liabilities"),
        )
        .collect()
    ).map((pos) => positionWithBaseFields(pos, rates));

    // Broker accounts with a negative cash balance (margin debit), each
    // with the amount owed in EUR
    const brokerMarginAccounts = (
      await ctx.db
        .query("brokerAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    )
      .map((acc) => brokerAccountWithBaseFields(acc, rates))
      .map((acc) => ({
        ...acc,
        marginDebtInBaseCurrency: brokerAccountMarginDebt(acc),
      }))
      .filter((acc) => acc.marginDebtInBaseCurrency > 0);

    // Manual loans that count as liabilities (active and defaulted), each
    // with its outstanding balance in EUR for the per-row display
    const manualLoans = (
      await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    )
      .filter((loan) => loanCountsAsLiability(loan.status))
      .map((loan) => ({
        ...loan,
        valueInBaseCurrency: loanBalanceInBase(loan, rates),
      }));

    // Calculate totals in the base currency (liabilities as positive amounts)

    const plaidTotal = plaidLiabilities.reduce(
      (sum, acc) => sum + Math.abs(bankAccountValue(acc)),
      0,
    );

    const brokerTotal = brokerLiabilities.reduce(
      (sum, pos) => sum + Math.abs(positionValue(pos)),
      0,
    );

    const marginDebtTotal = brokerMarginAccounts.reduce(
      (sum, acc) => sum + acc.marginDebtInBaseCurrency,
      0,
    );

    const manualLoansTotal = manualLoans.reduce(
      (sum, loan) => sum + loan.valueInBaseCurrency,
      0,
    );

    // Group by subcategory
    const bySubcategory: Record<string, { count: number; total: number }> = {};

    for (const acc of plaidLiabilities) {
      const sub = acc.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total += Math.abs(bankAccountValue(acc));
    }

    for (const pos of brokerLiabilities) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total += Math.abs(positionValue(pos));
    }

    // Margin debits go into the "margin-loans" subcategory
    if (brokerMarginAccounts.length > 0) {
      if (!bySubcategory["margin-loans"]) {
        bySubcategory["margin-loans"] = { count: 0, total: 0 };
      }
      bySubcategory["margin-loans"].count += brokerMarginAccounts.length;
      bySubcategory["margin-loans"].total += marginDebtTotal;
    }

    // Manual loans go into the "loans" subcategory
    if (manualLoans.length > 0) {
      if (!bySubcategory["loans"]) {
        bySubcategory["loans"] = { count: 0, total: 0 };
      }
      bySubcategory["loans"].count += manualLoans.length;
      bySubcategory["loans"].total += manualLoansTotal;
    }

    return {
      plaidLiabilities,
      brokerLiabilities,
      brokerMarginAccounts,
      manualLoans,
      summary: {
        totalLiabilities:
          plaidTotal + brokerTotal + marginDebtTotal + manualLoansTotal,
        plaidTotal,
        brokerTotal: brokerTotal + marginDebtTotal,
        manualLoansTotal,
        accountCount:
          plaidLiabilities.length +
          brokerLiabilities.length +
          brokerMarginAccounts.length +
          manualLoans.length,
        bySubcategory,
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
    // (lib/bitpanda.ts dedupeAcrossEndpoints); every stored row is a
    // transaction of its own. Most recent first.
    unified.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return unified.slice(0, limit);
  },
});
