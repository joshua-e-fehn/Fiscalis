/**
 * Investment Classification Types
 *
 * Type definitions for the classification system that maps
 * financial data from providers (Plaid, Snaptrade, Bitpanda) to
 * Fiscalis investment categories and subcategories.
 */

// ═══════════════════════════════════════════════════════════════
// INVESTMENT CATEGORIES
// ═══════════════════════════════════════════════════════════════

/**
 * Main investment categories
 */
export type InvestmentCategory =
  | "cash"
  | "equities"
  | "bonds"
  | "crypto"
  | "commodities"
  | "real-estate"
  | "collectibles"
  | "liabilities";

// ═══════════════════════════════════════════════════════════════
// SUBCATEGORIES BY CATEGORY
// ═══════════════════════════════════════════════════════════════

/**
 * Cash & Money Markets subcategories
 */
export type CashSubcategory =
  | "savings-accounts"
  | "checking-accounts"
  | "money-market"
  | "cds"
  | "treasury-bills"
  | "forex"
  | "broker-cash";

/**
 * Equities subcategories
 */
export type EquitiesSubcategory =
  | "stocks"
  | "etfs"
  | "funds"
  | "options"
  | "private";

/**
 * Bonds subcategories
 */
export type BondsSubcategory =
  | "government"
  | "corporate"
  | "municipal"
  | "savings"
  | "funds";

/**
 * Crypto subcategories
 */
export type CryptoSubcategory =
  | "bitcoin"
  | "ethereum"
  | "altcoins"
  | "stablecoins"
  | "defi";

/**
 * Commodities subcategories
 */
export type CommoditiesSubcategory =
  | "metals"
  | "energy"
  | "industrial"
  | "agricultural"
  | "rare-earth"
  | "gemstones";

/**
 * Real Estate subcategories
 */
export type RealEstateSubcategory =
  | "residential"
  | "commercial"
  | "reits"
  | "crowdfunding"
  | "land";

/**
 * Collectibles subcategories
 */
export type CollectiblesSubcategory =
  | "art"
  | "watches"
  | "wine"
  | "cars"
  | "jewelry"
  | "trading-cards"
  | "memorabilia" // Numismatic coins, stamps, historical ephemera (not bullion)
  | "nfts"
  | "other";

/**
 * Liabilities subcategories
 */
export type LiabilitiesSubcategory =
  | "mortgages"
  | "loans"
  | "credit-cards"
  | "margin-loans";

/**
 * Union of all subcategory types
 */
export type InvestmentSubcategory =
  | CashSubcategory
  | EquitiesSubcategory
  | BondsSubcategory
  | CryptoSubcategory
  | CommoditiesSubcategory
  | RealEstateSubcategory
  | CollectiblesSubcategory
  | LiabilitiesSubcategory;

/**
 * Mapping of categories to their valid subcategories
 */
export const subcategoriesByCategory: Record<
  InvestmentCategory,
  readonly InvestmentSubcategory[]
> = {
  cash: [
    "savings-accounts",
    "checking-accounts",
    "money-market",
    "cds",
    "treasury-bills",
    "forex",
    "broker-cash",
  ],
  equities: ["stocks", "etfs", "funds", "options", "private"],
  bonds: ["government", "corporate", "municipal", "savings", "funds"],
  crypto: ["bitcoin", "ethereum", "altcoins", "stablecoins", "defi"],
  commodities: [
    "metals",
    "energy",
    "industrial",
    "agricultural",
    "rare-earth",
    "gemstones",
  ],
  "real-estate": ["residential", "commercial", "reits", "crowdfunding", "land"],
  collectibles: [
    "art",
    "watches",
    "wine",
    "cars",
    "jewelry",
    "trading-cards",
    "memorabilia",
    "nfts",
    "other",
  ],
  liabilities: ["mortgages", "loans", "credit-cards", "margin-loans"],
} as const;

/**
 * Display names for subcategories
 */
export const subcategoryDisplayNames: Record<InvestmentSubcategory, string> = {
  // Cash
  "savings-accounts": "Savings Accounts",
  "checking-accounts": "Checking Accounts",
  "money-market": "Money Market Funds",
  cds: "Certificates of Deposit",
  "treasury-bills": "Treasury Bills",
  forex: "Foreign Currency",
  "broker-cash": "Broker Cash",
  // Equities
  stocks: "Stocks",
  etfs: "ETFs & Index Funds",
  funds: "Mutual Funds",
  options: "Options",
  private: "Private Equity",
  // Bonds
  government: "Government Bonds",
  corporate: "Corporate Bonds",
  municipal: "Municipal Bonds",
  savings: "Savings Bonds",
  // Crypto
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  altcoins: "Altcoins",
  stablecoins: "Stablecoins",
  defi: "DeFi",
  // Commodities
  metals: "Precious Metals",
  energy: "Energy",
  industrial: "Industrial Metals",
  agricultural: "Agricultural",
  "rare-earth": "Rare Earth",
  gemstones: "Gemstones",
  // Real Estate
  residential: "Residential",
  commercial: "Commercial",
  reits: "REITs",
  crowdfunding: "Crowdfunding",
  land: "Land",
  // Collectibles
  art: "Art",
  watches: "Watches",
  wine: "Wine",
  cars: "Classic Cars",
  jewelry: "Jewelry",
  "trading-cards": "Trading Cards",
  memorabilia: "Memorabilia & Ephemera",
  nfts: "NFTs",
  other: "Other",
  // Liabilities
  mortgages: "Mortgages",
  loans: "Loans",
  "credit-cards": "Credit Cards",
  "margin-loans": "Margin Loans",
};

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION RULES
// ═══════════════════════════════════════════════════════════════

/**
 * Rule matcher for account type-based classification (Plaid)
 */
export interface AccountTypeMatcher {
  type: "account_type";
  provider: "plaid";
  /** Account type values to match (e.g., ["depository:checking"]) */
  values: string[];
}

/**
 * Rule matcher for asset type-based classification (Snaptrade/Bitpanda)
 */
export interface AssetTypeMatcher {
  type: "asset_type";
  provider: "snaptrade" | "bitpanda";
  /** Asset type values to match (e.g., ["equity", "stock"]) */
  values: string[];
}

/**
 * Rule matcher for exact symbol matching
 */
export interface SymbolExactMatcher {
  type: "symbol_exact";
  /** Symbol values to match exactly (case-insensitive) */
  values: string[];
  /**
   * Only match holdings whose provider asset type is one of these
   * (case-insensitive); any asset type when absent
   */
  assetTypes?: string[];
}

/**
 * Rule matcher for symbol pattern (regex) matching
 */
export interface SymbolPatternMatcher {
  type: "symbol_pattern";
  /** Regex pattern to match symbol */
  regex: string;
}

/**
 * Rule matcher for name pattern (regex) matching
 */
export interface NamePatternMatcher {
  type: "name_pattern";
  /** Regex pattern to match name (case-insensitive) */
  regex: string;
}

/**
 * Rule matcher for custom logic
 */
export interface CustomMatcher {
  type: "custom";
  /** Name of the custom function to call */
  fn: string;
}

/**
 * Union of all rule matcher types
 */
export type RuleMatcher =
  | AccountTypeMatcher
  | AssetTypeMatcher
  | SymbolExactMatcher
  | SymbolPatternMatcher
  | NamePatternMatcher
  | CustomMatcher;

/**
 * Classification rule definition
 */
export interface ClassificationRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** Priority (higher = checked first) */
  priority: number;
  /** Matching criteria */
  matcher: RuleMatcher;
  /** Classification result */
  result: {
    category: InvestmentCategory;
    subcategory: InvestmentSubcategory;
  };
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Source of classification
 */
export type ClassificationSource =
  | "auto" // Automatically classified by rule engine
  | "user_override" // User manually changed classification
  | "admin"; // Admin/system override

/**
 * Result of classifying an item
 */
export interface ClassificationResult {
  /** Investment category */
  category: InvestmentCategory;
  /** Investment subcategory */
  subcategory: InvestmentSubcategory;
  /** Confidence score (0-1) */
  confidence: number;
  /** Rule ID that matched */
  ruleId: string;
  /** Rule name for display/audit */
  ruleName: string;
  /** Source of classification */
  source: ClassificationSource;
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION CONTEXT
// ═══════════════════════════════════════════════════════════════

/**
 * Context for Plaid account classification
 */
export interface PlaidAccountContext {
  provider: "plaid";
  /** Plaid account type (e.g., "depository", "credit", "loan") */
  type: string;
  /** Plaid account subtype (e.g., "checking", "savings", "credit card") */
  subtype: string | null;
  /** Account name */
  name: string;
  /** Current balance (for negative balance detection) */
  currentBalance?: number | null;
}

/**
 * Context for Snaptrade position classification
 */
export interface SnaptradePositionContext {
  provider: "snaptrade";
  /** Asset type from Snaptrade */
  assetType: string;
  /** Ticker symbol */
  symbol: string;
  /** Security name */
  name: string | null;
  /** Position quantity (for negative = short detection) */
  quantity: number;
  /** Market value (for negative = margin detection) */
  marketValue: number | null;
}

/**
 * Context for Bitpanda holding classification
 *
 * Bitpanda holds a mix of asset classes (crypto, metals, commodities,
 * stocks/ETFs, indices, fiat) behind a single read-only API key.
 * `assetType` is the normalized Bitpanda asset class (see services/bitpanda/normalize.ts).
 */
export interface BitpandaPositionContext {
  provider: "bitpanda";
  /** Normalized Bitpanda asset class: "crypto" | "metal" | "commodity" | "stock" | "etf" | "index" | "fiat" */
  assetType: string;
  /** Asset symbol (e.g., "BTC", "XAU", "TSLA", "EUR") */
  symbol: string;
  /** Asset name */
  name: string | null;
}

// ═══════════════════════════════════════════════════════════════
// HELPER TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a subcategory belongs to a category
 */
export function isValidSubcategory(
  category: InvestmentCategory,
  subcategory: InvestmentSubcategory,
): boolean {
  return subcategoriesByCategory[category].includes(subcategory);
}

/**
 * A user's category/subcategory override checked against the taxonomy.
 * `allowedCategories` narrows the categories an item may be moved to.
 * Throws on an unknown category, a subcategory that does not belong to it,
 * or a category outside `allowedCategories`, so an override can never
 * file an item under a value no query or card reads.
 */
export function parseClassificationOverride(
  category: string,
  subcategory: string,
  allowedCategories?: readonly InvestmentCategory[],
): { category: InvestmentCategory; subcategory: InvestmentSubcategory } {
  if (!Object.prototype.hasOwnProperty.call(subcategoriesByCategory, category)) {
    throw new Error(`Unknown category "${category}"`);
  }
  const typedCategory = category as InvestmentCategory;
  if (allowedCategories && !allowedCategories.includes(typedCategory)) {
    throw new Error(
      `This item can only be classified as ${allowedCategories.join(" or ")}`,
    );
  }
  const typedSubcategory = subcategory as InvestmentSubcategory;
  if (!isValidSubcategory(typedCategory, typedSubcategory)) {
    throw new Error(
      `"${subcategory}" is not a subcategory of "${category}"`,
    );
  }
  return { category: typedCategory, subcategory: typedSubcategory };
}
