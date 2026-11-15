/**
 * Manual assets: property, vehicles, private equity, collectibles and the
 * other holdings no provider reports, each a dated series of valuations in
 * its own currency. Every function derives the user from the auth token and
 * checks ownership (lib/auth.ts); a missing and a foreign asset read the
 * same. The rules (which subcategories, which attributes, valid input) and
 * the valuation live in services/portfolio/manualAssets.ts; net worth and
 * the snapshots read the assets through lib/netWorth.ts loadHoldings.
 *
 * Modelled on the loans vertical (loans.ts): each change registers the user
 * for the daily sync and schedules today's snapshot.
 */

import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import { userError } from "./lib/userError";
import { ensureSyncTarget } from "./lib/syncTargets";
import { manualAssetFields } from "./lib/manualAssetValidators";
import { scheduleSnapshot } from "./portfolioSnapshots";
import {
  cleanAttributes,
  manualAssetCurrency,
  normalizeValuations,
  validateManualAsset,
  type ManualAssetInput,
} from "../../services/portfolio/manualAssets";

/** The snapshot source of a manual asset change. */
const SNAPSHOT_SOURCE = "manualAsset";

// Missing and foreign docs get the same error, so IDs can't be probed
async function requireOwnedAsset(
  ctx: MutationCtx,
  assetId: Id<"manualAssets">,
) {
  const userId = await requireUserId(ctx);
  const asset = await getOwnedDoc(ctx, userId, assetId);
  if (!asset) userError("manualAssetNotFound");
  return { userId, asset };
}

/**
 * The fields to store from the form's input: validated, the currency upper
 * case, valuations oldest first (one per date), only the subcategory's own
 * attributes. A linked loan must be the user's own.
 */
async function toStoredFields(
  ctx: MutationCtx,
  userId: string,
  input: ManualAssetInput & { linkedLoanId?: Id<"loans"> },
) {
  const error = validateManualAsset(input, Date.now());
  if (error) userError(error);
  if (input.linkedLoanId && !(await getOwnedDoc(ctx, userId, input.linkedLoanId))) {
    userError("loanNotFound");
  }
  return {
    category: input.category,
    subcategory: input.subcategory,
    name: input.name.trim(),
    currency: manualAssetCurrency(input.currency)!,
    valuations: normalizeValuations(input.valuations),
    costBasis: input.costBasis,
    linkedLoanId: input.linkedLoanId,
    attributes: cleanAttributes(input.subcategory, input.attributes),
  };
}

/** One of the user's manual assets, for the edit form; null when not theirs. */
export const get = query({
  args: { assetId: v.id("manualAssets") },
  handler: async (ctx, { assetId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    return await getOwnedDoc(ctx, userId, assetId);
  },
});

export const create = mutation({
  args: manualAssetFields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const fields = await toStoredFields(ctx, userId, args);
    const now = Date.now();
    await ensureSyncTarget(ctx, userId);
    const assetId = await ctx.db.insert("manualAssets", {
      userId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleSnapshot(ctx, userId, SNAPSHOT_SOURCE);
    return assetId;
  },
});

/**
 * Replace an asset's editable fields with the form's: an optional field
 * left out (cost basis, linked loan, attributes) is cleared.
 */
export const update = mutation({
  args: { assetId: v.id("manualAssets"), ...manualAssetFields },
  handler: async (ctx, { assetId, ...input }) => {
    const { userId } = await requireOwnedAsset(ctx, assetId);
    const fields = await toStoredFields(ctx, userId, input);
    await ctx.db.patch(assetId, { ...fields, updatedAt: Date.now() });
    await scheduleSnapshot(ctx, userId, SNAPSHOT_SOURCE);
  },
});

export const remove = mutation({
  args: { assetId: v.id("manualAssets") },
  handler: async (ctx, { assetId }) => {
    const { userId } = await requireOwnedAsset(ctx, assetId);
    await ctx.db.delete(assetId);
    await scheduleSnapshot(ctx, userId, SNAPSHOT_SOURCE);
  },
});

/**
 * Unlink a deleted loan from the assets it financed (loans.ts deleteLoan),
 * so no asset points at a loan that no longer exists.
 */
export async function unlinkLoan(
  ctx: MutationCtx,
  userId: string,
  loanId: Id<"loans">,
): Promise<void> {
  const assets = await ctx.db
    .query("manualAssets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const asset of assets) {
    if (asset.linkedLoanId === loanId) {
      await ctx.db.patch(asset._id, { linkedLoanId: undefined });
    }
  }
}
