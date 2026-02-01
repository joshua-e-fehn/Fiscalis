import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  classifyPlaidAccount,
  classifySnaptradePosition,
} from "./lib/classification";

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION OVERRIDE MUTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Override classification for a Plaid account
 *
 * Sets the user's preferred category and subcategory, which will be
 * preserved even when the account data is synced/refreshed.
 */
export const overridePlaidAccountClassification = mutation({
  args: {
    accountId: v.id("plaidAccounts"),
    category: v.string(),
    subcategory: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.accountId, {
      userCategoryOverride: args.category,
      userSubcategoryOverride: args.subcategory,
      investmentCategory: args.category,
      investmentSubcategory: args.subcategory,
      classificationSource: "user_override",
    });

    return { success: true };
  },
});

/**
 * Override classification for a broker position
 *
 * Sets the user's preferred category and subcategory, which will be
 * preserved even when position data is synced/refreshed.
 */
export const overrideBrokerPositionClassification = mutation({
  args: {
    positionId: v.id("brokerPositions"),
    category: v.string(),
    subcategory: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const position = await ctx.db.get(args.positionId);
    if (!position) {
      throw new Error("Position not found");
    }
    if (position.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.positionId, {
      userCategoryOverride: args.category,
      userSubcategoryOverride: args.subcategory,
      investmentCategory: args.category,
      investmentSubcategory: args.subcategory,
      classificationSource: "user_override",
    });

    return { success: true };
  },
});

/**
 * Reset Plaid account to automatic classification
 *
 * Clears user overrides and re-runs the classification engine.
 */
export const resetPlaidAccountClassification = mutation({
  args: {
    accountId: v.id("plaidAccounts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // Re-run classification engine
    const classification = classifyPlaidAccount({
      type: account.type ?? "",
      subtype: account.subtype ?? null,
      name: account.name ?? "",
      currentBalance: account.currentBalance ?? 0,
    });

    await ctx.db.patch(args.accountId, {
      userCategoryOverride: undefined,
      userSubcategoryOverride: undefined,
      investmentCategory: classification.category,
      investmentSubcategory: classification.subcategory,
      classificationSource: "auto",
    });

    return {
      success: true,
      newCategory: classification.category,
      newSubcategory: classification.subcategory,
    };
  },
});

/**
 * Reset broker position to automatic classification
 *
 * Clears user overrides and re-runs the classification engine.
 */
export const resetBrokerPositionClassification = mutation({
  args: {
    positionId: v.id("brokerPositions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const position = await ctx.db.get(args.positionId);
    if (!position) {
      throw new Error("Position not found");
    }
    if (position.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // Re-run classification engine
    const classification = classifySnaptradePosition({
      assetType: position.assetType ?? "",
      symbol: position.symbol ?? "",
      name: position.name ?? null,
      quantity: position.quantity ?? 0,
      marketValue: position.marketValue ?? null,
    });

    await ctx.db.patch(args.positionId, {
      userCategoryOverride: undefined,
      userSubcategoryOverride: undefined,
      investmentCategory: classification.category,
      investmentSubcategory: classification.subcategory,
      classificationSource: "auto",
    });

    return {
      success: true,
      newCategory: classification.category,
      newSubcategory: classification.subcategory,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get classification details for a Plaid account
 */
export const getPlaidAccountClassification = query({
  args: {
    accountId: v.id("plaidAccounts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== identity.subject) {
      return null;
    }

    // Calculate what the auto classification would be
    const autoClassification = classifyPlaidAccount({
      type: account.type ?? "",
      subtype: account.subtype ?? null,
      name: account.name ?? "",
      currentBalance: account.currentBalance ?? 0,
    });

    return {
      accountId: account._id,
      accountName: account.name ?? account.officialName ?? "Unknown Account",
      accountType: account.type,
      accountSubtype: account.subtype,
      currentCategory: account.investmentCategory,
      currentSubcategory: account.investmentSubcategory,
      classificationSource: account.classificationSource ?? "auto",
      hasUserOverride: !!account.userCategoryOverride,
      userCategoryOverride: account.userCategoryOverride,
      userSubcategoryOverride: account.userSubcategoryOverride,
      autoCategory: autoClassification.category,
      autoSubcategory: autoClassification.subcategory,
      autoRuleName: autoClassification.ruleName,
      autoConfidence: autoClassification.confidence,
    };
  },
});

/**
 * Get classification details for a broker position
 */
export const getBrokerPositionClassification = query({
  args: {
    positionId: v.id("brokerPositions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const position = await ctx.db.get(args.positionId);
    if (!position || position.userId !== identity.subject) {
      return null;
    }

    // Calculate what the auto classification would be
    const autoClassification = classifySnaptradePosition({
      assetType: position.assetType ?? "",
      symbol: position.symbol ?? "",
      name: position.name ?? null,
      quantity: position.quantity ?? 0,
      marketValue: position.marketValue ?? null,
    });

    return {
      positionId: position._id,
      positionName: position.name ?? position.symbol ?? "Unknown Position",
      symbol: position.symbol,
      assetType: position.assetType,
      currentCategory: position.investmentCategory,
      currentSubcategory: position.investmentSubcategory,
      classificationSource: position.classificationSource ?? "auto",
      hasUserOverride: !!position.userCategoryOverride,
      userCategoryOverride: position.userCategoryOverride,
      userSubcategoryOverride: position.userSubcategoryOverride,
      autoCategory: autoClassification.category,
      autoSubcategory: autoClassification.subcategory,
      autoRuleName: autoClassification.ruleName,
      autoConfidence: autoClassification.confidence,
    };
  },
});

/**
 * Get all items with user overrides for the current user
 */
export const getOverriddenItems = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    // Get overridden Plaid accounts
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const overriddenAccounts = plaidAccounts
      .filter((acc) => acc.userCategoryOverride)
      .map((acc) => ({
        type: "plaid" as const,
        id: acc._id,
        name: acc.name ?? acc.officialName ?? "Unknown Account",
        category: acc.investmentCategory,
        subcategory: acc.investmentSubcategory,
        originalCategory: acc.userCategoryOverride
          ? undefined
          : acc.investmentCategory,
      }));

    // Get overridden broker positions
    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const overriddenPositions = brokerPositions
      .filter((pos) => pos.userCategoryOverride)
      .map((pos) => ({
        type: "broker" as const,
        id: pos._id,
        name: pos.name ?? pos.symbol ?? "Unknown Position",
        symbol: pos.symbol,
        category: pos.investmentCategory,
        subcategory: pos.investmentSubcategory,
      }));

    return {
      plaidAccounts: overriddenAccounts,
      brokerPositions: overriddenPositions,
      totalOverrides: overriddenAccounts.length + overriddenPositions.length,
    };
  },
});
