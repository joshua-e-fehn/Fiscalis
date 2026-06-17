import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type {
  InvestmentCategory,
  InvestmentSubcategory,
} from "../lib/types/classification";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch Bitpanda holdings for a category and present them with the same
 * fields broker positions expose, so category queries can merge them into
 * their `positions` array without changing the consumer shape.
 * (Bitpanda holdings carry no cost-basis / P&L, so those read as undefined.)
 */
async function getBitpandaPositionsForCategory(
  ctx: QueryCtx,
  userId: string,
  category: InvestmentCategory,
): Promise<Doc<"brokerPositions">[]> {
  const holdings = await ctx.db
    .query("bitpandaHoldings")
    .withIndex("by_category", (q) =>
      q.eq("userId", userId).eq("investmentCategory", category),
    )
    .collect();
  // Structurally compatible for the fields category consumers read
  // (_id, symbol, name, investmentSubcategory, valueInBaseCurrency, marketValue).
  return holdings as unknown as Doc<"brokerPositions">[];
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY-BASED QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all holdings for a specific investment category
 * Combines Plaid accounts and broker positions
 */
export const getHoldingsByCategory = query({
  args: {
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    const category = args.category as InvestmentCategory;

    // Get Plaid accounts in this category
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", category),
      )
      .collect();

    // Get broker positions in this category
    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", category),
      )
      .collect();

    return {
      plaidAccounts,
      brokerPositions,
      totalPlaidAccounts: plaidAccounts.length,
      totalBrokerPositions: brokerPositions.length,
    };
  },
});

/**
 * Get all holdings for a specific subcategory
 */
export const getHoldingsBySubcategory = query({
  args: {
    category: v.string(),
    subcategory: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    const category = args.category as InvestmentCategory;
    const subcategory = args.subcategory as InvestmentSubcategory;

    // Get Plaid accounts in this subcategory
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_subcategory", (q) =>
        q
          .eq("userId", userId)
          .eq("investmentCategory", category)
          .eq("investmentSubcategory", subcategory),
      )
      .collect();

    // Get broker positions in this subcategory
    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_subcategory", (q) =>
        q
          .eq("userId", userId)
          .eq("investmentCategory", category)
          .eq("investmentSubcategory", subcategory),
      )
      .collect();

    return {
      plaidAccounts,
      brokerPositions,
    };
  },
});

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
    const brokerCashPositionsRaw = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "cash"),
      )
      .collect();

    const brokerCashPositions = [
      ...brokerCashPositionsRaw,
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
 * Get all equity holdings
 * Includes: stocks, ETFs, mutual funds, options
 */
export const getEquities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const brokerEquities = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "equities"),
      )
      .collect();

    const positions = [
      ...brokerEquities,
      ...(await getBitpandaPositionsForCategory(ctx, userId, "equities")),
    ];

    // Calculate totals
    const totalValue = positions.reduce(
      (sum, pos) => sum + (pos.valueInBaseCurrency ?? pos.marketValue ?? 0),
      0,
    );

    const totalCostBasis = positions.reduce(
      (sum, pos) => sum + (pos.totalCostBasis ?? 0),
      0,
    );

    const totalUnrealizedPL = positions.reduce(
      (sum, pos) => sum + (pos.unrealizedPL ?? 0),
      0,
    );

    // Group by subcategory
    const bySubcategory: Record<string, { count: number; total: number }> = {};

    for (const pos of positions) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total +=
        pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
    }

    return {
      positions,
      summary: {
        totalValue,
        totalCostBasis,
        totalUnrealizedPL,
        positionCount: positions.length,
        bySubcategory,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// BONDS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all bond holdings
 */
export const getBonds = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const positions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "bonds"),
      )
      .collect();

    const totalValue = positions.reduce(
      (sum, pos) => sum + (pos.valueInBaseCurrency ?? pos.marketValue ?? 0),
      0,
    );

    // Group by subcategory
    const bySubcategory: Record<string, { count: number; total: number }> = {};

    for (const pos of positions) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total +=
        pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
    }

    return {
      positions,
      summary: {
        totalValue,
        positionCount: positions.length,
        bySubcategory,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// CRYPTO
// ═══════════════════════════════════════════════════════════════

/**
 * Get all crypto holdings
 */
export const getCrypto = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const brokerCrypto = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "crypto"),
      )
      .collect();

    const positions = [
      ...brokerCrypto,
      ...(await getBitpandaPositionsForCategory(ctx, userId, "crypto")),
    ];

    const totalValue = positions.reduce(
      (sum, pos) => sum + (pos.valueInBaseCurrency ?? pos.marketValue ?? 0),
      0,
    );

    // Group by subcategory
    const bySubcategory: Record<string, { count: number; total: number }> = {};

    for (const pos of positions) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total +=
        pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
    }

    return {
      positions,
      summary: {
        totalValue,
        positionCount: positions.length,
        bySubcategory,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// REAL ESTATE (from broker positions - REITs)
// ═══════════════════════════════════════════════════════════════

/**
 * Get all real estate holdings from broker positions
 * Primarily REITs - physical real estate is manual entry
 */
export const getRealEstate = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const positions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "real-estate"),
      )
      .collect();

    const totalValue = positions.reduce(
      (sum, pos) => sum + (pos.valueInBaseCurrency ?? pos.marketValue ?? 0),
      0,
    );

    // Group by subcategory
    const bySubcategory: Record<string, { count: number; total: number }> = {};

    for (const pos of positions) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total +=
        pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
    }

    return {
      positions,
      summary: {
        totalValue,
        positionCount: positions.length,
        bySubcategory,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// COMMODITIES (from broker positions - excluding precious metals vault)
// ═══════════════════════════════════════════════════════════════

/**
 * Get commodity holdings from broker positions
 * Note: Precious metals vault data is handled separately via the vault system
 */
export const getCommodities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const brokerCommodities = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "commodities"),
      )
      .collect();

    const positions = [
      ...brokerCommodities,
      ...(await getBitpandaPositionsForCategory(ctx, userId, "commodities")),
    ];

    const totalValue = positions.reduce(
      (sum, pos) => sum + (pos.valueInBaseCurrency ?? pos.marketValue ?? 0),
      0,
    );

    // Group by subcategory
    const bySubcategory: Record<string, { count: number; total: number }> = {};

    for (const pos of positions) {
      const sub = pos.investmentSubcategory ?? "unknown";
      if (!bySubcategory[sub]) {
        bySubcategory[sub] = { count: 0, total: 0 };
      }
      bySubcategory[sub].count++;
      bySubcategory[sub].total +=
        pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
    }

    return {
      positions,
      summary: {
        totalValue,
        positionCount: positions.length,
        bySubcategory,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// PORTFOLIO OVERVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Get portfolio summary by category
 * Returns total values and counts for each investment category
 */
export const getPortfolioSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    // Get all Plaid accounts
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get all broker positions
    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Build category summary
    const categories: Record<string, { value: number; count: number }> = {};

    // Add Plaid accounts to categories
    for (const acc of plaidAccounts) {
      const cat = acc.investmentCategory ?? "unclassified";
      if (!categories[cat]) {
        categories[cat] = { value: 0, count: 0 };
      }
      categories[cat].count++;
      // For liabilities, store as negative for net worth calculation
      const balance = acc.currentBalance ?? 0;
      categories[cat].value +=
        cat === "liabilities" ? -Math.abs(balance) : balance;
    }

    // Add broker positions to categories
    for (const pos of brokerPositions) {
      const cat = pos.investmentCategory ?? "unclassified";
      if (!categories[cat]) {
        categories[cat] = { value: 0, count: 0 };
      }
      categories[cat].count++;
      const value = pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
      categories[cat].value += cat === "liabilities" ? -Math.abs(value) : value;
    }

    // Add Bitpanda holdings to categories
    const bitpandaHoldings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const h of bitpandaHoldings) {
      const cat = h.investmentCategory ?? "unclassified";
      if (!categories[cat]) {
        categories[cat] = { value: 0, count: 0 };
      }
      categories[cat].count++;
      const value = h.valueInBaseCurrency ?? h.marketValue ?? 0;
      categories[cat].value += cat === "liabilities" ? -Math.abs(value) : value;
    }

    // Calculate totals
    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const [cat, data] of Object.entries(categories)) {
      if (cat === "liabilities") {
        totalLiabilities = Math.abs(data.value);
      } else if (cat !== "unclassified") {
        totalAssets += data.value;
      }
    }

    const netWorth = totalAssets - totalLiabilities;

    return {
      categories,
      summary: {
        totalAssets,
        totalLiabilities,
        netWorth,
        totalAccounts: plaidAccounts.length,
        totalPositions: brokerPositions.length + bitpandaHoldings.length,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// UNCLASSIFIED ITEMS
// ═══════════════════════════════════════════════════════════════

/**
 * Get items that haven't been classified yet
 * Useful for identifying data that needs manual review
 */
export const getUnclassifiedItems = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    // Get unclassified Plaid accounts
    const unclassifiedAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.or(
          q.eq(q.field("investmentCategory"), undefined),
          q.eq(q.field("investmentCategory"), null),
        ),
      )
      .collect();

    // Get unclassified broker positions
    const unclassifiedPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.or(
          q.eq(q.field("investmentCategory"), undefined),
          q.eq(q.field("investmentCategory"), null),
        ),
      )
      .collect();

    return {
      accounts: unclassifiedAccounts,
      positions: unclassifiedPositions,
      totalUnclassified:
        unclassifiedAccounts.length + unclassifiedPositions.length,
    };
  },
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

    // Symbols held as crypto on Bitpanda
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
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const tx of bitpandaTransactions) {
      if (!bitpandaCryptoSymbols.has(tx.symbol.toUpperCase())) continue;
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
