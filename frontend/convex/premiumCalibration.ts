import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  CATALOG_PREMIUMS,
  PREMIUM_CALIBRATION,
} from "./lib/metalPremiums";

/**
 * Apply the calibrated premiums (lib/metalPremiums.ts) to the live catalog
 * and backfill vault items that still carry the old, uncalibrated defaults.
 *
 * A vault item is backfilled only when it is linked to a catalog product and
 * its premiums still equal that product's previous defaults (or the 0% sell
 * premium the 2025 premium migration wrote). Premiums a user edited by hand
 * are left untouched. Idempotent: re-running changes nothing.
 *
 * Internal (admin-only):
 *   npx convex run premiumCalibration:applyPremiumCalibration '{"dryRun":true}'
 */
export const applyPremiumCalibration = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    calibrationDate: v.string(),
    catalogUpdated: v.number(),
    catalogMissingCalibration: v.array(v.string()),
    vaultItemsBackfilled: v.number(),
    vaultItemsKeptCustom: v.number(),
  }),
  handler: async (ctx, { dryRun = false }) => {
    const catalog = await ctx.db.query("metalCatalog").collect();
    const previousDefaults = new Map(
      catalog.map((c) => [
        c._id,
        { buy: c.defaultBuyPremium, sell: c.defaultSellPremium ?? 0 },
      ]),
    );

    let catalogUpdated = 0;
    const catalogMissingCalibration: string[] = [];
    for (const item of catalog) {
      const premium = CATALOG_PREMIUMS[item.name];
      if (!premium) {
        catalogMissingCalibration.push(item.name);
        continue;
      }
      if (
        item.defaultBuyPremium !== premium.buy ||
        item.defaultSellPremium !== premium.sell
      ) {
        if (!dryRun) {
          await ctx.db.patch(item._id, {
            defaultBuyPremium: premium.buy,
            defaultSellPremium: premium.sell,
          });
        }
        catalogUpdated++;
      }
    }

    let vaultItemsBackfilled = 0;
    let vaultItemsKeptCustom = 0;
    const catalogById = new Map(catalog.map((c) => [c._id, c]));
    for (const item of await ctx.db.query("vaultItems").collect()) {
      if (!item.catalogItemId) continue;
      const product = catalogById.get(item.catalogItemId);
      const premium = product && CATALOG_PREMIUMS[product.name];
      const previous = previousDefaults.get(item.catalogItemId);
      if (!product || !premium || !previous) continue;

      const alreadyCalibrated =
        item.buyPremium === premium.buy && item.sellPremium === premium.sell;
      if (alreadyCalibrated) continue;

      const untouched =
        item.buyPremium === previous.buy && (item.sellPremium ?? 0) === previous.sell;
      if (!untouched) {
        vaultItemsKeptCustom++;
        continue;
      }
      if (!dryRun) {
        await ctx.db.patch(item._id, {
          buyPremium: premium.buy,
          sellPremium: premium.sell,
          updatedAt: Date.now(),
        });
      }
      vaultItemsBackfilled++;
    }

    return {
      calibrationDate: PREMIUM_CALIBRATION.date,
      catalogUpdated,
      catalogMissingCalibration,
      vaultItemsBackfilled,
      vaultItemsKeptCustom,
    };
  },
});
