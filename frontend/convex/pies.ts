/**
 * Pies: target-allocation strategies (Investment Strategies > Pies). A pie
 * is a set of slices, each a category, subcategory or specific holdings
 * with a target weight; the weights sum to 100%. Every function derives the
 * user from the auth token and checks ownership (lib/auth.ts); a missing
 * and a foreign pie read the same.
 *
 * The input rules and the drift math live in services/portfolio/pies.ts.
 * Actual weights read the holdings through the one net-worth loader
 * (lib/netWorth.ts loadHoldings), like portfolio.getOverview, so a pie sees
 * the same values and categories as net worth. Values are in the base
 * currency (EUR); the client converts them for display.
 */

import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import { userError } from "./lib/userError";
import { loadHoldings } from "./lib/netWorth";
import { pieFields } from "./lib/pieValidators";
import {
  computePieDrift,
  normalizePie,
  pieHoldingKeys,
  pieHoldingsFrom,
  validatePie,
  type PieInput,
} from "../../services/portfolio/pies";

// Missing and foreign docs get the same error, so IDs can't be probed
async function requireOwnedPie(ctx: MutationCtx, pieId: Id<"pies">) {
  const userId = await requireUserId(ctx);
  const pie = await getOwnedDoc(ctx, userId, pieId);
  if (!pie) userError("pieNotFound");
  return { userId, pie };
}

/**
 * The fields to store from the editor's input: validated and normalized.
 * Every holding a slice names must be one of the user's own, or already in
 * the pie (a holding sold since stays until the user removes it).
 */
async function toStoredFields(
  ctx: MutationCtx,
  userId: string,
  input: PieInput,
  keep: readonly string[] = [],
) {
  const error = validatePie(input);
  if (error) userError(error);
  const fields = normalizePie(input);
  const keys = pieHoldingKeys(fields.slices);
  if (keys.length > 0) {
    const allowed = new Set([
      ...keep,
      ...pieHoldingsFrom(await loadHoldings(ctx, userId)).map((h) => h.key),
    ]);
    if (keys.some((key) => !allowed.has(key))) userError("pieHoldingNotFound");
  }
  return {
    name: fields.name,
    description: fields.description,
    slices: fields.slices,
  };
}

/**
 * The user's pies, oldest first, each with its target vs actual weight and
 * drift per slice. Empty when unauthenticated.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const pies = await ctx.db
      .query("pies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (pies.length === 0) return [];
    const holdings = pieHoldingsFrom(await loadHoldings(ctx, userId));
    return pies.map((pie) => {
      const drift = computePieDrift(pie.slices, holdings);
      return {
        _id: pie._id,
        name: pie.name,
        description: pie.description,
        updatedAt: pie.updatedAt,
        totalValue: drift.totalValue,
        maxDrift: drift.maxDrift,
        slices: pie.slices.map((slice, i) => ({ ...slice, ...drift.slices[i] })),
      };
    });
  },
});

/**
 * The asset holdings a slice can name, largest first: key, name, placed
 * category and EUR value. Empty when unauthenticated.
 */
export const holdings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    return pieHoldingsFrom(await loadHoldings(ctx, userId)).sort(
      (a, b) => b.value - a.value,
    );
  },
});

export const create = mutation({
  args: pieFields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const fields = await toStoredFields(ctx, userId, args);
    const now = Date.now();
    return await ctx.db.insert("pies", {
      userId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Replace a pie's name, description and slices with the editor's. */
export const update = mutation({
  args: { pieId: v.id("pies"), ...pieFields },
  handler: async (ctx, { pieId, ...input }) => {
    const { userId, pie } = await requireOwnedPie(ctx, pieId);
    const fields = await toStoredFields(ctx, userId, input, pieHoldingKeys(pie.slices));
    await ctx.db.patch(pieId, { ...fields, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { pieId: v.id("pies") },
  handler: async (ctx, { pieId }) => {
    await requireOwnedPie(ctx, pieId);
    await ctx.db.delete(pieId);
  },
});
