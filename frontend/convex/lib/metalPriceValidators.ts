import { v } from "convex/values";

/** Price per troy ounce of one metal (services/finance/metalPriceFeed.ts MetalQuote). */
const metalQuote = v.object({
  eur: v.number(),
  usd: v.number(),
  chf: v.optional(v.number()),
});

/** Fields of a MetalPriceSnapshot, shared by the tick and close tables. */
export const metalPriceSnapshotFields = {
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

export const metalPriceSnapshotValidator = v.object(metalPriceSnapshotFields);

export const closeResolutionValidator = v.union(
  v.literal("hour"),
  v.literal("day"),
);
