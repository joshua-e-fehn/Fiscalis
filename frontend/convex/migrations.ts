import { mutation } from "./_generated/server";
import {
  classifyPlaidAccount,
  classifySnaptradePosition,
  getClassificationFields,
  convertCurrency,
  getCurrencyConversionFields,
  BASE_CURRENCY,
} from "./lib/classification";

/**
 * Migration: Update metalCatalog and vaultItems to use buyPremium/sellPremium
 *
 * This migration converts the old `premium` field to the new
 * `buyPremium` and `sellPremium` fields.
 *
 * Run once: await ctx.runMutation(api.migrations.migratePremiums)
 */
export const migratePremiums = mutation({
  args: {},
  handler: async (ctx) => {
    let catalogUpdated = 0;
    let itemsUpdated = 0;

    // Update metalCatalog entries
    const catalogItems = await ctx.db.query("metalCatalog").collect();
    for (const item of catalogItems) {
      // Check if item has old schema (defaultPremium instead of defaultBuyPremium)
      const itemData = item as any;
      if (
        itemData.defaultPremium !== undefined &&
        itemData.defaultBuyPremium === undefined
      ) {
        await ctx.db.patch(item._id, {
          defaultBuyPremium: itemData.defaultPremium,
          defaultSellPremium: 0.0, // Default sell at spot
        } as any);
        // Note: We can't delete the old field in Convex, but schema validation will ignore it
        catalogUpdated++;
      }
    }

    // Update vaultItems entries
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      // Check if item has old schema (premium instead of buyPremium)
      const itemData = item as any;
      if (itemData.premium !== undefined && itemData.buyPremium === undefined) {
        await ctx.db.patch(item._id, {
          buyPremium: itemData.premium,
          sellPremium: 0.0, // Default sell at spot
        } as any);
        itemsUpdated++;
      }
    }

    return {
      message: "Migration completed",
      catalogUpdated,
      itemsUpdated,
    };
  },
});

/**
 * Clean up old fields after migration
 * This removes the deprecated fields from documents
 */
export const cleanupOldPremiumFields = mutation({
  args: {},
  handler: async (ctx) => {
    let catalogCleaned = 0;
    let itemsCleaned = 0;

    // Clean metalCatalog
    const catalogItems = await ctx.db.query("metalCatalog").collect();
    for (const item of catalogItems) {
      const itemData = item as any;
      if (itemData.defaultPremium !== undefined) {
        // Replace the entire document without the old field
        const { defaultPremium, _id, _creationTime, ...rest } = itemData;
        await ctx.db.replace(item._id, rest);
        catalogCleaned++;
      }
    }

    // Clean vaultItems
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      const itemData = item as any;
      if (itemData.premium !== undefined) {
        // Replace the entire document without the old field
        const { premium, _id, _creationTime, ...rest } = itemData;
        await ctx.db.replace(item._id, rest);
        itemsCleaned++;
      }
    }

    return {
      message: "Cleanup completed",
      catalogCleaned,
      itemsCleaned,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION MIGRATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Migration: Classify all existing Plaid accounts
 *
 * This migration applies the classification engine to all existing
 * Plaid accounts that don't have a classification yet.
 *
 * Run: await ctx.runMutation(api.migrations.classifyPlaidAccounts)
 */
export const classifyPlaidAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    let classified = 0;
    let skipped = 0;
    let errors = 0;

    const accounts = await ctx.db.query("plaidAccounts").collect();

    for (const account of accounts) {
      try {
        // Skip if already classified (unless we want to re-classify)
        if (account.investmentCategory && !account.userCategoryOverride) {
          skipped++;
          continue;
        }

        // Skip if user has an override
        if (account.userCategoryOverride) {
          skipped++;
          continue;
        }

        const classification = classifyPlaidAccount({
          type: account.type,
          subtype: account.subtype ?? null,
          name: account.name,
        });

        const fields = getClassificationFields(classification);

        await ctx.db.patch(account._id, fields);
        classified++;
      } catch (error) {
        console.error(`Error classifying account ${account._id}:`, error);
        errors++;
      }
    }

    return {
      message: "Plaid account classification completed",
      totalAccounts: accounts.length,
      classified,
      skipped,
      errors,
    };
  },
});

/**
 * Migration: Classify all existing broker positions
 *
 * This migration applies the classification engine to all existing
 * broker positions and converts their values to base currency.
 *
 * Run: await ctx.runMutation(api.migrations.classifyBrokerPositions)
 */
export const classifyBrokerPositions = mutation({
  args: {},
  handler: async (ctx) => {
    let classified = 0;
    let skipped = 0;
    let errors = 0;

    const positions = await ctx.db.query("brokerPositions").collect();

    for (const position of positions) {
      try {
        // Skip if user has an override
        if (position.userCategoryOverride) {
          skipped++;
          continue;
        }

        const classification = classifySnaptradePosition({
          assetType: position.assetType,
          symbol: position.symbol,
          name: position.name ?? null,
          quantity: position.quantity,
          marketValue: position.marketValue ?? null,
        });

        const classificationFields = getClassificationFields(classification);

        // Convert to base currency
        let currencyFields = {};
        if (
          position.marketValue !== undefined &&
          position.marketValue !== null
        ) {
          const conversion = convertCurrency(
            position.marketValue,
            position.currency,
            BASE_CURRENCY,
          );
          currencyFields = getCurrencyConversionFields(conversion);
        }

        await ctx.db.patch(position._id, {
          ...classificationFields,
          ...currencyFields,
        });
        classified++;
      } catch (error) {
        console.error(`Error classifying position ${position._id}:`, error);
        errors++;
      }
    }

    return {
      message: "Broker position classification completed",
      totalPositions: positions.length,
      classified,
      skipped,
      errors,
    };
  },
});

/**
 * Migration: Re-classify all items (force update)
 *
 * This migration re-classifies ALL items, even those already classified.
 * User overrides are preserved.
 *
 * Run: await ctx.runMutation(api.migrations.reclassifyAll)
 */
export const reclassifyAll = mutation({
  args: {},
  handler: async (ctx) => {
    let plaidClassified = 0;
    let positionsClassified = 0;
    let plaidSkipped = 0;
    let positionsSkipped = 0;

    // Re-classify Plaid accounts
    const accounts = await ctx.db.query("plaidAccounts").collect();
    for (const account of accounts) {
      // Skip if user has an override
      if (account.userCategoryOverride) {
        plaidSkipped++;
        continue;
      }

      const classification = classifyPlaidAccount({
        type: account.type,
        subtype: account.subtype ?? null,
        name: account.name,
      });

      await ctx.db.patch(account._id, getClassificationFields(classification));
      plaidClassified++;
    }

    // Re-classify broker positions
    const positions = await ctx.db.query("brokerPositions").collect();
    for (const position of positions) {
      // Skip if user has an override
      if (position.userCategoryOverride) {
        positionsSkipped++;
        continue;
      }

      const classification = classifySnaptradePosition({
        assetType: position.assetType,
        symbol: position.symbol,
        name: position.name ?? null,
        quantity: position.quantity,
        marketValue: position.marketValue ?? null,
      });

      const classificationFields = getClassificationFields(classification);

      // Update currency conversion
      let currencyFields = {};
      if (position.marketValue !== undefined && position.marketValue !== null) {
        const conversion = convertCurrency(
          position.marketValue,
          position.currency,
          BASE_CURRENCY,
        );
        currencyFields = getCurrencyConversionFields(conversion);
      }

      await ctx.db.patch(position._id, {
        ...classificationFields,
        ...currencyFields,
      });
      positionsClassified++;
    }

    return {
      message: "Re-classification completed",
      plaid: {
        total: accounts.length,
        classified: plaidClassified,
        skipped: plaidSkipped,
      },
      brokerPositions: {
        total: positions.length,
        classified: positionsClassified,
        skipped: positionsSkipped,
      },
    };
  },
});

/**
 * Get classification statistics
 *
 * Returns a summary of how items are classified across the database.
 * Useful for debugging and monitoring.
 */
export const getClassificationStats = mutation({
  args: {},
  handler: async (ctx) => {
    const plaidAccounts = await ctx.db.query("plaidAccounts").collect();
    const brokerPositions = await ctx.db.query("brokerPositions").collect();

    // Plaid stats
    const plaidByCategory: Record<string, number> = {};
    let plaidUnclassified = 0;
    let plaidWithOverride = 0;

    for (const acc of plaidAccounts) {
      if (acc.userCategoryOverride) plaidWithOverride++;
      const cat = acc.investmentCategory ?? "unclassified";
      if (cat === "unclassified") plaidUnclassified++;
      plaidByCategory[cat] = (plaidByCategory[cat] ?? 0) + 1;
    }

    // Position stats
    const positionsByCategory: Record<string, number> = {};
    let positionsUnclassified = 0;
    let positionsWithOverride = 0;

    for (const pos of brokerPositions) {
      if (pos.userCategoryOverride) positionsWithOverride++;
      const cat = pos.investmentCategory ?? "unclassified";
      if (cat === "unclassified") positionsUnclassified++;
      positionsByCategory[cat] = (positionsByCategory[cat] ?? 0) + 1;
    }

    return {
      plaidAccounts: {
        total: plaidAccounts.length,
        unclassified: plaidUnclassified,
        withUserOverride: plaidWithOverride,
        byCategory: plaidByCategory,
      },
      brokerPositions: {
        total: brokerPositions.length,
        unclassified: positionsUnclassified,
        withUserOverride: positionsWithOverride,
        byCategory: positionsByCategory,
      },
    };
  },
});

/**
 * Migration: Reclassify NFTs from crypto to collectibles
 *
 * NFTs were previously classified as crypto/nfts. They now belong to
 * collectibles/nfts. This migration updates existing positions and accounts
 * that were classified under the old scheme.
 *
 * User overrides are preserved.
 *
 * Run: await ctx.runMutation(api.migrations.reclassifyNftsToCollectibles)
 */
export const reclassifyNftsToCollectibles = mutation({
  args: {},
  handler: async (ctx) => {
    let positionsUpdated = 0;
    let positionsSkipped = 0;
    let accountsUpdated = 0;
    let accountsSkipped = 0;

    // Reclassify broker positions
    const positions = await ctx.db.query("brokerPositions").collect();
    for (const position of positions) {
      if (
        position.investmentCategory === "crypto" &&
        position.investmentSubcategory === "nfts"
      ) {
        if (position.userCategoryOverride) {
          positionsSkipped++;
          continue;
        }
        await ctx.db.patch(position._id, {
          investmentCategory: "collectibles",
          investmentSubcategory: "nfts",
        } as any);
        positionsUpdated++;
      }
    }

    // Reclassify Plaid accounts (unlikely for NFTs, but check anyway)
    const accounts = await ctx.db.query("plaidAccounts").collect();
    for (const account of accounts) {
      if (
        account.investmentCategory === "crypto" &&
        account.investmentSubcategory === "nfts"
      ) {
        if (account.userCategoryOverride) {
          accountsSkipped++;
          continue;
        }
        await ctx.db.patch(account._id, {
          investmentCategory: "collectibles",
          investmentSubcategory: "nfts",
        } as any);
        accountsUpdated++;
      }
    }

    return {
      message: "NFT reclassification completed (crypto → collectibles)",
      positions: {
        updated: positionsUpdated,
        skippedUserOverride: positionsSkipped,
      },
      accounts: {
        updated: accountsUpdated,
        skippedUserOverride: accountsSkipped,
      },
    };
  },
});
