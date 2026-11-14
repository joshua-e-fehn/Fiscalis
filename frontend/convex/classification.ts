import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { ClassificationTarget } from "../lib/types/classification";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import {
  autoBitpandaClassification,
  autoBrokerClassification,
  autoPlaidClassification,
  automaticFields,
  overrideFields,
} from "./lib/classificationOverride";

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION OVERRIDE MUTATIONS
//
// Each mutation acts only on a row of the signed-in user: a foreign row is
// reported as missing (lib/auth.ts getOwnedDoc). The sync keeps an override
// (banking.saveAccounts skips classification for an overridden account;
// brokers.replaceAccountHoldings and bitpanda.syncHoldings carry it over by
// the position's identity).
// ═══════════════════════════════════════════════════════════════

/**
 * Override classification for a Plaid account (cash or liabilities only,
 * see overrideCategoriesFor).
 */
export const overridePlaidAccountClassification = mutation({
  args: {
    accountId: v.id("plaidAccounts"),
    category: v.string(),
    subcategory: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const account = await getOwnedDoc(ctx, userId, args.accountId);
    if (!account) throw new Error("Account not found");

    await ctx.db.patch(
      account._id,
      overrideFields("plaid", args.category, args.subcategory),
    );
    return { success: true };
  },
});

/** Override classification for a broker position. */
export const overrideBrokerPositionClassification = mutation({
  args: {
    positionId: v.id("brokerPositions"),
    category: v.string(),
    subcategory: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const position = await getOwnedDoc(ctx, userId, args.positionId);
    if (!position) throw new Error("Position not found");

    await ctx.db.patch(
      position._id,
      overrideFields("broker", args.category, args.subcategory),
    );
    return { success: true };
  },
});

/** Reset a Plaid account to its automatic classification. */
export const resetPlaidAccountClassification = mutation({
  args: {
    accountId: v.id("plaidAccounts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const account = await getOwnedDoc(ctx, userId, args.accountId);
    if (!account) throw new Error("Account not found");

    const auto = autoPlaidClassification(account);
    await ctx.db.patch(account._id, automaticFields(auto));
    return {
      success: true,
      newCategory: auto.category,
      newSubcategory: auto.subcategory,
    };
  },
});

/** Reset a broker position to its automatic classification. */
export const resetBrokerPositionClassification = mutation({
  args: {
    positionId: v.id("brokerPositions"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const position = await getOwnedDoc(ctx, userId, args.positionId);
    if (!position) throw new Error("Position not found");

    const auto = autoBrokerClassification(position);
    await ctx.db.patch(position._id, automaticFields(auto));
    return {
      success: true,
      newCategory: auto.category,
      newSubcategory: auto.subcategory,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION QUERIES
// ═══════════════════════════════════════════════════════════════

/** One overridden row, with what the rule engine would file it under. */
export interface OverriddenItem {
  target: ClassificationTarget;
  id: string;
  name: string;
  symbol?: string;
  category?: string;
  subcategory?: string;
  autoCategory: string;
  autoSubcategory: string;
}

/**
 * Every bank account, broker position and Bitpanda holding of the current
 * user that has a manual category, with its automatic classification.
 */
export const getOverriddenItems = query({
  args: {},
  handler: async (ctx): Promise<OverriddenItem[] | null> => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const items: OverriddenItem[] = [];

    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const acc of plaidAccounts) {
      if (!acc.userCategoryOverride && !acc.userSubcategoryOverride) continue;
      const auto = autoPlaidClassification(acc);
      items.push({
        target: "plaid",
        id: acc._id,
        name: acc.name || acc.officialName || "",
        category: acc.investmentCategory,
        subcategory: acc.investmentSubcategory,
        autoCategory: auto.category,
        autoSubcategory: auto.subcategory,
      });
    }

    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const pos of brokerPositions) {
      if (!pos.userCategoryOverride && !pos.userSubcategoryOverride) continue;
      const auto = autoBrokerClassification(pos);
      items.push({
        target: "broker",
        id: pos._id,
        name: pos.name || pos.symbol || "",
        symbol: pos.symbol,
        category: pos.investmentCategory,
        subcategory: pos.investmentSubcategory,
        autoCategory: auto.category,
        autoSubcategory: auto.subcategory,
      });
    }

    const bitpandaHoldings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const h of bitpandaHoldings) {
      if (!h.userCategoryOverride && !h.userSubcategoryOverride) continue;
      const auto = autoBitpandaClassification(h);
      items.push({
        target: "bitpanda",
        id: h._id,
        name: h.name || h.symbol,
        symbol: h.symbol,
        category: h.investmentCategory,
        subcategory: h.investmentSubcategory,
        autoCategory: auto.category,
        autoSubcategory: auto.subcategory,
      });
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  },
});
