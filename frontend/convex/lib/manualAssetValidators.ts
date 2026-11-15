import { v } from "convex/values";

/**
 * One valuation of a manual asset: what it was worth on a day, in the
 * asset's currency (services/portfolio/manualAssets.ts ManualValuation).
 */
export const manualValuationValidator = v.object({
  date: v.string(), // ISO date, YYYY-MM-DD
  value: v.number(),
});

/**
 * The optional details of a manual asset, the same fields as
 * services/portfolio/manualAssets.ts MANUAL_ASSET_ATTRIBUTE_KINDS. Which
 * ones a subcategory records is attributesFor(subcategory).
 */
export const manualAssetAttributesValidator = v.object({
  artist: v.optional(v.string()),
  brand: v.optional(v.string()),
  model: v.optional(v.string()),
  referenceNumber: v.optional(v.string()),
  producer: v.optional(v.string()),
  vintage: v.optional(v.number()),
  year: v.optional(v.number()),
  address: v.optional(v.string()),
  grade: v.optional(v.string()),
});

/** The editable fields of a manual asset, as the add/edit form sends them. */
export const manualAssetFields = {
  category: v.string(),
  subcategory: v.string(),
  name: v.string(),
  currency: v.string(), // ISO code, stored upper case
  valuations: v.array(manualValuationValidator),
  costBasis: v.optional(v.number()), // In `currency`; unset = unknown
  linkedLoanId: v.optional(v.id("loans")), // The loan that financed it
  attributes: v.optional(manualAssetAttributesValidator),
};
