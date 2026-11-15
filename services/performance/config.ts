/**
 * Performance Calculation Service - Valuation resolution
 *
 * Which strategy values a holding's history is resolved in three tiers,
 * the most specific winning (docs/adr/0001-valuation-resolution.md):
 *
 *   asset override → subcategory override → category default
 *
 * A subcategory without an override inherits its category's default, so a
 * new subcategory needs no entry here. A continuous method only takes effect
 * when the app has a price history for it (PRICE_FEEDS); until then the
 * holding is valued from snapshots like any discrete one. A live feed
 * without history keeps the current price fresh (priceFeedFor), and a
 * per-asset override (tier 3) can value one holding manually instead.
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
 * A price feed: the holdings of one source, category and subcategories
 * whose provider price the app reads on its own schedule.
 *
 * - `history: true`: a stored price history the continuous strategy values
 *   the holdings from (vault metals: metalPriceCloses).
 * - `history: false`: a live feed only. The refresh crons keep the current
 *   price fresh between full syncs (convex/assetPrices.ts), so the totals
 *   and the live end of a chart are current, but the history is still the
 *   snapshots'. Turning one into a history feed is the next step
 *   (docs/PRICING_GAPS.md).
 */
export interface PriceFeed {
  source: HoldingSource;
  category: HoldingCategory;
  subcategories: readonly string[];
  history: boolean;
}

/**
 * Every price feed by provider (ENG-239). Only existing provider prices:
 * the gold.de spot for the vault, Bitpanda's public ticker for Bitpanda
 * holdings, SnapTrade quotes for broker positions. A holding outside these
 * (an option, a bond, broker crypto, a Bitpanda energy commodity) is
 * priced by its next sync only.
 */
export const PRICE_FEEDS: Partial<Record<PriceProvider, readonly PriceFeed[]>> =
  {
    metals: [
      {
        source: "vault",
        category: "commodities",
        subcategories: ["metals"],
        history: true,
      },
      {
        source: "bitpanda",
        category: "commodities",
        subcategories: ["metals"],
        history: false,
      },
    ],
    "market-data": [
      {
        source: "brokerPosition",
        category: "equities",
        subcategories: ["stocks", "etfs", "funds"],
        history: false,
      },
      {
        source: "brokerPosition",
        category: "real-estate",
        subcategories: ["reits"],
        history: false,
      },
      {
        source: "bitpanda",
        category: "equities",
        subcategories: ["stocks", "etfs"],
        history: false,
      },
    ],
    "crypto-exchange": [
      {
        source: "bitpanda",
        category: "crypto",
        subcategories: ["bitcoin", "ethereum", "altcoins", "stablecoins"],
        history: false,
      },
    ],
  };

/** Every feed, with the provider it belongs to. */
function allFeeds(): { provider: PriceProvider; feed: PriceFeed }[] {
  return (
    Object.entries(PRICE_FEEDS) as [PriceProvider, readonly PriceFeed[]][]
  ).flatMap(([provider, feeds]) => feeds.map((feed) => ({ provider, feed })));
}

/**
 * The value type a config is calculated with: continuous only when the method
 * is continuous and a history feed exists for its provider; semi-continuous
 * is the discrete algorithm, and a live-only feed does not make a history.
 */
export function getValueTypeForConfig(config: ValuationConfig): ValueType {
  return config.method === "continuous" &&
    config.priceProvider !== undefined &&
    (PRICE_FEEDS[config.priceProvider] ?? []).some((f) => f.history)
    ? "continuous"
    : "discrete";
}

/**
 * The feed that prices one holding, after the full resolution chain
 * (category default, subcategory override, per-asset override): the feed
 * of the resolved provider that covers the holding's source, category and
 * subcategory. Undefined when none does, or when the per-asset override
 * values it manually (a manual price or a model), so the refresh crons
 * leave it alone.
 */
export function priceFeedFor(
  source: HoldingSource,
  category: HoldingCategory,
  subcategory: string | undefined,
  assetOverride?: Partial<ValuationConfig>,
): PriceFeed | undefined {
  const config = resolveValuationConfig(category, subcategory, assetOverride);
  if (config.priceProvider === undefined || subcategory === undefined) {
    return undefined;
  }
  return (PRICE_FEEDS[config.priceProvider] ?? []).find(
    (f) =>
      f.source === source &&
      f.category === category &&
      f.subcategories.includes(subcategory),
  );
}

/**
 * Holding sources valued continuously within a category (or the whole
 * portfolio for "all", or one source alone), each with the category its
 * value is stored under in snapshots. The discrete part of a hybrid
 * calculation leaves them out of the snapshot values, so they are not
 * counted twice. Only history feeds qualify.
 */
export function continuousSourcesFor(
  scope: HoldingCategory | "all" | { source: string },
): ContinuousSource[] {
  const sources: ContinuousSource[] = [];
  for (const { provider, feed } of allFeeds()) {
    if (!feed.history) continue;
    const inScope =
      typeof scope === "object"
        ? feed.source === scope.source
        : scope === "all" || feed.category === scope;
    if (!inScope) continue;
    const continuous = feed.subcategories.some((sub) => {
      const config = resolveValuationConfig(feed.category, sub);
      return (
        config.priceProvider === provider &&
        getValueTypeForConfig(config) === "continuous"
      );
    });
    const entry = { source: feed.source, category: feed.category };
    if (
      continuous &&
      !sources.some(
        (s) => s.source === entry.source && s.category === entry.category,
      )
    ) {
      sources.push(entry);
    }
  }
  return sources;
}
