import { v } from "convex/values";

/** Price per troy ounce of one metal (services/finance/metalPriceFeed.ts MetalQuote). */
const metalQuote = v.object({
  eur: v.number(),
  usd: v.number(),
  chf: v.optional(v.number()),
});

/** The fields every snapshot has: the 12 ounce prices and the EUR rates. */
export const metalPriceCoreFields = {
  timestamp: v.number(), // Observation minute (ms)
  prices: v.object({
    gold: metalQuote,
    silver: metalQuote,
    platinum: metalQuote,
    palladium: metalQuote,
  }),
  eurToUsd: v.number(), // USD per 1 EUR
  eurToChf: v.optional(v.number()), // CHF per 1 EUR
};

/**
 * A full minutely snapshot: the core fields plus the extra gold columns of
 * the old SQL table (GOLD_EXTENDED_COLUMNS, keyed by their SQL names:
 * gold_eur_gram, gold_usd_kilo, gold_chf_585, ...).
 */
export const metalPriceSnapshotFields = {
  ...metalPriceCoreFields,
  extended: v.optional(v.record(v.string(), v.number())),
};

export const metalPriceSnapshotValidator = v.object(metalPriceSnapshotFields);
export const metalPriceCoreValidator = v.object(metalPriceCoreFields);

export const closeResolutionValidator = v.union(
  v.literal("hour"),
  v.literal("day"),
);
