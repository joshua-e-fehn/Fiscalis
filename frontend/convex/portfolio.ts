import { v } from "convex/values";
import { query } from "./_generated/server";
import { getUserId } from "./lib/auth";
import { loadHoldings, type LoadedHolding } from "./lib/netWorth";
import {
  aggregateNetWorth,
  HOLDING_CATEGORIES,
  placeHolding,
} from "../../services/portfolio/aggregate";
import { holdingProfitLoss } from "../../services/portfolio/categorySummary";

/**
 * Portfolio Queries
 *
 * Read through the one net-worth loader (lib/netWorth.ts loadHoldings) and
 * aggregator (services/portfolio/aggregate.ts), the same path as the
 * snapshots and GET /api/v1/net-worth.
 */

// ═══════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Net worth, per-category values and costs, and the liabilities summary for
 * the dashboard, the liabilities page and the retirement funding base.
 * Values are in the base currency (EUR); liabilities are positive amounts
 * owed. Null when unauthenticated.
 */
export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const aggregate = aggregateNetWorth(await loadHoldings(ctx, userId));

    return {
      totalAssets: aggregate.totalAssets,
      totalLiabilities: aggregate.totalLiabilities,
      netWorth: aggregate.netWorth,
      unrealized: aggregate.unrealized,
      categories: HOLDING_CATEGORIES.map((category) => {
        const c = aggregate.byCategory[category];
        return {
          category,
          value: c.value,
          count: c.count,
          costBasis: c.costBasis,
          coveredValue: c.coveredValue,
          profitLoss: c.profitLoss,
          profitLossPercent: c.profitLossPercent,
          coverage: c.coverage,
        };
      }),
      liabilities: {
        totalBalance: aggregate.totalLiabilities,
        // Non-loan liabilities; loans are counted in loansCount
        accountsCount: aggregate.liabilityAccountsCount,
        loansCount: aggregate.loansCount,
        monthlyPayment: aggregate.monthlyLoanPayment,
      },
      asOf: aggregate.asOf,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// UNIFIED POSITIONS
// ═══════════════════════════════════════════════════════════════

const METAL_SYMBOLS: Record<string, string> = {
  gold: "XAU",
  silver: "XAG",
  platinum: "XPT",
  palladium: "XPD",
};

export interface UnifiedPosition {
  id: string;
  _id: string;
  provider: LoadedHolding["provider"];
  /** The holding's category (stored, override-aware; see placeHolding) */
  category: string;
  subcategory?: string;
  symbol: string;
  name: string;
  quantity: number;
  currentPrice?: number;
  /** Native amount, signed like valueInBaseCurrency */
  marketValue: number;
  currency: string;
  /** Value in EUR, signed: a liability is negative */
  valueInBaseCurrency: number;
  /** Cost basis in EUR */
  costBasis?: number;
  /** valueInBaseCurrency − costBasis (EUR) */
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  lastSyncAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Get all positions across all providers in a unified format, sorted by
 * value in EUR (largest first). Categories are the classified ones (user
 * overrides included), vault items are valued at spot on the server and
 * P/L is in EUR, all from the shared loader.
 */
export const getUnifiedPositions = query({
  args: {
    limit: v.optional(v.number()),
    provider: v.optional(
      v.union(
        v.literal("plaid"),
        v.literal("snaptrade"),
        v.literal("bitpanda"),
        v.literal("manual"),
      ),
    ),
  },
  handler: async (ctx, args): Promise<UnifiedPosition[]> => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const holdings = (await loadHoldings(ctx, userId)).filter(
      (h) => !args.provider || h.provider === args.provider,
    );

    const plaidItems = holdings.some((h) => h.source === "bank")
      ? await ctx.db
          .query("plaidItems")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      : [];
    const institutionByItem = new Map(
      plaidItems.map((i) => [i.itemId, i.institutionName]),
    );
    const brokerAccounts = new Map(
      (holdings.some((h) => h.source === "brokerPosition")
        ? await ctx.db
            .query("brokerAccounts")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect()
        : []
      ).map((a) => [a._id, a]),
    );

    const positions: UnifiedPosition[] = [];
    for (const h of holdings) {
      const placed = placeHolding(h);
      const isLiability = placed.category === "liabilities";
      const valueInBaseCurrency = isLiability ? -placed.value : placed.value;
      const pl =
        !isLiability && h.costBase !== null
          ? holdingProfitLoss({ value: placed.value, costBasis: h.costBase })
          : null;
      const base = {
        _id: h.id,
        provider: h.provider,
        category: placed.category,
        subcategory: placed.subcategory,
        name: h.name,
        valueInBaseCurrency,
        costBasis: isLiability ? undefined : (h.costBase ?? undefined),
        unrealizedPL: pl?.profitLoss ?? undefined,
        unrealizedPLPercent: pl?.profitLossPercent ?? undefined,
      };
      // The native amount takes the sign of the EUR value: an overridden
      // positive liability position shows negative, a credit balance (a
      // card's -40, an overpaid loan) shows positive like its cash value
      const signed = (native: number) =>
        valueInBaseCurrency < 0
          ? -Math.abs(native)
          : valueInBaseCurrency > 0
            ? Math.abs(native)
            : native;

      switch (h.source) {
        case "bank": {
          const a = h.doc;
          positions.push({
            ...base,
            id: a.accountId,
            symbol: a.type.toUpperCase(),
            quantity: 1,
            marketValue: signed(a.currentBalance ?? 0),
            currency: a.currency,
            lastSyncAt: a.lastSynced,
            metadata: {
              accountId: a.accountId,
              institutionName: institutionByItem.get(a.itemId),
              accountType: a.type,
              subtype: a.subtype,
              mask: a.mask,
            },
          });
          break;
        }
        case "brokerPosition": {
          const p = h.doc;
          const accountDoc = brokerAccounts.get(p.accountId);
          positions.push({
            ...base,
            id: p.snaptradePositionId || p._id,
            symbol: p.symbol,
            name: p.name || p.symbol,
            quantity: p.quantity,
            currentPrice: p.currentPrice,
            marketValue: signed(p.marketValue ?? 0),
            currency: p.currency,
            lastSyncAt: p.lastSyncAt || p.createdAt,
            metadata: {
              brokerName: accountDoc?.institutionName,
              isin: p.isin,
              assetType: p.assetType,
              accountName: accountDoc?.name,
            },
          });
          break;
        }
        case "brokerAccount": {
          const a = h.doc;
          positions.push({
            ...base,
            id: `${a._id}-cash`,
            symbol: "CASH",
            quantity: 1,
            marketValue: a.cash ?? 0,
            currency: a.balanceCurrency ?? a.currency,
            lastSyncAt: a.lastSyncAt || a.createdAt,
            metadata: {
              brokerName: a.institutionName,
              accountName: a.name,
              accountType: a.accountType,
            },
          });
          break;
        }
        case "bitpanda": {
          const b = h.doc;
          positions.push({
            ...base,
            id: `${b.connectionId}-${b.assetType}-${b.symbol}`,
            symbol: b.symbol,
            name: b.name || b.symbol,
            quantity: b.quantity,
            currentPrice: b.currentPrice,
            marketValue: signed(b.marketValue ?? 0),
            currency: b.currency,
            lastSyncAt: b.lastSyncAt ?? b.createdAt,
            metadata: { assetType: b.assetType },
          });
          break;
        }
        case "vault": {
          const item = h.doc;
          const catalogItem = item.catalogItemId
            ? await ctx.db.get(item.catalogItemId)
            : null;
          positions.push({
            ...base,
            id: item._id,
            symbol:
              METAL_SYMBOLS[item.metalType] || item.metalType.toUpperCase(),
            name: item.customName || catalogItem?.name || "Unknown Item",
            quantity: item.quantity,
            currentPrice:
              item.quantity > 0 ? placed.value / item.quantity : undefined,
            // Valued in EUR on the server (lib/netWorth.ts)
            marketValue: placed.value,
            currency: "EUR",
            lastSyncAt: item.updatedAt,
            metadata: {
              metalType: item.metalType,
              category: item.category,
              purity: item.purity,
              weightGrams: item.weightGrams,
              fineWeightGrams: item.fineWeightGrams,
              storageLocation: item.storageLocation,
            },
          });
          break;
        }
        case "loan": {
          const loan = h.doc;
          positions.push({
            ...base,
            id: loan._id,
            symbol: "LOAN",
            quantity: 1,
            marketValue: signed(loan.currentBalance),
            currency: loan.currency,
            lastSyncAt: loan.updatedAt,
            metadata: {
              loanType: loan.loanType,
              lender: loan.lender,
              annualInterestRate: loan.annualInterestRate,
              termMonths: loan.termMonths,
              nextPaymentDate: loan.nextPaymentDate,
              scheduledPayment: loan.scheduledPayment,
            },
          });
          break;
        }
      }
    }

    positions.sort(
      (a, b) =>
        Math.abs(b.valueInBaseCurrency) - Math.abs(a.valueInBaseCurrency),
    );
    return args.limit ? positions.slice(0, args.limit) : positions;
  },
});
