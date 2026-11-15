import { v } from "convex/values";

/**
 * What a pie slice targets (services/portfolio/pies.ts PieSliceTarget): a
 * whole category, one subcategory of it, or specific holdings by their
 * stable key (NormalizedHolding.key, unchanged across provider syncs).
 */
export const pieSliceTargetValidator = v.union(
  v.object({
    kind: v.literal("category"),
    category: v.string(),
    subcategory: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("holdings"),
    holdingKeys: v.array(v.string()),
  }),
);

/** One slice: a target and its weight in percent (the weights sum to 100). */
export const pieSliceValidator = v.object({
  label: v.optional(v.string()),
  weight: v.number(),
  target: pieSliceTargetValidator,
});

/** The editable fields of a pie, as the editor sends them. */
export const pieFields = {
  name: v.string(),
  description: v.optional(v.string()),
  slices: v.array(pieSliceValidator),
};
