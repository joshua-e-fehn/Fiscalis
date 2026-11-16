import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { loadFxRates } from "./fxRates";
import { priceFeedFor } from "../../services/performance/config";
import { toHoldingCategory } from "../../services/portfolio/aggregate";
import {
  LIVE_PRICE_MAX_AGE_MS,
  plausiblePriceMove,
  repricedBitpandaFields,
  repricedPositionFields,
  sameCurrencyUnit,
} from "../../services/pricing/livePrices";

/**
 * Live provider prices between full syncs (ENG-239,
 * services/pricing/livePrices.ts). The refresh actions
 * (convex/actions/livePrices.ts) read Bitpanda's public ticker and
 * SnapTrade quotes into `assetPrices`; the mutations here store them and
 * re-price the holdings the PRICE_FEEDS seam assigns to each feed
 * (services/performance/config.ts priceFeedFor), with the same field
 * computation the syncs use. Holdings a per-asset override values are
 * re-priced too (the override wins when net worth reads them,
 * lib/netWorth.ts), so removing an override shows a current price.
 */

/** Holdings re-priced per mutation; the next page is scheduled. */
const REPRICE_PAGE_SIZE = 200;
/**
 * A holding at an unchanged price is rewritten only when its priceAsOf is
 * this old: every write re-runs the owner's net-worth queries.
 */
const UNCHANGED_REWRITE_MS = 60 * 60_000;

const livePriceValidator = v.object({
  symbol: v.string(),
  price: v.number(),
  currency: v.string(),
});

/** Upsert one provider price; written only when it moved or is old. */
async function storePrice(
  ctx: MutationCtx,
  provider: Doc<"assetPrices">["provider"],
  price: { symbol: string; price: number; currency: string; ticker?: string },
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("assetPrices")
    .withIndex("by_provider_symbol", (q) =>
      q.eq("provider", provider).eq("symbol", price.symbol),
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("assetPrices", { provider, ...price, fetchedAt: now });
    return;
  }
  if (
    existing.price === price.price &&
    existing.currency === price.currency &&
    now - existing.fetchedAt < LIVE_PRICE_MAX_AGE_MS / 2
  ) {
    return;
  }
  await ctx.db.patch(existing._id, { ...price, fetchedAt: now });
}

// ═══════════════════════════════════════════════════════════════
// Bitpanda ticker
// ═══════════════════════════════════════════════════════════════

/** Store a ticker read, then start re-pricing the Bitpanda holdings. */
export const storeBitpandaTicker = internalMutation({
  args: { prices: v.array(livePriceValidator) },
  handler: async (ctx, { prices: tickerPrices }) => {
    const now = Date.now();
    // Only the symbols someone holds: the v2 ticker lists every asset
    // Bitpanda trades (3,195 in 2026-11), and only reprice reads them.
    // The scan reads what one reprice pass reads anyway.
    const held = new Set<string>();
    for await (const holding of ctx.db.query("bitpandaHoldings")) {
      if (holding.assetType !== "fiat") held.add(holding.symbol.toUpperCase());
    }
    const prices = tickerPrices.filter((p) => held.has(p.symbol));
    for (const price of prices) {
      await storePrice(ctx, "bitpanda", price, now);
    }
    if (prices.length > 0) {
      await ctx.scheduler.runAfter(0, internal.assetPrices.repriceBitpandaHoldings, {
        cursor: null,
      });
    }
    return { stored: prices.length };
  },
});

/**
 * One page of Bitpanda holdings, every user, at the stored ticker price:
 * only holdings a live feed covers, never fiat (priced by its EUR rate),
 * only with a fresh price and a plausible move.
 */
export const repriceBitpandaHoldings = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db
      .query("bitpandaHoldings")
      .paginate({ cursor, numItems: REPRICE_PAGE_SIZE });
    let repriced = 0;
    for (const holding of page.page) {
      if (holding.assetType === "fiat") continue;
      const feed = priceFeedFor(
        "bitpanda",
        toHoldingCategory(holding.investmentCategory),
        holding.investmentSubcategory,
      );
      if (!feed) continue;
      const stored = await ctx.db
        .query("assetPrices")
        .withIndex("by_provider_symbol", (q) =>
          q.eq("provider", "bitpanda").eq("symbol", holding.symbol.toUpperCase()),
        )
        .unique();
      if (!stored || now - stored.fetchedAt > LIVE_PRICE_MAX_AGE_MS) continue;
      if (!plausiblePriceMove(holding.currentPrice, stored.price)) continue;
      if (
        holding.currentPrice === stored.price &&
        holding.priceStatus === "live" &&
        now - (holding.priceAsOf ?? 0) < UNCHANGED_REWRITE_MS
      ) {
        continue;
      }
      await ctx.db.patch(
        holding._id,
        repricedBitpandaFields(holding.quantity, stored.price, stored.fetchedAt),
      );
      repriced++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.assetPrices.repriceBitpandaHoldings, {
        cursor: page.continueCursor,
      });
    }
    return { repriced };
  },
});

// ═══════════════════════════════════════════════════════════════
// SnapTrade quotes
// ═══════════════════════════════════════════════════════════════

/** A broker position a SnapTrade quote may re-price. */
function quotable(position: Doc<"brokerPositions">): boolean {
  return (
    Boolean(position.symbolId) &&
    priceFeedFor(
      "brokerPosition",
      toHoldingCategory(position.investmentCategory),
      position.investmentSubcategory,
    ) !== undefined
  );
}

/** SnapTrade users read per quoteTargets page. */
const QUOTE_TARGET_PAGE_SIZE = 50;

/**
 * Who the quote refresh calls SnapTrade for, one page of registered users
 * at a time: each user with an account under a connected (not failing or
 * reauth-pending) connection holding a quotable position, with the
 * universal symbol ids per account.
 */
export const quoteTargets = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("snaptradeUsers")
      .paginate({ cursor, numItems: QUOTE_TARGET_PAGE_SIZE });
    const users = page.page;
    const targets: {
      userId: string;
      accounts: {
        accountId: Id<"brokerAccounts">;
        snaptradeAccountId: string;
        symbolIds: string[];
      }[];
    }[] = [];
    for (const user of users) {
      const connections = await ctx.db
        .query("brokerConnections")
        .withIndex("by_status", (q) =>
          q.eq("userId", user.userId).eq("status", "connected"),
        )
        .collect();
      if (connections.length === 0) continue;
      const connected = new Set(connections.map((c) => c._id));
      const accounts = (
        await ctx.db
          .query("brokerAccounts")
          .withIndex("by_user", (q) => q.eq("userId", user.userId))
          .collect()
      ).filter((a) => connected.has(a.connectionId));
      const withSymbols = [];
      for (const account of accounts) {
        const positions = await ctx.db
          .query("brokerPositions")
          .withIndex("by_account", (q) => q.eq("accountId", account._id))
          .collect();
        const symbolIds = [
          ...new Set(positions.filter(quotable).map((p) => p.symbolId!)),
        ];
        if (symbolIds.length > 0) {
          withSymbols.push({
            accountId: account._id,
            snaptradeAccountId: account.snaptradeAccountId,
            symbolIds,
          });
        }
      }
      if (withSymbols.length > 0) {
        targets.push({ userId: user.userId, accounts: withSymbols });
      }
    }
    return { targets, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Store one account's quotes and re-price its positions: a quote applies to
 * a quotable position with the same universal symbol id, in the position's
 * own currency unit, with a plausible move.
 */
export const applySnaptradeQuotes = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.id("brokerAccounts"),
    quotes: v.array(
      v.object({
        symbolId: v.string(),
        ticker: v.string(),
        price: v.number(),
        currency: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== args.userId) return { repriced: 0 };
    const now = Date.now();
    for (const quote of args.quotes) {
      await storePrice(
        ctx,
        "snaptrade",
        {
          symbol: quote.symbolId,
          ticker: quote.ticker,
          price: quote.price,
          currency: quote.currency,
        },
        now,
      );
    }
    const bySymbolId = new Map(args.quotes.map((q) => [q.symbolId, q]));
    const rates = await loadFxRates(ctx);
    const positions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    let repriced = 0;
    for (const position of positions) {
      if (!quotable(position)) continue;
      const quote = bySymbolId.get(position.symbolId!);
      if (!quote || !sameCurrencyUnit(quote.currency, position.currency)) continue;
      if (!plausiblePriceMove(position.currentPrice, quote.price)) continue;
      if (position.currentPrice === quote.price) continue;
      await ctx.db.patch(position._id, {
        ...repricedPositionFields(position, quote.price, rates),
        lastSyncAt: now,
      });
      repriced++;
    }
    return { repriced };
  },
});
