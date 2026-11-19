/**
 * Bank depot trades imported from the bank's own export (ENG-267).
 *
 * Plaid does not pass DKB's "Depot / Broker" bookings on, so the user
 * uploads the account's CSV export ("Umsatzliste"). The app parses it in
 * the browser (services/banking/dkbCsv.ts) and sends only the depot
 * trades, never the rest of the statement. Holdings are derived from these
 * rows and from any trade Plaid did deliver, one per settlement reference
 * (lib/netWorth.ts loadDepotHoldings).
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import { userError } from "./lib/userError";
import { scheduleSnapshot } from "./portfolioSnapshots";
import { isValidSettledTrade } from "../../services/banking/securityTrades";

/** Trades accepted per import (a statement of many years has far fewer). */
const MAX_TRADES_PER_IMPORT = 2000;

const SNAPSHOT_SOURCE = "depotImport";

const tradeValidator = v.object({
  depot: v.string(),
  reference: v.string(),
  tradeDate: v.string(),
  wkn: v.string(),
  isin: v.string(),
  name: v.string(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  quantity: v.number(),
  cash: v.number(),
  currency: v.string(),
});

/** The user's imported trades, newest first. */
export const listDepotTrades = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const trades = await ctx.db
      .query("depotTrades")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return trades.sort(
      (a, b) =>
        b.tradeDate.localeCompare(a.tradeDate) ||
        b.reference.localeCompare(a.reference),
    );
  },
});

/**
 * Store the depot trades of an export. A trade already stored (same depot
 * and reference) is updated, so importing overlapping exports is safe.
 */
export const importDepotTrades = mutation({
  args: { trades: v.array(tradeValidator) },
  handler: async (ctx, { trades }) => {
    const userId = await requireUserId(ctx);
    if (
      trades.length > MAX_TRADES_PER_IMPORT ||
      !trades.every(isValidSettledTrade)
    ) {
      userError("depotCsvUnreadable");
    }
    const now = Date.now();
    let added = 0;
    for (const trade of trades) {
      const existing = await ctx.db
        .query("depotTrades")
        .withIndex("by_user_reference", (q) =>
          q
            .eq("userId", userId)
            .eq("depot", trade.depot)
            .eq("reference", trade.reference),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...trade, importedAt: now });
      } else {
        await ctx.db.insert("depotTrades", { userId, ...trade, importedAt: now });
        added++;
      }
    }
    if (trades.length > 0) await scheduleSnapshot(ctx, userId, SNAPSHOT_SOURCE);
    return { added, updated: trades.length - added };
  },
});

/** Remove one imported trade. */
export const deleteDepotTrade = mutation({
  args: { tradeId: v.id("depotTrades") },
  handler: async (ctx, { tradeId }) => {
    const userId = await requireUserId(ctx);
    const trade = await getOwnedDoc(ctx, userId, tradeId);
    if (!trade) userError("depotTradeNotFound");
    await ctx.db.delete(tradeId);
    await scheduleSnapshot(ctx, userId, SNAPSHOT_SOURCE);
  },
});
