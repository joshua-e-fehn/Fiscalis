/**
 * Per-asset valuation overrides (ENG-239): the user's own price for one
 * broker position or Bitpanda holding, as a manual price or a
 * mark-to-model (services/pricing/valuationOverride.ts). Every function
 * derives the user from the auth token and checks ownership (lib/auth.ts);
 * a missing and a foreign holding read the same.
 *
 * An override is stored by the holding's sync-stable key, because syncs
 * replace the holding rows, and applied by every net-worth figure
 * (lib/netWorth.ts loadHoldings), which also hands it to the positions
 * table (portfolio.getUnifiedPositions `valuation`). Each change schedules
 * today's snapshot.
 */

import { v, type Infer } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { getOwnedDoc, requireUserId } from "./lib/auth";
import { userError } from "./lib/userError";
import { scheduleSnapshot } from "./portfolioSnapshots";
import {
  bitpandaHoldingKey,
  brokerPositionKey,
} from "../../services/portfolio/flows";
import { toHoldingCategory } from "../../services/portfolio/aggregate";
import {
  canOverrideValuation,
  normalizeValuationOverride,
  validateValuationOverride,
} from "../../services/pricing/valuationOverride";

/** The snapshot source of an override change. */
const SNAPSHOT_SOURCE = "valuationOverride";

/** The holding an override is for: a broker position or a Bitpanda holding. */
const holdingRef = v.union(
  v.object({ source: v.literal("brokerPosition"), id: v.id("brokerPositions") }),
  v.object({ source: v.literal("bitpanda"), id: v.id("bitpandaHoldings") }),
);

type HoldingRef = Infer<typeof holdingRef>;

/** The user's holding behind `ref`, with its key and category. */
async function requireOwnedHolding(ctx: MutationCtx, ref: HoldingRef) {
  const userId = await requireUserId(ctx);
  if (ref.source === "brokerPosition") {
    const doc = await getOwnedDoc(ctx, userId, ref.id);
    if (!doc) userError("holdingNotFound");
    return {
      userId,
      holdingKey: brokerPositionKey(doc.accountId, doc.symbol),
      symbol: doc.symbol,
      category: toHoldingCategory(doc.investmentCategory),
    };
  }
  const doc = await getOwnedDoc(ctx, userId, ref.id);
  if (!doc) userError("holdingNotFound");
  return {
    userId,
    holdingKey: bitpandaHoldingKey(doc.connectionId, doc.assetType, doc.symbol),
    symbol: doc.symbol,
    category: doc.assetType === "fiat" ? "cash" : toHoldingCategory(doc.investmentCategory),
  };
}

/**
 * Delete the user's overrides whose holding key starts with `prefix`: a
 * deleted connection's holdings never come back under the same key
 * (services/portfolio/flows.ts keys include the account or connection id),
 * so their overrides would only linger. Range on by_user_key, no scan.
 */
export async function deleteOverridesByKeyPrefix(
  ctx: MutationCtx,
  userId: string,
  prefix: string,
): Promise<void> {
  const rows = await ctx.db
    .query("valuationOverrides")
    .withIndex("by_user_key", (q) =>
      q.eq("userId", userId).gte("holdingKey", prefix).lt("holdingKey", `${prefix}\uffff`),
    )
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

async function findOverride(ctx: MutationCtx, userId: string, holdingKey: string) {
  return await ctx.db
    .query("valuationOverrides")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("holdingKey", holdingKey))
    .unique();
}

/** Value a holding by a manual price or a model, replacing any override it has. */
export const set = mutation({
  args: {
    holding: holdingRef,
    kind: v.union(v.literal("manualPrice"), v.literal("markToModel")),
    pricePerUnit: v.number(),
    currency: v.string(),
    asOf: v.string(),
    annualRatePercent: v.optional(v.number()),
  },
  handler: async (ctx, { holding, ...input }) => {
    const { userId, holdingKey, symbol, category } = await requireOwnedHolding(
      ctx,
      holding,
    );
    if (!canOverrideValuation(category)) userError("valuationNotSupported");
    const now = Date.now();
    const error = validateValuationOverride(input, now);
    if (error) userError(error);
    const fields = normalizeValuationOverride(input);

    const existing = await findOverride(ctx, userId, holdingKey);
    if (existing) {
      await ctx.db.replace(existing._id, {
        userId,
        holdingKey,
        source: holding.source,
        symbol,
        ...fields,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("valuationOverrides", {
        userId,
        holdingKey,
        source: holding.source,
        symbol,
        ...fields,
        createdAt: now,
        updatedAt: now,
      });
    }
    await scheduleSnapshot(ctx, userId, SNAPSHOT_SOURCE);
  },
});

/** Remove a holding's override: its provider price applies again. */
export const clear = mutation({
  args: { holding: holdingRef },
  handler: async (ctx, { holding }) => {
    const { userId, holdingKey } = await requireOwnedHolding(ctx, holding);
    const existing = await findOverride(ctx, userId, holdingKey);
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await scheduleSnapshot(ctx, userId, SNAPSHOT_SOURCE);
  },
});
