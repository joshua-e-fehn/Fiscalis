/**
 * Portfolio Types
 *
 * Unified types for aggregating positions and data across
 * all financial providers (Plaid, SnapTrade, Vezgo) and manual entries.
 */

import type { Id } from "../../convex/_generated/dataModel";

/**
 * Supported financial data providers
 */
export type FinancialProvider = "plaid" | "snaptrade" | "vezgo" | "manual";

/**
 * Provider metadata for display
 */
export interface ProviderInfo {
  id: FinancialProvider;
  name: string;
  description: string;
  color: string;
  category: "banking" | "brokers" | "crypto" | "manual";
}

/**
 * Provider information lookup
 */
export const PROVIDER_INFO: Record<FinancialProvider, ProviderInfo> = {
  plaid: {
    id: "plaid",
    name: "Plaid",
    description: "Banking & Cash",
    color: "#00D084",
    category: "banking",
  },
  snaptrade: {
    id: "snaptrade",
    name: "SnapTrade",
    description: "Brokers & Securities",
    color: "#6366F1",
    category: "brokers",
  },
  vezgo: {
    id: "vezgo",
    name: "Vezgo",
    description: "Cryptocurrency",
    color: "#F7931A",
    category: "crypto",
  },
  manual: {
    id: "manual",
    name: "Manual",
    description: "Manual Entries",
    color: "#8B5CF6",
    category: "manual",
  },
};

/**
 * Unified asset category for cross-provider aggregation
 */
export type UnifiedAssetCategory =
  | "cash"
  | "equities"
  | "bonds"
  | "crypto"
  | "defi"
  | "nft"
  | "real-estate"
  | "commodities"
  | "collectibles"
  | "other";

/**
 * Unified position that normalizes data from all providers
 */
export interface UnifiedPosition {
  /** Unique identifier (provider-specific ID) */
  id: string;

  /** Original Convex document ID */
  _id:
    | Id<"plaidAccounts">
    | Id<"brokerPositions">
    | Id<"vezgoPositions">
    | string;

  /** Source provider */
  provider: FinancialProvider;

  /** Unified category for grouping */
  category: UnifiedAssetCategory;

  /** Provider-specific subcategory */
  subcategory?: string;

  /** Asset symbol (ticker, account type, or crypto symbol) */
  symbol: string;

  /** Display name */
  name: string;

  /** Quantity (shares, units, or 1 for accounts) */
  quantity: number;

  /** Current price per unit (if applicable) */
  currentPrice?: number;

  /** Total market value in original currency */
  marketValue: number;

  /** Original currency */
  currency: string;

  /** Value in base currency (EUR) */
  valueInBaseCurrency?: number;

  /** Base currency used for conversion */
  baseCurrency?: string;

  /** Cost basis for P&L calculation */
  costBasis?: number;

  /** Unrealized profit/loss */
  unrealizedPL?: number;

  /** Unrealized P&L percentage */
  unrealizedPLPercent?: number;

  /** Last sync timestamp */
  lastSyncAt: number;

  /** Additional metadata based on provider */
  metadata?: {
    // Plaid-specific
    accountId?: string;
    institutionName?: string;
    accountType?: string;

    // SnapTrade-specific
    brokerName?: string;
    isin?: string;
    assetType?: string;

    // Vezgo-specific
    chain?: string;
    protocol?: string;
    contractAddress?: string;
    tokenId?: string;
    imageUrl?: string;
  };
}

/**
 * Provider allocation data for charts
 */
export interface ProviderAllocation {
  provider: FinancialProvider;
  name: string;
  value: number;
  percentage: number;
  color: string;
  positionsCount: number;
  connectionsCount: number;
}

/**
 * Category allocation within a provider
 */
export interface CategoryAllocation {
  category: UnifiedAssetCategory;
  name: string;
  value: number;
  percentage: number;
  positionsCount: number;
}

/**
 * Net worth breakdown by provider
 */
export interface NetWorthByProvider {
  total: number;
  providers: {
    plaid: {
      total: number;
      cash: number;
      investments: number;
      accountsCount: number;
    };
    snaptrade: {
      total: number;
      equities: number;
      bonds: number;
      cash: number;
      other: number;
      positionsCount: number;
      accountsCount: number;
    };
    vezgo: {
      total: number;
      crypto: number;
      defi: number;
      nft: number;
      positionsCount: number;
      connectionsCount: number;
    };
  };
  lastUpdated: number;
}

/**
 * Unified transaction across providers
 */
export interface UnifiedTransaction {
  id: string;
  provider: FinancialProvider;
  type: string;
  symbol?: string;
  name: string;
  amount: number;
  currency: string;
  date: string;
  description?: string;

  metadata?: {
    // Plaid
    merchantName?: string;
    plaidCategory?: string;

    // SnapTrade
    brokerName?: string;
    settlementDate?: string;

    // Vezgo
    txHash?: string;
    chain?: string;
    fromAddress?: string;
    toAddress?: string;
  };
}

/**
 * Helper to map Plaid account type to unified category
 */
export function plaidTypeToCategory(
  type: string,
  subtype?: string,
): UnifiedAssetCategory {
  const typeMap: Record<string, UnifiedAssetCategory> = {
    depository: "cash",
    checking: "cash",
    savings: "cash",
    investment: "equities",
    brokerage: "equities",
    credit: "cash", // Negative value
    loan: "cash", // Liability
    mortgage: "real-estate", // Associated with real estate
  };

  return typeMap[type] || typeMap[subtype || ""] || "other";
}

/**
 * Helper to map SnapTrade asset type to unified category
 */
export function snaptradeTypeToCategory(
  assetType: string,
): UnifiedAssetCategory {
  const typeMap: Record<string, UnifiedAssetCategory> = {
    equity: "equities",
    etf: "equities",
    stock: "equities",
    mutual_fund: "equities",
    option: "equities",
    bond: "bonds",
    fixed_income: "bonds",
    cryptocurrency: "crypto",
    forex: "cash",
    cash: "cash",
    other: "other",
  };

  return typeMap[assetType.toLowerCase()] || "other";
}

/**
 * Helper to map Vezgo category to unified category
 */
export function vezgoTypeToCategory(
  category: "cryptocurrency" | "token" | "stablecoin" | "defi" | "nft",
): UnifiedAssetCategory {
  const typeMap: Record<string, UnifiedAssetCategory> = {
    cryptocurrency: "crypto",
    token: "crypto",
    stablecoin: "crypto",
    defi: "defi",
    nft: "nft",
  };

  return typeMap[category] || "crypto";
}

/**
 * Helper to get display name for unified category
 */
export function getCategoryDisplayName(category: UnifiedAssetCategory): string {
  const names: Record<UnifiedAssetCategory, string> = {
    cash: "Cash & Savings",
    equities: "Equities",
    bonds: "Bonds",
    crypto: "Cryptocurrency",
    defi: "DeFi",
    nft: "NFTs",
    "real-estate": "Real Estate",
    commodities: "Commodities",
    collectibles: "Collectibles",
    other: "Other",
  };

  return names[category];
}

/**
 * Category colors for charts
 */
export const CATEGORY_COLORS: Record<UnifiedAssetCategory, string> = {
  cash: "#22C55E", // Green
  equities: "#3B82F6", // Blue
  bonds: "#8B5CF6", // Purple
  crypto: "#F7931A", // Bitcoin orange
  defi: "#EC4899", // Pink
  nft: "#14B8A6", // Teal
  "real-estate": "#F59E0B", // Amber
  commodities: "#EAB308", // Yellow (gold-like)
  collectibles: "#EF4444", // Red
  other: "#6B7280", // Gray
};
