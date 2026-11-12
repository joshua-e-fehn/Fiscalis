/**
 * Performance Calculation Service - Valuation resolution
 *
 * Which strategy values a holding's history is resolved in three tiers,
 * the most specific winning (docs/VALUATION_RESOLUTION_PLAN.md):
 *
 *   asset override → subcategory override → category default
 *
 * A subcategory without an override inherits its category's default, so a
 * new subcategory needs no entry here. A continuous method only takes effect
 * when the app has a price feed for it (PRICE_FEEDS); until then the
 * holding is valued from snapshots like any discrete one.
 */

import type {
  HoldingCategory,
  HoldingSource,
} from "../portfolio/aggregate";
import type {
  ContinuousSource,
  PriceProvider,
  ValuationConfig,
  ValueType,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

const DISCRETE: ValuationConfig = { method: "discrete", priceProvider: "manual" };

/** Tier 1: every category's baseline. */
export const CATEGORY_VALUATION_DEFAULTS: Record<
  HoldingCategory,
  ValuationConfig
> = {
  cash: DISCRETE,
  equities: DISCRETE,
  bonds: DISCRETE,
  crypto: DISCRETE,
  commodities: DISCRETE,
  "real-estate": DISCRETE,
  collectibles: DISCRETE,
  unclassified: DISCRETE,
  liabilities: DISCRETE,
};

/**
 * Tier 2: only the subcategories that differ from their category default.
 * Keyed by category because subcategory ids repeat (equities and bonds both
 * have "funds").
 */
export const SUBCATEGORY_VALUATION_OVERRIDES: Partial<
  Record<HoldingCategory, Record<string, Partial<ValuationConfig>>>
> = {
  equities: {
    stocks: { method: "continuous", priceProvider: "market-data" },
    etfs: { method: "continuous", priceProvider: "market-data" },
    options: { method: "continuous", priceProvider: "market-data" },
    funds: { method: "semi-continuous", priceProvider: "market-data" },
  },
  crypto: {
    bitcoin: { method: "continuous", priceProvider: "crypto-exchange" },
    ethereum: { method: "continuous", priceProvider: "crypto-exchange" },
    altcoins: { method: "continuous", priceProvider: "crypto-exchange" },
    stablecoins: { method: "semi-continuous", priceProvider: "crypto-exchange" },
  },
  commodities: {
    metals: { method: "continuous", priceProvider: "metals" },
  },
  "real-estate": {
    reits: { method: "continuous", priceProvider: "market-data" },
  },
  collectibles: {
    nfts: { method: "semi-continuous", priceProvider: "nft-floor" },
  },
};

/**
 * Resolve a holding's valuation config: category default, then the
 * subcategory override, then a per-asset override (tier 3, for example a
 * manually entered stock without a ticker is discrete).
 */
export function resolveValuationConfig(
  category: HoldingCategory,
  subcategory?: string,
  assetOverride?: Partial<ValuationConfig>,
): ValuationConfig {
  const sub = subcategory
    ? SUBCATEGORY_VALUATION_OVERRIDES[category]?.[subcategory]
    : undefined;
  return { ...CATEGORY_VALUATION_DEFAULTS[category], ...sub, ...assetOverride };
}

// ═══════════════════════════════════════════════════════════════
// Price feeds and strategy selection
// ═══════════════════════════════════════════════════════════════

/**
 * Price feeds the app can value history from, with the holding source each
 * one values. Only vault metals have one today: Bitpanda and broker metals
 * in the same subcategory are valued from snapshots.
 */
export const PRICE_FEEDS: Partial<
  Record<
    PriceProvider,
    { source: HoldingSource; category: HoldingCategory; subcategory: string }
  >
> = {
  metals: { source: "vault", category: "commodities", subcategory: "metals" },
};

/**
 * The value type a config is calculated with: continuous only when the method
 * is continuous and a feed exists for its provider; semi-continuous is the
 * discrete algorithm.
 */
export function getValueTypeForConfig(config: ValuationConfig): ValueType {
  return config.method === "continuous" &&
    config.priceProvider !== undefined &&
    PRICE_FEEDS[config.priceProvider] !== undefined
    ? "continuous"
    : "discrete";
}

/**
 * Holding sources valued continuously within a category (or the whole
 * portfolio for "all", or one source alone), each with the category its
 * value is stored under in snapshots. The discrete part of a hybrid
 * calculation leaves them out of the snapshot values, so they are not
 * counted twice.
 */
export function continuousSourcesFor(
  scope: HoldingCategory | "all" | { source: string },
): ContinuousSource[] {
  return Object.entries(PRICE_FEEDS).flatMap(([provider, feed]) => {
    if (!feed) return [];
    const inScope =
      typeof scope === "object"
        ? feed.source === scope.source
        : scope === "all" || feed.category === scope;
    if (!inScope) return [];
    const config = resolveValuationConfig(feed.category, feed.subcategory);
    return config.priceProvider === provider &&
      getValueTypeForConfig(config) === "continuous"
      ? [{ source: feed.source, category: feed.category }]
      : [];
  });
}
