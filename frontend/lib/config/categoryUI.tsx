/**
 * Investment Category UI Configuration
 *
 * Holds slugs, icons, colours and routes only: every name, description and
 * example lives in the `categories` message namespace, under the entry's
 * SubcategoryLabel, and is rendered through useCategoryLabels.
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

import { createElement, useMemo, type ComponentType } from "react";
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

import { useTranslations } from "next-intl";

import {
  subcategoriesByCategory,
  type InvestmentCategory,
  type SubcategoryByCategory,
} from "@/lib/types/classification";
import type { SubcategoryData } from "@/lib/types/investments";
import type { Messages } from "@/i18n/messages";

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

/** The keys of the merged display groups (see DisplayGroupOverride). */
export type CryptoDisplayGroup = "btc-eth";

/**
 * Where a card's text lives in the `categories` message namespace: the
 * entry has a `name`, a `description` and comma-separated `examples`
 * (messages/<language>/categories.json). Render it with useCategoryLabels.
 */
export type SubcategoryLabel =
  | {
      [C in InvestmentCategory]: `${C}.subcategories.${SubcategoryByCategory[C]}`;
    }[InvestmentCategory]
  | `crypto.groups.${CryptoDisplayGroup}`;

/** The text of one subcategory (or display group) in the catalogue. */
interface SubcategoryMessages {
  name: string;
  description: string;
  examples: string;
}

/** What the `categories` namespace must hold for every category. */
type CategoriesCatalogue = {
  [C in InvestmentCategory]: {
    name: string;
    subcategories: Record<SubcategoryByCategory[C], SubcategoryMessages>;
  };
} & {
  crypto: { groups: Record<CryptoDisplayGroup, SubcategoryMessages> };
  unclassified: { name: string };
};

type Covers<T extends CategoriesCatalogue> = T;
/**
 * Compile-time exhaustiveness check: a subcategory slug in
 * classification.ts without a name, description and examples in
 * messages/en/categories.json fails tsc here (German is checked against
 * English in i18n/messages.ts).
 */
export type CheckedCategoriesCatalogue = Covers<Messages["categories"]>;

/**
 * UI metadata for a single subcategory.
 * Every subcategory in classification.ts MUST have an entry.
 */
export interface SubcategoryUIMeta {
  /** Its name, description and examples in the message catalogue */
  label: SubcategoryLabel;
  /** Lucide icon component */
  icon: ComponentType<{ className?: string }>;
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
  displayGroup?: CryptoDisplayGroup;
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
  key: CryptoDisplayGroup;
  /** Name, description and examples of the merged card */
  label: SubcategoryLabel;
  /** Icon for the merged card */
  icon: ComponentType<{ className?: string }>;
  /** Route for the merged card */
  href: string;
  /** Hex color for the merged card */
  color: string;
}

/**
 * Card data ready for rendering by SubcategoryCategoryCard.
 */
export interface CategoryCardData {
  /**
   * The card's name, description and examples in the message catalogue
   * (SubcategoryCategoryCard renders them; unique, so pages key by it)
   */
  title: SubcategoryLabel;
  href: string;
  icon: ComponentType<{ className?: string }>;
  implemented: boolean;
  color?: string;
  /** Optional section for page-level grouping */
  section?: string;
  /** The classification subcategory slugs this card covers */
  subcategories: string[];
}

/**
 * A category's subcategory records with each entry's catalogue label
 * (`<category>.subcategories.<slug>`) filled in from its slug.
 */
function labelled<C extends InvestmentCategory>(
  category: C,
  entries: Record<SubcategoryByCategory[C], Omit<SubcategoryUIMeta, "label">>,
): Record<SubcategoryByCategory[C], SubcategoryUIMeta> {
  return Object.fromEntries(
    Object.entries<Omit<SubcategoryUIMeta, "label">>(entries).map(
      ([slug, meta]) => [
        slug,
        {
          ...meta,
          label: `${category}.subcategories.${slug}` as SubcategoryLabel,
        },
      ],
    ),
  ) as Record<SubcategoryByCategory[C], SubcategoryUIMeta>;
}

// ═══════════════════════════════════════════════════════════════
// WRAPPER ICONS
// ═══════════════════════════════════════════════════════════════

/** Lab icon wrapper for gemRing (Jewelry) */
const GemRingIcon = ({ className }: { className?: string }) => (
  <Icon iconNode={gemRing} className={className} />
);

/**
 * Where a card for a provider-fed subcategory leads (ENG-227). There are no
 * per-subcategory pages yet, so each card opens the page that already lists
 * that data: Plaid accounts, SnapTrade/Bitpanda broker accounts, or the
 * Bitpanda crypto holdings table. Subcategories no provider fills stay
 * `implemented: false` and are hidden unless the plannedCategories flag is on.
 */
const BANK_ACCOUNTS_ROUTE = "/integrations/banking";
const BROKER_ACCOUNTS_ROUTE = "/integrations/brokers";
const CRYPTO_HOLDINGS_ROUTE = "/assets/crypto/holdings";

// ═══════════════════════════════════════════════════════════════
// SUBCATEGORY UI DEFINITIONS (Exhaustive Records)
// ═══════════════════════════════════════════════════════════════

// --- Cash ---
const cashColors = categoryColorPalettes.cash;

export const cashSubcategoryUI = labelled("cash", {
  "checking-accounts": {
    icon: Wallet,
    color: cashColors["checking-accounts"],
    href: BANK_ACCOUNTS_ROUTE,
    implemented: true,
  },
  "savings-accounts": {
    icon: PiggyBank,
    color: cashColors["savings-accounts"],
    href: BANK_ACCOUNTS_ROUTE,
    implemented: true,
  },
  "money-market": {
    icon: Landmark,
    color: cashColors["money-market"],
    href: BANK_ACCOUNTS_ROUTE,
    implemented: true,
  },
  cds: {
    icon: Clock,
    color: cashColors.cds,
    href: BANK_ACCOUNTS_ROUTE,
    implemented: true,
  },
  "treasury-bills": {
    icon: Banknote,
    color: cashColors["treasury-bills"],
    href: "/cash/tbills",
    implemented: false,
  },
  forex: {
    icon: ArrowRightLeft,
    color: cashColors.forex,
    href: BROKER_ACCOUNTS_ROUTE,
    implemented: true,
  },
  "broker-cash": {
    icon: ChartCandlestick,
    color: cashColors["broker-cash"],
    href: BROKER_ACCOUNTS_ROUTE,
    implemented: true,
  },
});

// --- Equities ---
const equitiesColors = categoryColorPalettes.equities;

export const equitiesSubcategoryUI = labelled("equities", {
  stocks: {
    icon: TrendingUp,
    color: equitiesColors.stocks,
    href: BROKER_ACCOUNTS_ROUTE,
    implemented: true,
    section: "public",
  },
  etfs: {
    icon: BarChart3,
    color: equitiesColors.etfs,
    href: BROKER_ACCOUNTS_ROUTE,
    implemented: true,
    section: "public",
  },
  funds: {
    icon: PieChart,
    color: equitiesColors.funds,
    href: BROKER_ACCOUNTS_ROUTE,
    implemented: true,
    section: "public",
  },
  options: {
    icon: Activity,
    color: equitiesColors.options,
    href: BROKER_ACCOUNTS_ROUTE,
    implemented: true,
    section: "public",
  },
  private: {
    icon: Briefcase,
    color: equitiesColors.private,
    href: "/equities/private",
    implemented: false,
    section: "private",
  },
});

// --- Bonds ---
const bondsColors = categoryColorPalettes.bonds;

export const bondsSubcategoryUI = labelled("bonds", {
  government: {
    icon: Landmark,
    color: bondsColors.government,
    href: "/bonds/government",
    implemented: false,
  },
  corporate: {
    icon: Building,
    color: bondsColors.corporate,
    href: BROKER_ACCOUNTS_ROUTE,
    implemented: true,
  },
  municipal: {
    icon: Building2,
    color: bondsColors.municipal,
    href: "/bonds/municipal",
    implemented: false,
  },
  savings: {
    icon: PiggyBank,
    color: bondsColors.savings,
    href: "/bonds/savings",
    implemented: false,
  },
  funds: {
    icon: BarChart3,
    color: bondsColors.funds,
    href: "/bonds/funds",
    implemented: false,
  },
});

// --- Crypto ---
const cryptoColors = categoryColorPalettes.crypto;

export const cryptoSubcategoryUI = labelled("crypto", {
    bitcoin: {
      icon: Bitcoin,
      color: cryptoColors.bitcoin,
      href: CRYPTO_HOLDINGS_ROUTE,
      implemented: true,
      displayGroup: "btc-eth",
    },
    ethereum: {
      icon: Bitcoin, // Overridden by display group
      color: cryptoColors.ethereum,
      href: CRYPTO_HOLDINGS_ROUTE,
      implemented: true,
      displayGroup: "btc-eth",
    },
    altcoins: {
      icon: Coins,
      color: cryptoColors.altcoins,
      href: CRYPTO_HOLDINGS_ROUTE,
      implemented: true,
    },
    stablecoins: {
      icon: CircleDollarSign,
      color: cryptoColors.stablecoins,
      href: CRYPTO_HOLDINGS_ROUTE,
      implemented: true,
    },
    defi: {
      icon: Layers,
      color: cryptoColors.defi,
      href: "/assets/crypto/defi",
      implemented: false,
    },
  });

/** Display group overrides for crypto (BTC + ETH merged card) */
export const cryptoDisplayGroups: DisplayGroupOverride[] = [
  {
    key: "btc-eth",
    label: "crypto.groups.btc-eth",
    icon: Bitcoin,
    href: CRYPTO_HOLDINGS_ROUTE,
    color: cryptoColors.bitcoin,
  },
];

// --- Commodities ---
const commoditiesColors = categoryColorPalettes.commodities;

export const commoditiesSubcategoryUI = labelled("commodities", {
  metals: {
    icon: Coins,
    color: commoditiesColors.metals,
    href: "/assets/commodities/metals",
    implemented: true,
  },
  energy: {
    icon: Fuel,
    color: commoditiesColors.energy,
    href: "/assets/commodities/energy",
    implemented: false,
  },
  industrial: {
    icon: Factory,
    color: commoditiesColors.industrial,
    href: "/assets/commodities/industrial",
    implemented: false,
  },
  agricultural: {
    icon: Wheat,
    color: commoditiesColors.agricultural,
    href: "/assets/commodities/agricultural",
    implemented: false,
  },
  "rare-earth": {
    icon: Atom,
    color: commoditiesColors["rare-earth"],
    href: "/assets/commodities/rare-earth",
    implemented: false,
  },
  gemstones: {
    icon: Gem,
    color: commoditiesColors.gemstones,
    href: "/assets/commodities/gemstones",
    implemented: false,
  },
});

// --- Real Estate ---
const realEstateColors = categoryColorPalettes["real-estate"];

export const realEstateSubcategoryUI = labelled("real-estate", {
  residential: {
    icon: Home,
    color: realEstateColors.residential,
    href: "/real-estate/residential",
    implemented: false,
  },
  commercial: {
    icon: Building2,
    color: realEstateColors.commercial,
    href: "/real-estate/commercial",
    implemented: false,
  },
  reits: {
    icon: BarChart3,
    color: realEstateColors.reits,
    href: "/real-estate/reits",
    implemented: false,
  },
  crowdfunding: {
    icon: Users,
    color: realEstateColors.crowdfunding,
    href: "/real-estate/crowdfunding",
    implemented: false,
  },
  land: {
    icon: TreePine,
    color: realEstateColors.land,
    href: "/real-estate/land",
    implemented: false,
  },
});

// --- Collectibles ---
const collectiblesColors = categoryColorPalettes.collectibles;

export const collectiblesSubcategoryUI = labelled("collectibles", {
  art: {
    icon: Palette,
    color: collectiblesColors.art,
    href: "/assets/collectibles/art",
    implemented: false,
  },
  watches: {
    icon: Watch,
    color: collectiblesColors.watches,
    href: "/assets/collectibles/watches",
    implemented: false,
  },
  wine: {
    icon: Wine,
    color: collectiblesColors.wine,
    href: "/assets/collectibles/wine",
    implemented: false,
  },
  cars: {
    icon: Car,
    color: collectiblesColors.cars,
    href: "/assets/collectibles/cars",
    implemented: false,
  },
  jewelry: {
    icon: GemRingIcon,
    color: collectiblesColors.jewelry,
    href: "/assets/collectibles/jewelry",
    implemented: false,
  },
  "trading-cards": {
    icon: IdCardLanyard,
    color: collectiblesColors["trading-cards"],
    href: "/assets/collectibles/cards",
    implemented: false,
  },
  memorabilia: {
    icon: Stamp,
    color: collectiblesColors.memorabilia,
    href: "/assets/collectibles/memorabilia",
    implemented: false,
  },
  nfts: {
    icon: Image,
    color: collectiblesColors.nfts,
    href: "/assets/collectibles/nfts",
    implemented: false,
  },
  other: {
    icon: Package,
    color: collectiblesColors.other,
    href: "/assets/collectibles/other",
    implemented: false,
  },
});

// --- Liabilities ---
const liabilitiesColors = categoryColorPalettes.liabilities;

export const liabilitiesSubcategoryUI = labelled("liabilities", {
  mortgages: {
    icon: Home,
    color: liabilitiesColors.mortgages,
    href: "/liabilities/mortgages",
    implemented: false,
  },
  loans: {
    icon: Banknote,
    color: liabilitiesColors.loans,
    href: "/liabilities/loans",
    implemented: false,
  },
  "credit-cards": {
    icon: CreditCard,
    color: liabilitiesColors["credit-cards"],
    href: "/liabilities/credit-cards",
    implemented: false,
  },
  "margin-loans": {
    icon: TrendingDown,
    color: liabilitiesColors["margin-loans"],
    href: "/liabilities/margin",
    implemented: false,
  },
});

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
        title: meta.label,
        href: meta.href,
        icon: meta.icon,
        implemented: meta.implemented,
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
        title: override.label,
        href: override.href,
        icon: override.icon,
        implemented: metas.every((m) => m.implemented),
        color: override.color,
        section: metas[0]?.section,
        subcategories: slugs,
      });
    } else {
      // No override defined — fall back to first entry's metadata
      const first = metas[0];
      if (first) {
        mergedCards.push({
          title: first.label,
          href: first.href,
          icon: first.icon,
          implemented: first.implemented,
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
    label: meta.label,
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

// ═══════════════════════════════════════════════════════════════
// LABELS — the catalogue text of categories and subcategories
// ═══════════════════════════════════════════════════════════════

/** A dashboard category: an investment category or unclassified holdings */
export type CategoryLabelId = InvestmentCategory | "unclassified";

/** Whether `value` is an investment category slug. */
export function isInvestmentCategory(
  value: string,
): value is InvestmentCategory {
  return Object.hasOwn(subcategoriesByCategory, value);
}

/**
 * The catalogue label of a stored subcategory slug, or null when the slug
 * does not belong to the category (legacy or unknown data).
 */
export function subcategoryLabel(
  category: InvestmentCategory,
  slug: string,
): SubcategoryLabel | null {
  const slugs: readonly string[] = subcategoriesByCategory[category];
  return slugs.includes(slug)
    ? (`${category}.subcategories.${slug}` as SubcategoryLabel)
    : null;
}

/**
 * Names, descriptions and examples of categories and subcategories in the
 * user's language.
 */
export function useCategoryLabels() {
  const t = useTranslations("categories");
  return useMemo(
    () => ({
      /** "Equities", "Cash & Savings", "Unclassified", … */
      categoryName: (id: CategoryLabelId) => t(`${id}.name`),
      /**
       * A stored category slug's name; an unknown slug is shown as stored
       */
      categoryNameOf: (slug: string) =>
        isInvestmentCategory(slug) || slug === "unclassified"
          ? t(`${slug}.name`)
          : slug,
      name: (label: SubcategoryLabel) => t(`${label}.name`),
      description: (label: SubcategoryLabel) => t(`${label}.description`),
      /** The example tags (the catalogue lists them comma-separated) */
      examples: (label: SubcategoryLabel) =>
        t(`${label}.examples`).split(", "),
    }),
    [t],
  );
}
