import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { parseLatestMetalPrices } from "./lib/priceCalculations";

/**
 * Mirror of the latest precious-metal spot prices into Convex.
 *
 * Live prices live in the SQL time-series store, which Convex functions can't
 * read. The app already serves the latest row at
 * `GET /api/metals/prices/all/latest` (public market data, no user data), so
 * a cron pulls it here for `lib/netWorth.ts` to value vault items at market.
 *
 * Override the source with the `METAL_PRICES_URL` Convex env var (e.g. for a
 * local or preview app).
 */

const DEFAULT_METAL_PRICES_URL =
  "https://fiscalis.joshua-fehn.de/api/metals/prices/all/latest";

const metalTypeValidator = v.union(
  v.literal("gold"),
  v.literal("silver"),
  v.literal("platinum"),
  v.literal("palladium"),
);

export const refreshSpotPrices = internalAction({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx): Promise<{ updated: number }> => {
    const url = process.env.METAL_PRICES_URL ?? DEFAULT_METAL_PRICES_URL;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Metal price fetch failed: HTTP ${response.status}`);
    }

    const prices = parseLatestMetalPrices(await response.json());
    if (prices.length === 0) {
      throw new Error("Metal price fetch returned no usable prices");
    }

    const updated: number = await ctx.runMutation(
      internal.metalPrices.upsertSpotPrices,
      { prices },
    );
    return { updated };
  },
});

export const upsertSpotPrices = internalMutation({
  args: {
    prices: v.array(
      v.object({
        metalType: metalTypeValidator,
        eurPerOunce: v.number(),
        sourceTimestamp: v.number(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, { prices }) => {
    const fetchedAt = Date.now();
    let updated = 0;
    for (const price of prices) {
      const existing = await ctx.db
        .query("metalSpotPrices")
        .withIndex("by_metal", (q) => q.eq("metalType", price.metalType))
        .unique();
      if (!existing) {
        await ctx.db.insert("metalSpotPrices", { ...price, fetchedAt });
        updated++;
      } else if (price.sourceTimestamp > existing.sourceTimestamp) {
        await ctx.db.patch(existing._id, { ...price, fetchedAt });
        updated++;
      }
    }
    return updated;
  },
});
