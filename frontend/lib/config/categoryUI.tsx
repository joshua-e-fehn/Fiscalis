/**
 * Investment Category UI Configuration
 *
 * Layer 2 of the two-layer category system. Builds on top of the canonical
 * types in classification.ts to provide UI-specific metadata for each
 * subcategory, with compile-time enforcement that every subcategory is
 * accounted for.
 *
 * classification.ts (Layer 1) → categoryUI.ts (Layer 2) → page.tsx / hooks
 *
 * Adding a subcategory to classification.ts without adding it here
 * will cause a TypeScript compile error.
 */

import { createElement, type ComponentType } from "react";
import {
  // Cash icons
  Wallet,
  PiggyBank,
  Landmark,
  Clock,
  Banknote,
  ArrowRightLeft,
  ChartCandlestick,
  // Equities icons
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  Briefcase,
  // Bonds icons
  Building,
  Building2,
  // Crypto icons
  Bitcoin,
  Coins,
  CircleDollarSign,
  Layers,
  // Commodities icons
  Fuel,
  Factory,
  Wheat,
  Atom,
  Gem,
  // Real Estate icons
  Home,
  Users,
  TreePine,
  // Collectibles icons
  Palette,
  Wine,
  Watch,
  Car,
  IdCardLanyard,
  Image,
  Stamp,
  Package,
  // Liabilities icons
  CreditCard,
  TrendingDown,
} from "lucide-react";
import { Icon } from "lucide-react";
import { gemRing } from "@lucide/lab";

import type {
  CashSubcategory,
  EquitiesSubcategory,
  BondsSubcategory,
  CryptoSubcategory,
  CommoditiesSubcategory,
  RealEstateSubcategory,
  CollectiblesSubcategory,
  LiabilitiesSubcategory,
  InvestmentCategory,
} from "@/lib/types/classification";
import type { SubcategoryData } from "@/lib/types/investments";

// ═══════════════════════════════════════════════════════════════
// COLOR PALETTES (single source of truth)
// ═══════════════════════════════════════════════════════════════

/**
 * Color palettes for every investment category.
 *
 * Each entry maps subcategory slugs (plus a `primary` key for the
 * overall category colour) to hex strings.  Moved here from
 * investments.ts so that all UI metadata lives in one file.
 */
export const categoryColorPalettes: Record<
  InvestmentCategory,
  Record<string, string>
> = {
  equities: {
    primary: "#4F46E5", // Indigo - main category color
    stocks: "#4F46E5", // Indigo
    etfs: "#0EA5E9", // Sky blue
    funds: "#8B5CF6", // Violet
    options: "#F97316", // Orange
    private: "#EC4899", // Pink
  },
  commodities: {
    primary: "#FFD700", // Gold - main category color
    metals: "#FFD700", // Gold
    energy: "#F97316", // Orange
    industrial: "#64748B", // Slate
    agricultural: "#22C55E", // Green
    "rare-earth": "#A855F7", // Purple
    gemstones: "#06B6D4", // Cyan
  },
  bonds: {
    primary: "#1E40AF", // Blue - main category color
    government: "#1E40AF", // Blue
    corporate: "#059669", // Emerald
    municipal: "#7C3AED", // Purple
    savings: "#F59E0B", // Amber
    funds: "#6366F1", // Indigo
  },
  "real-estate": {
    primary: "#10B981", // Emerald - main category color
    residential: "#10B981", // Emerald
    commercial: "#3B82F6", // Blue
    reits: "#8B5CF6", // Violet
    crowdfunding: "#F59E0B", // Amber
    land: "#84CC16", // Lime
  },
  cash: {
    primary: "#22C55E", // Green - main category color
    "savings-accounts": "#22C55E", // Green
    "checking-accounts": "#10B981", // Emerald
    "money-market": "#0EA5E9", // Sky
    cds: "#6366F1", // Indigo
    "treasury-bills": "#F59E0B", // Amber
    forex: "#8B5CF6", // Violet
    "broker-cash": "#64748B", // Slate
  },
  crypto: {
    primary: "#F7931A", // Bitcoin orange - main category color
    bitcoin: "#F7931A", // Bitcoin orange
    ethereum: "#627EEA", // Ethereum blue
    altcoins: "#8B5CF6", // Violet
    stablecoins: "#22C55E", // Green
    defi: "#EC4899", // Pink
  },
  collectibles: {
    primary: "#8B5CF6", // Violet - main category color
    art: "#8B5CF6", // Violet
    watches: "#0EA5E9", // Sky
    wine: "#DC2626", // Red
    cars: "#64748B", // Slate
    jewelry: "#EC4899", // Pink
    "trading-cards": "#F97316", // Orange
    memorabilia: "#F59E0B", // Amber
    nfts: "#06B6D4", // Cyan
    other: "#6B7280", // Gray
  },
  liabilities: {
    primary: "#EF4444", // Red - main category color
    mortgages: "#EF4444", // Red
    loans: "#F97316", // Orange
    "credit-cards": "#F59E0B", // Amber
    "margin-loans": "#DC2626", // Dark red
  },
};

/**
 * Primary (headline) colour for each investment category.
 * Derived from `categoryColorPalettes` so there is one source of truth.
 */
export const categoryPrimaryColors: Record<InvestmentCategory, string> =
  Object.fromEntries(
    (Object.keys(categoryColorPalettes) as InvestmentCategory[]).map((cat) => [
      cat,
      categoryColorPalettes[cat].primary,
    ]),
  ) as Record<InvestmentCategory, string>;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * UI metadata for a single subcategory.
 * Every subcategory in classification.ts MUST have an entry.
 */
export interface SubcategoryUIMeta {
  /** Display title for the card */
  title: string;
  /** Short description of the subcategory */
  description: string;
  /** Lucide icon component */
  icon: ComponentType<{ className?: string }>;
  /** Example items shown as tags on the card */
  examples: string[];
  /** Hex color for the icon background */
  color: string;
  /** Route to the subcategory detail page */
  href: string;
  /** Whether the subcategory page is implemented */
  implemented: boolean;
  /**
   * If set, this subcategory is merged with others sharing the same
   * displayGroup key into a single UI card. The merged card uses
   * metadata from the corresponding DisplayGroupOverride.
   */
  displayGroup?: string;
  /**
   * Optional section grouping for page-level layout splitting.
   * E.g. equities uses "public" | "private" to split into two grids.
   */
  section?: string;
}

/**
 * Override metadata for a display group (merged card).
 * Used when multiple subcategories should render as one card.
 */
export interface DisplayGroupOverride {
  /** Matches the `displayGroup` key on SubcategoryUIMeta entries */
  key: string;
  /** Title for the merged card */
  title: string;
  /** Description for the merged card */
  description: string;
  /** Icon for the merged card */
  icon: ComponentType<{ className?: string }>;
  /** Combined examples */
  examples: string[];
  /** Route for the merged card */
  href: string;
  /** Hex color for the merged card */
  color: string;
}

/**
 * Card data ready for rendering by SubcategoryCategoryCard.
 * This matches the existing SubcategoryCardData interface.
 */
export interface CategoryCardData {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
  color?: string;
  /** Optional section for page-level grouping */
  section?: string;
  /** The classification subcategory slugs this card covers */
  subcategories: string[];
}

// ═══════════════════════════════════════════════════════════════
// WRAPPER ICONS
// ═══════════════════════════════════════════════════════════════

/** Lab icon wrapper for gemRing (Jewelry) */
const GemRingIcon = ({ className }: { className?: string }) => (
  <Icon iconNode={gemRing} className={className} />
);

// ═══════════════════════════════════════════════════════════════
// SUBCATEGORY UI DEFINITIONS (Exhaustive Records)
// ═══════════════════════════════════════════════════════════════

// --- Cash ---
const cashColors = categoryColorPalettes.cash;

export const cashSubcategoryUI: Record<CashSubcategory, SubcategoryUIMeta> = {
  "checking-accounts": {
    title: "Checking Accounts",
    description: "Everyday transaction accounts linked via banking connections",
    icon: Wallet,
    examples: ["Personal Checking", "Business Checking", "Joint Accounts"],
    color: cashColors["checking-accounts"],
    href: "/cash/checking",
    implemented: false,
  },
  "savings-accounts": {
    title: "Savings Accounts",
    description: "High-yield savings accounts and regular bank savings",
    icon: PiggyBank,
    examples: [
      "High-Yield Savings",
      "Regular Savings",
      "Online Savings",
      "Business Savings",
    ],
    color: cashColors["savings-accounts"],
    href: "/cash/savings",
    implemented: false,
  },
  "money-market": {
    title: "Money Market Funds",
    description: "Short-term, low-risk investment funds with high liquidity",
    icon: Landmark,
    examples: ["Government MMF", "Prime MMF", "Tax-Exempt MMF", "Retail MMF"],
    color: cashColors["money-market"],
    href: "/cash/money-market",
    implemented: false,
  },
  cds: {
    title: "Certificates of Deposit",
    description: "Fixed-term deposits with guaranteed interest rates",
    icon: Clock,
    examples: ["3-Month CD", "6-Month CD", "1-Year CD", "CD Ladders"],
    color: cashColors.cds,
    href: "/cash/cds",
    implemented: false,
  },
  "treasury-bills": {
    title: "Treasury Bills",
    description:
      "Short-term government securities with maturities under one year",
    icon: Banknote,
    examples: [
      "4-Week T-Bill",
      "8-Week T-Bill",
      "13-Week T-Bill",
      "26-Week T-Bill",
    ],
    color: cashColors["treasury-bills"],
    href: "/cash/tbills",
    implemented: false,
  },
  forex: {
    title: "Foreign Currency (Forex)",
    description: "Foreign currency holdings and exchange positions",
    icon: ArrowRightLeft,
    examples: ["EUR", "GBP", "JPY", "CHF"],
    color: cashColors.forex,
    href: "/cash/forex",
    implemented: false,
  },
  "broker-cash": {
    title: "Broker Cash",
    description:
      "Uninvested cash held in brokerage accounts, auto-detected from broker connections",
    icon: ChartCandlestick,
    examples: ["Settlement Cash", "Sweep Accounts", "Margin Cash"],
    color: cashColors["broker-cash"],
    href: "/cash/broker-cash",
    implemented: false,
  },
};

// --- Equities ---
const equitiesColors = categoryColorPalettes.equities;

export const equitiesSubcategoryUI: Record<
  EquitiesSubcategory,
  SubcategoryUIMeta
> = {
  stocks: {
    title: "Public Stocks",
    description: "Individual company shares traded on public stock exchanges",
    icon: TrendingUp,
    examples: ["Apple", "Microsoft", "Tesla", "Amazon"],
    color: equitiesColors.stocks,
    href: "/equities/stocks",
    implemented: false,
    section: "public",
  },
  etfs: {
    title: "ETFs & Index Funds",
    description:
      "Passive funds tracking market indices for diversified exposure",
    icon: BarChart3,
    examples: ["S&P 500", "MSCI World", "NASDAQ-100", "DAX"],
    color: equitiesColors.etfs,
    href: "/equities/etfs",
    implemented: false,
    section: "public",
  },
  funds: {
    title: "Mutual Funds",
    description:
      "Actively managed investment funds with professional portfolio management",
    icon: PieChart,
    examples: ["Growth Funds", "Value Funds", "Sector Funds", "Balanced Funds"],
    color: equitiesColors.funds,
    href: "/equities/funds",
    implemented: false,
    section: "public",
  },
  options: {
    title: "Options",
    description: "Derivative contracts for hedging or leveraged exposure",
    icon: Activity,
    examples: ["Call Options", "Put Options", "Spreads", "Covered Calls"],
    color: equitiesColors.options,
    href: "/equities/options",
    implemented: false,
    section: "public",
  },
  private: {
    title: "Private Equity",
    description:
      "Investments in private companies, startups, and angel investments",
    icon: Briefcase,
    examples: ["Startups", "Venture Capital", "Angel Investments", "PE Funds"],
    color: equitiesColors.private,
    href: "/equities/private",
    implemented: false,
    section: "private",
  },
};

// --- Bonds ---
const bondsColors = categoryColorPalettes.bonds;

export const bondsSubcategoryUI: Record<BondsSubcategory, SubcategoryUIMeta> = {
  government: {
    title: "Government Bonds",
    description:
      "Treasury bills, notes, and bonds issued by national governments including inflation-protected securities",
    icon: Landmark,
    examples: ["US Treasuries", "German Bunds", "UK Gilts", "TIPS/I-Bonds"],
    color: bondsColors.government,
    href: "/bonds/government",
    implemented: false,
  },
  corporate: {
    title: "Corporate Bonds",
    description: "Investment-grade and high-yield bonds issued by corporations",
    icon: Building,
    examples: [
      "Investment Grade",
      "High Yield",
      "Convertible Bonds",
      "Green Bonds",
    ],
    color: bondsColors.corporate,
    href: "/bonds/corporate",
    implemented: false,
  },
  municipal: {
    title: "Municipal Bonds",
    description:
      "Tax-advantaged bonds issued by states, cities, and local governments",
    icon: Building2,
    examples: [
      "General Obligation",
      "Revenue Bonds",
      "Tax-Free Munis",
      "Build America",
    ],
    color: bondsColors.municipal,
    href: "/bonds/municipal",
    implemented: false,
  },
  savings: {
    title: "Savings Bonds",
    description: "Government-backed savings certificates and retail bonds",
    icon: PiggyBank,
    examples: [
      "Series I Bonds",
      "Series EE Bonds",
      "Premium Bonds",
      "Savings Certificates",
    ],
    color: bondsColors.savings,
    href: "/bonds/savings",
    implemented: false,
  },
  funds: {
    title: "Bond Funds & ETFs",
    description: "Diversified fixed income exposure through funds and ETFs",
    icon: BarChart3,
    examples: ["Aggregate Bond", "Short-Term", "Long-Term", "International"],
    color: bondsColors.funds,
    href: "/bonds/funds",
    implemented: false,
  },
};

// --- Crypto ---
const cryptoColors = categoryColorPalettes.crypto;

export const cryptoSubcategoryUI: Record<CryptoSubcategory, SubcategoryUIMeta> =
  {
    bitcoin: {
      title: "Bitcoin",
      description: "Bitcoin and wrapped Bitcoin tokens",
      icon: Bitcoin,
      examples: ["BTC", "WBTC"],
      color: cryptoColors.bitcoin,
      href: "/assets/crypto/btc-eth",
      implemented: false,
      displayGroup: "btc-eth",
    },
    ethereum: {
      title: "Ethereum",
      description: "Ethereum and liquid staking tokens",
      icon: Bitcoin, // Overridden by display group
      examples: ["ETH", "stETH", "rETH", "WETH"],
      color: cryptoColors.ethereum,
      href: "/assets/crypto/btc-eth",
      implemented: false,
      displayGroup: "btc-eth",
    },
    altcoins: {
      title: "Altcoins",
      description: "Alternative cryptocurrencies beyond BTC and ETH",
      icon: Coins,
      examples: ["SOL", "ADA", "AVAX", "DOT", "MATIC"],
      color: cryptoColors.altcoins,
      href: "/assets/crypto/altcoins",
      implemented: false,
    },
    stablecoins: {
      title: "Stablecoins",
      description: "Price-stable cryptocurrencies pegged to fiat currencies",
      icon: CircleDollarSign,
      examples: ["USDT", "USDC", "DAI", "FRAX"],
      color: cryptoColors.stablecoins,
      href: "/assets/crypto/stablecoins",
      implemented: false,
    },
    defi: {
      title: "DeFi",
      description:
        "Decentralized finance positions including staking and liquidity",
      icon: Layers,
      examples: ["Staking", "LP Positions", "Yield Farming", "Lending"],
      color: cryptoColors.defi,
      href: "/assets/crypto/defi",
      implemented: false,
    },
  };

/** Display group overrides for crypto (BTC + ETH merged card) */
export const cryptoDisplayGroups: DisplayGroupOverride[] = [
  {
    key: "btc-eth",
    title: "Bitcoin & Ethereum",
    description: "The two largest cryptocurrencies and their ecosystem tokens",
    icon: Bitcoin,
    examples: ["BTC", "WBTC", "ETH", "stETH", "rETH", "WETH"],
    href: "/assets/crypto/btc-eth",
    color: cryptoColors.bitcoin,
  },
];

// --- Commodities ---
const commoditiesColors = categoryColorPalettes.commodities;

export const commoditiesSubcategoryUI: Record<
  CommoditiesSubcategory,
  SubcategoryUIMeta
> = {
  metals: {
    title: "Precious Metals",
    description:
      "Track gold, silver, platinum, and palladium prices with real-time charts",
    icon: Coins,
    examples: ["Gold", "Silver", "Platinum", "Palladium"],
    color: commoditiesColors.metals,
    href: "/assets/commodities/metals",
    implemented: true,
  },
  energy: {
    title: "Energy",
    description: "Oil, natural gas, and other energy commodity prices",
    icon: Fuel,
    examples: ["Crude Oil", "Natural Gas", "Heating Oil", "Gasoline"],
    color: commoditiesColors.energy,
    href: "/assets/commodities/energy",
    implemented: false,
  },
  industrial: {
    title: "Industrial Metals",
    description: "Base metals used in manufacturing and construction",
    icon: Factory,
    examples: ["Copper", "Aluminum", "Zinc", "Nickel"],
    color: commoditiesColors.industrial,
    href: "/assets/commodities/industrial",
    implemented: false,
  },
  agricultural: {
    title: "Agricultural",
    description: "Grains, softs, and other agricultural commodities",
    icon: Wheat,
    examples: ["Wheat", "Corn", "Soybeans", "Coffee"],
    color: commoditiesColors.agricultural,
    href: "/assets/commodities/agricultural",
    implemented: false,
  },
  "rare-earth": {
    title: "Rare Earth",
    description: "Strategic rare earth elements used in technology and defense",
    icon: Atom,
    examples: ["Neodymium", "Dysprosium", "Lithium", "Cobalt"],
    color: commoditiesColors["rare-earth"],
    href: "/assets/commodities/rare-earth",
    implemented: false,
  },
  gemstones: {
    title: "Gemstones",
    description: "Diamonds, rubies, sapphires, and other precious gemstones",
    icon: Gem,
    examples: ["Diamonds", "Rubies", "Sapphires", "Emeralds"],
    color: commoditiesColors.gemstones,
    href: "/assets/commodities/gemstones",
    implemented: false,
  },
};

// --- Real Estate ---
const realEstateColors = categoryColorPalettes["real-estate"];

export const realEstateSubcategoryUI: Record<
  RealEstateSubcategory,
  SubcategoryUIMeta
> = {
  residential: {
    title: "Residential",
    description:
      "Single-family homes, apartments, condos, and vacation properties",
    icon: Home,
    examples: ["Primary Home", "Rental Properties", "Vacation Homes", "Condos"],
    color: realEstateColors.residential,
    href: "/real-estate/residential",
    implemented: false,
  },
  commercial: {
    title: "Commercial",
    description:
      "Office buildings, retail spaces, warehouses, and industrial properties",
    icon: Building2,
    examples: ["Office Space", "Retail", "Warehouses", "Mixed-Use"],
    color: realEstateColors.commercial,
    href: "/real-estate/commercial",
    implemented: false,
  },
  reits: {
    title: "REITs",
    description:
      "Real Estate Investment Trusts - publicly traded real estate securities",
    icon: BarChart3,
    examples: ["Equity REITs", "Mortgage REITs", "Hybrid REITs", "REIT ETFs"],
    color: realEstateColors.reits,
    href: "/real-estate/reits",
    implemented: false,
  },
  crowdfunding: {
    title: "Crowdfunding",
    description: "Real estate investments through crowdfunding platforms",
    icon: Users,
    examples: ["Fundrise", "CrowdStreet", "RealtyMogul", "Groundfloor"],
    color: realEstateColors.crowdfunding,
    href: "/real-estate/crowdfunding",
    implemented: false,
  },
  land: {
    title: "Land",
    description: "Raw land, farmland, and undeveloped property investments",
    icon: TreePine,
    examples: ["Raw Land", "Farmland", "Timber", "Development Land"],
    color: realEstateColors.land,
    href: "/real-estate/land",
    implemented: false,
  },
};

// --- Collectibles ---
const collectiblesColors = categoryColorPalettes.collectibles;

export const collectiblesSubcategoryUI: Record<
  CollectiblesSubcategory,
  SubcategoryUIMeta
> = {
  art: {
    title: "Art",
    description: "Fine art, paintings, sculptures, and artistic collectibles",
    icon: Palette,
    examples: ["Paintings", "Sculptures", "Prints", "Photography"],
    color: collectiblesColors.art,
    href: "/collectibles/art",
    implemented: false,
  },
  watches: {
    title: "Watches",
    description: "Luxury timepieces and vintage watch collections",
    icon: Watch,
    examples: ["Rolex", "Patek Philippe", "Audemars Piguet", "Omega"],
    color: collectiblesColors.watches,
    href: "/collectibles/watches",
    implemented: false,
  },
  wine: {
    title: "Wine",
    description: "Fine wines and vintage bottles as investment assets",
    icon: Wine,
    examples: ["Bordeaux", "Burgundy", "Champagne", "Napa Valley"],
    color: collectiblesColors.wine,
    href: "/collectibles/wine",
    implemented: false,
  },
  cars: {
    title: "Classic Cars",
    description: "Vintage automobiles and collector vehicles",
    icon: Car,
    examples: ["Porsche", "Ferrari", "Mercedes-Benz", "Muscle Cars"],
    color: collectiblesColors.cars,
    href: "/collectibles/cars",
    implemented: false,
  },
  jewelry: {
    title: "Jewelry",
    description: "Precious jewelry, gemstones, and designer pieces",
    icon: GemRingIcon,
    examples: [
      "Diamonds",
      "Colored Gems",
      "Vintage Jewelry",
      "Designer Pieces",
    ],
    color: collectiblesColors.jewelry,
    href: "/collectibles/jewelry",
    implemented: false,
  },
  "trading-cards": {
    title: "Trading Cards",
    description:
      "Sports cards, Pokémon, Magic: The Gathering, and other collectible cards",
    icon: IdCardLanyard,
    examples: ["Sports Cards", "Pokémon", "Magic: The Gathering", "Yu-Gi-Oh!"],
    color: collectiblesColors["trading-cards"],
    href: "/collectibles/cards",
    implemented: false,
  },
  memorabilia: {
    title: "Memorabilia & Ephemera",
    description:
      "Numismatic coins, stamps, postcards, and historical collectibles (not bullion)",
    icon: Stamp,
    examples: ["Numismatic Coins", "Stamps", "Postcards", "Historical Items"],
    color: collectiblesColors.memorabilia,
    href: "/collectibles/memorabilia",
    implemented: false,
  },
  nfts: {
    title: "NFTs",
    description: "Non-fungible tokens and digital collectibles",
    icon: Image,
    examples: ["Art NFTs", "PFP Collections", "Gaming NFTs", "Music NFTs"],
    color: collectiblesColors.nfts,
    href: "/collectibles/nfts",
    implemented: false,
  },
  other: {
    title: "Other Collectibles",
    description: "Any collectible items not covered by other categories",
    icon: Package,
    examples: ["Toys", "Memorabilia", "Antiques", "Rare Books"],
    color: collectiblesColors.other,
    href: "/collectibles/other",
    implemented: false,
  },
};

// --- Liabilities ---
const liabilitiesColors = categoryColorPalettes.liabilities;

export const liabilitiesSubcategoryUI: Record<
  LiabilitiesSubcategory,
  SubcategoryUIMeta
> = {
  mortgages: {
    title: "Mortgages",
    description: "Home loans and property mortgages",
    icon: Home,
    examples: ["Primary Residence", "Investment Property", "Second Home"],
    color: liabilitiesColors.mortgages,
    href: "/liabilities/mortgages",
    implemented: false,
  },
  loans: {
    title: "Loans",
    description: "Personal, auto, student, and other loans",
    icon: Banknote,
    examples: ["Auto Loans", "Student Loans", "Personal Loans"],
    color: liabilitiesColors.loans,
    href: "/liabilities/loans",
    implemented: false,
  },
  "credit-cards": {
    title: "Credit Cards",
    description: "Credit card balances and revolving credit",
    icon: CreditCard,
    examples: ["Visa", "Mastercard", "Amex", "Store Cards"],
    color: liabilitiesColors["credit-cards"],
    href: "/liabilities/credit-cards",
    implemented: false,
  },
  "margin-loans": {
    title: "Margin Loans",
    description: "Borrowed funds from brokerage accounts",
    icon: TrendingDown,
    examples: ["Broker Margin", "Securities Lending"],
    color: liabilitiesColors["margin-loans"],
    href: "/liabilities/margin",
    implemented: false,
  },
};

// ═══════════════════════════════════════════════════════════════
// CARD BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Builds an array of CategoryCardData from a subcategory UI record,
 * merging display groups where configured.
 *
 * @param subcategoryUI - Exhaustive Record of subcategory → UI metadata
 * @param displayGroups - Optional display group overrides for merged cards
 * @returns Array of CategoryCardData ready for rendering
 */
export function buildCategoryCards(
  subcategoryUI: Record<string, SubcategoryUIMeta>,
  displayGroups?: DisplayGroupOverride[],
): CategoryCardData[] {
  const grouped = new Map<
    string,
    { metas: SubcategoryUIMeta[]; slugs: string[] }
  >();
  const ungrouped: CategoryCardData[] = [];

  for (const [slug, meta] of Object.entries(subcategoryUI)) {
    if (meta.displayGroup) {
      const existing = grouped.get(meta.displayGroup) ?? {
        metas: [],
        slugs: [],
      };
      existing.metas.push(meta);
      existing.slugs.push(slug);
      grouped.set(meta.displayGroup, existing);
    } else {
      ungrouped.push({
        title: meta.title,
        description: meta.description,
        href: meta.href,
        icon: meta.icon,
        implemented: meta.implemented,
        examples: meta.examples,
        color: meta.color,
        section: meta.section,
        subcategories: [slug],
      });
    }
  }

  const mergedCards: CategoryCardData[] = [];
  for (const [key, { metas, slugs }] of grouped) {
    const override = displayGroups?.find((g) => g.key === key);
    if (override) {
      mergedCards.push({
        title: override.title,
        description: override.description,
        href: override.href,
        icon: override.icon,
        implemented: metas.every((m) => m.implemented),
        examples: override.examples,
        color: override.color,
        section: metas[0]?.section,
        subcategories: slugs,
      });
    } else {
      // No override defined — fall back to first entry's metadata
      const first = metas[0];
      if (first) {
        mergedCards.push({
          title: first.title,
          description: first.description,
          href: first.href,
          icon: first.icon,
          implemented: first.implemented,
          examples: first.examples,
          color: first.color,
          section: first.section,
          subcategories: slugs,
        });
      }
    }
  }

  return [...mergedCards, ...ungrouped];
}

// ═══════════════════════════════════════════════════════════════
// PRE-BUILT CARD ARRAYS (ready for page.tsx consumption)
// ═══════════════════════════════════════════════════════════════

/** Cash category cards — all subcategories including broker-cash */
export const cashCategoryCards = buildCategoryCards(cashSubcategoryUI);

/** Equities category cards — all subcategories */
export const equitiesCategoryCards = buildCategoryCards(equitiesSubcategoryUI);

/** Equities — public markets only */
export const equitiesPublicCards = equitiesCategoryCards.filter(
  (c) => c.section === "public",
);

/** Equities — private markets only */
export const equitiesPrivateCards = equitiesCategoryCards.filter(
  (c) => c.section === "private",
);

/** Bonds category cards */
export const bondsCategoryCards = buildCategoryCards(bondsSubcategoryUI);

/** Crypto category cards (BTC + ETH merged into one card) */
export const cryptoCategoryCards = buildCategoryCards(
  cryptoSubcategoryUI,
  cryptoDisplayGroups,
);

/** Commodities category cards */
export const commoditiesCategoryCards = buildCategoryCards(
  commoditiesSubcategoryUI,
);

/** Real Estate category cards */
export const realEstateCategoryCards = buildCategoryCards(
  realEstateSubcategoryUI,
);

/** Collectibles category cards (9 subcategories) */
export const collectiblesCategoryCards = buildCategoryCards(
  collectiblesSubcategoryUI,
);

/** Liabilities category cards */
export const liabilitiesCategoryCards = buildCategoryCards(
  liabilitiesSubcategoryUI,
);

// ═══════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════

/** Map from category ID to its subcategory UI record */
export const subcategoryUIByCategory: Record<
  InvestmentCategory,
  Record<string, SubcategoryUIMeta>
> = {
  cash: cashSubcategoryUI,
  equities: equitiesSubcategoryUI,
  bonds: bondsSubcategoryUI,
  crypto: cryptoSubcategoryUI,
  commodities: commoditiesSubcategoryUI,
  "real-estate": realEstateSubcategoryUI,
  collectibles: collectiblesSubcategoryUI,
  liabilities: liabilitiesSubcategoryUI,
};

/**
 * Get the UI metadata for a specific subcategory within a category.
 */
export function getSubcategoryUI(
  category: InvestmentCategory,
  subcategory: string,
): SubcategoryUIMeta | undefined {
  return subcategoryUIByCategory[category]?.[subcategory];
}

// ═══════════════════════════════════════════════════════════════
// HOOK HELPER — SubcategoryData builder
// ═══════════════════════════════════════════════════════════════

/**
 * Create a base SubcategoryData from UI metadata for use in hooks.
 * Returns zero-value defaults that hooks can spread-override with real data.
 *
 * Usage in hooks:
 * ```ts
 * subcategories.push({
 *   ...makeSubcategoryBase("stocks", equitiesSubcategoryUI.stocks),
 *   totalValue: stocksData.total,
 *   costBasis: stocksCostBasis,
 *   // ... other runtime data
 * });
 * ```
 */
export function makeSubcategoryBase(
  slug: string,
  meta: SubcategoryUIMeta,
): SubcategoryData {
  return {
    id: slug,
    name: meta.title,
    href: meta.href,
    icon: createElement(meta.icon, { className: "h-4 w-4" }),
    color: meta.color,
    totalValue: 0,
    costBasis: null,
    profitLoss: null,
    profitLossPercent: null,
    topHoldings: [],
    holdingsCount: 0,
    implemented: meta.implemented,
  };
}
