import { mutation } from "./_generated/server";

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
