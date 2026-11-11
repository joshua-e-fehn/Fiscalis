import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { InvestmentCategory } from "../lib/types/classification";
import {
  buildCategorySummary,
  positionToHolding,
} from "../../services/portfolio/categorySummary";

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

async function getBrokerPositionsForCategory(
  ctx: QueryCtx,
  userId: string,
  category: InvestmentCategory,
): Promise<CategoryPosition[]> {
  const positions = await ctx.db
    .query("brokerPositions")
    .withIndex("by_category", (q) =>
      q.eq("userId", userId).eq("investmentCategory", category),
    )
    .collect();
  return positions.map((p) => ({ ...p, provider: "snaptrade" as const }));
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

  const positions = [
    ...(await getBrokerPositionsForCategory(ctx, userId, category)),
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
      ...acc,
      institutionName: itemToInstitution.get(acc.itemId) ?? undefined,
    }));

    // Get all broker positions classified as cash, plus Bitpanda fiat cash
    const brokerCashPositions = [
      ...(await getBrokerPositionsForCategory(ctx, userId, "cash")),
      ...(await getBitpandaPositionsForCategory(ctx, userId, "cash")),
    ];

    // Get all broker positions to check which accounts have positions
    const allBrokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get broker accounts with cash balances (uninvested cash)
    const brokerAccounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Build a map of accounts that have positions
    const accountsWithPositions = new Set(
      allBrokerPositions.map((p) => p.accountId),
    );

    // For broker accounts, determine cash:
    // - If `cash` field is set, use it
    // - If no positions exist for the account and balance > 0, the balance IS cash
    const brokerAccountsWithCash = brokerAccounts.filter((acc) => {
      if ((acc.cash ?? 0) > 0) return true;
      // If no positions and balance > 0, treat balance as cash
      if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0)
        return true;
      return false;
    });

    // Helper to get effective cash for an account
    const getEffectiveCash = (acc: (typeof brokerAccounts)[0]) => {
      if ((acc.cash ?? 0) > 0) {
        return acc.cashValueInBaseCurrency ?? acc.cash ?? 0;
      }
      // If no positions and balance > 0, treat balance as cash
      if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0) {
        return acc.balance ?? 0;
      }
      return 0;
    };

    // Calculate totals
    const bankTotal = bankAccounts.reduce(
      (sum, acc) => sum + (acc.currentBalance ?? 0),
      0,
    );

    const brokerCashPositionsTotal = brokerCashPositions.reduce(
      (sum, pos) => sum + (pos.valueInBaseCurrency ?? pos.marketValue ?? 0),
      0,
    );

    const brokerAccountCashTotal = brokerAccountsWithCash.reduce(
      (sum, acc) => sum + getEffectiveCash(acc),
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
      bySubcategory[sub].total += acc.currentBalance ?? 0;
    }

    for (const pos of brokerCashPositions) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total +=
        pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
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

    // Get all Plaid accounts classified as liabilities
    const plaidLiabilities = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "liabilities"),
      )
      .collect();

    // Get broker positions classified as liabilities (margin loans)
    const brokerLiabilities = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "liabilities"),
      )
      .collect();

    // Get manual loans from the loans table (active loans only)
    const manualLoans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Calculate totals (liabilities are typically negative in balance sheets)
    const plaidTotal = plaidLiabilities.reduce(
      (sum, acc) => sum + Math.abs(acc.currentBalance ?? 0),
      0,
    );

    const brokerTotal = brokerLiabilities.reduce(
      (sum, pos) =>
        sum + Math.abs(pos.valueInBaseCurrency ?? pos.marketValue ?? 0),
      0,
    );

    const manualLoansTotal = manualLoans.reduce(
      (sum, loan) => sum + Math.abs(loan.currentBalance ?? 0),
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
      bySubcategory[sub].total += Math.abs(acc.currentBalance ?? 0);
    }

    for (const pos of brokerLiabilities) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total += Math.abs(
        pos.valueInBaseCurrency ?? pos.marketValue ?? 0,
      );
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
      manualLoans,
      summary: {
        totalLiabilities: plaidTotal + brokerTotal + manualLoansTotal,
        plaidTotal,
        brokerTotal,
        manualLoansTotal,
        accountCount:
          plaidLiabilities.length +
          brokerLiabilities.length +
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

    // Deduplicate the same economic event reported by multiple Bitpanda
    // endpoints (e.g. a buy appears in both /trades and /wallets/transactions
    // with different IDs). Collapse by a signature of the event itself.
    const seen = new Set<string>();
    const deduped = unified.filter((tx) => {
      const key = [
        tx.provider,
        tx.type,
        tx.symbol.toUpperCase(),
        tx.quantity.toFixed(8),
        tx.value.toFixed(2),
        tx.date.slice(0, 10), // day granularity (endpoints may differ by seconds)
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Most recent first
    deduped.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return deduped.slice(0, limit);
  },
});
