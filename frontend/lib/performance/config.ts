/**
 * Performance Calculation Service - Configuration
 *
 * Defines asset categories and their value calculation strategies.
 * Crypto and stocks are currently discrete (snapshot-based) but are flagged
 * for potential future upgrade to continuous (price-based) calculation.
 */

import type { AssetCategoryConfig } from "./types";

// ═══════════════════════════════════════════════════════════════
// Asset Category Configuration
// ═══════════════════════════════════════════════════════════════

/**
 * All asset categories supported by the performance service
 *
 * Value Type Strategy:
 * - discrete: Uses portfolio snapshots from Convex (taken at sync time)
 * - continuous: Uses real-time price data to calculate value at any timestamp
 *
 * Current Classification:
 * - Discrete: Cash, Equities, Bonds, Crypto, Real Estate, Pension, Other Assets
 * - Continuous: Commodities (Precious Metals)
 */
export const ASSET_CATEGORIES: AssetCategoryConfig[] = [
  // ─────────────────────────────────────────────────────────────
  // Discrete Assets (Snapshot-based)
  // ─────────────────────────────────────────────────────────────
  {
    id: "cash",
    name: "Cash & Bank Accounts",
    valueType: "discrete",
    snapshotCategory: "cash",
    canUpgradeToContinuous: false,
  },
  {
    id: "equities",
    name: "Stocks & ETFs",
    valueType: "discrete",
    snapshotCategory: "equities",
    // Could be upgraded once we integrate real-time stock price APIs
    canUpgradeToContinuous: true,
  },
  {
    id: "bonds",
    name: "Bonds & Fixed Income",
    valueType: "discrete",
    snapshotCategory: "bonds",
    canUpgradeToContinuous: false,
  },
  {
    id: "crypto",
    name: "Cryptocurrency",
    valueType: "discrete",
    snapshotCategory: "crypto",
    // Could be upgraded once we integrate crypto price APIs
    canUpgradeToContinuous: true,
  },
  {
    id: "real-estate",
    name: "Real Estate",
    valueType: "discrete",
    snapshotCategory: "real-estate",
    canUpgradeToContinuous: false,
  },
  {
    id: "pension",
    name: "Pension & Retirement",
    valueType: "discrete",
    snapshotCategory: "pension",
    canUpgradeToContinuous: false,
  },
  {
    id: "other-assets",
    name: "Other Assets",
    valueType: "discrete",
    snapshotCategory: "other-assets",
    canUpgradeToContinuous: false,
  },

  // ─────────────────────────────────────────────────────────────
  // Continuous Assets (Price-based)
  // ─────────────────────────────────────────────────────────────
  {
    id: "commodities",
    name: "Precious Metals",
    valueType: "continuous",
    priceProvider: "metals",
    canUpgradeToContinuous: false, // Already continuous
  },
];

// ═══════════════════════════════════════════════════════════════
// Lookup Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Map of category ID to config for O(1) lookup
 */
export const ASSET_CATEGORY_MAP = new Map<string, AssetCategoryConfig>(
  ASSET_CATEGORIES.map((c) => [c.id, c]),
);

/**
 * Get asset category configuration by ID
 */
export function getAssetCategory(id: string): AssetCategoryConfig | undefined {
  return ASSET_CATEGORY_MAP.get(id);
}

/**
 * Get all discrete asset categories
 */
export function getDiscreteCategories(): AssetCategoryConfig[] {
  return ASSET_CATEGORIES.filter((c) => c.valueType === "discrete");
}

/**
 * Get all continuous asset categories
 */
export function getContinuousCategories(): AssetCategoryConfig[] {
  return ASSET_CATEGORIES.filter((c) => c.valueType === "continuous");
}

/**
 * Get categories that can be upgraded to continuous
 */
export function getUpgradeableCategories(): AssetCategoryConfig[] {
  return ASSET_CATEGORIES.filter((c) => c.canUpgradeToContinuous);
}

// ═══════════════════════════════════════════════════════════════
// Performance Calculation Defaults
// ═══════════════════════════════════════════════════════════════

/**
 * Default confidence threshold for data quality assessment
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

/**
 * Maximum interpolation gap before quality degrades
 * Expressed as a multiplier of the expected interval
 */
export const MAX_INTERPOLATION_GAP_MULTIPLIER = 3;

/**
 * Default time ranges to show in UI
 */
export const DEFAULT_TIME_RANGE_OPTIONS = [
  "1D",
  "1W",
  "1M",
  "3M",
  "6M",
  "YTD",
  "1Y",
  "ALL",
] as const;

/**
 * Platform launch date - earliest possible data
 */
export const PLATFORM_LAUNCH_DATE = new Date("2024-01-01T00:00:00Z");
export const PLATFORM_LAUNCH_TIMESTAMP = PLATFORM_LAUNCH_DATE.getTime();
