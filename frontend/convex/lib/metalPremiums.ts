/**
 * Calibrated dealer premiums for the metal catalog.
 *
 * premium = dealer price / (spot EUR/oz × fine troy oz) − 1
 *  - buy:  dealer ASK a private buyer in Germany pays (incl. VAT where due)
 *  - sell: dealer BID (Ankauf) a private seller receives (VAT-free)
 *
 * `sell` drives every valuation (dashboard, public API, snapshots): an item is
 * worth what you would get by liquidating it today. `buy` only feeds the
 * "cost to acquire today" figure.
 *
 * Single source of truth: seedCatalog.ts seeds from this table and
 * premiumCalibration.applyPremiumCalibration writes it to the live catalog.
 * Full method, sources and per-item evidence: docs/METAL_PREMIUMS.md.
 */

export const PREMIUM_CALIBRATION = {
  date: "2026-11-11",
  spotEurPerOunce: { gold: 3631, silver: 47.44, platinum: 1410, palladium: 974 },
  method:
    "Median across dealers on the gold.de price comparison (full dealer lists via its per-product comparison where available), cross-checked against the Degussa and philoro published price lists. Gold bar asks and silver asks corrected upward for gold.de's cheapest-offers selection bias as measured against full lists and brand dealers.",
} as const;

export interface CatalogPremium {
  buy: number;
  sell: number;
}

/** Keyed by metalCatalog `name` (exact). */
export const CATALOG_PREMIUMS: Record<string, CatalogPremium> = {
  // ── Gold bars (VAT-free investment gold, §25c UStG) ───────────────
  "Gold Bar 1g": { buy: 0.08, sell: -0.015 },
  "Gold Bar 2g": { buy: 0.07, sell: -0.016 },
  "Gold Bar 5g": { buy: 0.035, sell: -0.016 },
  "Gold Bar 10g": { buy: 0.028, sell: -0.016 },
  "Gold Bar 20g": { buy: 0.02, sell: -0.018 },
  "Gold Bar 1 oz": { buy: 0.015, sell: -0.019 },
  "Gold Bar 50g": { buy: 0.015, sell: -0.02 },
  "Gold Bar 100g": { buy: 0.012, sell: -0.022 },
  "Gold Bar 250g": { buy: 0.011, sell: -0.022 },
  "Gold Bar 500g": { buy: 0.011, sell: -0.022 },
  "Gold Bar 1kg": { buy: 0.012, sell: -0.022 },

  // ── Gold coins (VAT-free) ──────────────────────────────────────────
  "Philharmonic 1 oz": { buy: 0.025, sell: -0.02 },
  "Maple Leaf 1 oz": { buy: 0.028, sell: -0.023 },
  "Krugerrand 1 oz": { buy: 0.023, sell: -0.02 },
  "American Eagle 1 oz": { buy: 0.044, sell: -0.02 },
  "Kangaroo 1 oz": { buy: 0.029, sell: -0.02 },
  "Britannia 1 oz": { buy: 0.026, sell: -0.022 },
  "Chinese Panda 30g": { buy: 0.04, sell: -0.026 },
  "Philharmonic 1/2 oz": { buy: 0.067, sell: -0.02 },
  "Maple Leaf 1/2 oz": { buy: 0.068, sell: -0.019 },
  "Krugerrand 1/2 oz": { buy: 0.067, sell: -0.014 },
  "American Eagle 1/2 oz": { buy: 0.082, sell: -0.019 },
  "Philharmonic 1/4 oz": { buy: 0.09, sell: -0.016 },
  "Maple Leaf 1/4 oz": { buy: 0.092, sell: -0.016 },
  "Krugerrand 1/4 oz": { buy: 0.09, sell: -0.01 },
  "American Eagle 1/4 oz": { buy: 0.12, sell: -0.018 },
  "Philharmonic 1/10 oz": { buy: 0.119, sell: -0.012 },
  "Maple Leaf 1/10 oz": { buy: 0.122, sell: -0.016 },
  "Krugerrand 1/10 oz": { buy: 0.115, sell: -0.014 },
  "American Eagle 1/10 oz": { buy: 0.157, sell: -0.019 },

  // ── Silver (bars 19% VAT; coins mixed §25a margin scheme / 19% VAT) ─
  "Silver Bar 1 oz": { buy: 0.41, sell: -0.044 },
  "Silver Bar 100g": { buy: 0.41, sell: -0.045 },
  "Silver Bar 250g": { buy: 0.32, sell: -0.062 },
  "Silver Bar 500g": { buy: 0.29, sell: -0.06 },
  "Silver Bar 1kg": { buy: 0.276, sell: -0.049 },
  "Silver Bar 5kg": { buy: 0.26, sell: -0.043 },
  "Silver Maple Leaf 1 oz": { buy: 0.29, sell: 0.015 },
  "Silver Philharmonic 1 oz": { buy: 0.29, sell: 0.015 },
  "Silver Kangaroo 1 oz": { buy: 0.31, sell: 0.015 },
  "Silver Britannia 1 oz": { buy: 0.31, sell: 0.015 },
  "Silver American Eagle 1 oz": { buy: 0.35, sell: -0.031 },

  // ── Platinum (19% VAT in Germany) ─────────────────────────────────
  "Platinum Bar 10g": { buy: 0.373, sell: -0.064 },
  "Platinum Bar 1 oz": { buy: 0.302, sell: -0.041 },
  "Platinum Philharmonic 1 oz": { buy: 0.312, sell: -0.041 },
  "Platinum Maple Leaf 1 oz": { buy: 0.294, sell: -0.034 },
  "Platinum American Eagle 1 oz": { buy: 0.4, sell: -0.053 },

  // ── Palladium (19% VAT; coins barely offered for sale → low confidence buy)
  "Palladium Bar 1 oz": { buy: 0.34, sell: -0.057 },
  "Palladium Maple Leaf 1 oz": { buy: 0.34, sell: -0.042 },
  "Palladium American Eagle 1 oz": { buy: 0.4, sell: 0.0 },
};

type Metal = "gold" | "silver" | "platinum" | "palladium";
type Category = "coin" | "bar" | "jewelry" | "scrap";

/**
 * Defaults for user-entered items without a catalog entry, derived from the
 * 1 oz medians of each metal. Jewelry and scrap were not researched (dealers
 * typically pay less for them); they fall back to the bar values and the user
 * should adjust them.
 */
const CUSTOM_PREMIUMS: Record<Metal, Record<"coin" | "bar", CatalogPremium>> = {
  gold: { coin: { buy: 0.025, sell: -0.02 }, bar: { buy: 0.015, sell: -0.02 } },
  silver: { coin: { buy: 0.29, sell: 0.0 }, bar: { buy: 0.276, sell: -0.049 } },
  platinum: { coin: { buy: 0.31, sell: -0.04 }, bar: { buy: 0.3, sell: -0.041 } },
  palladium: { coin: { buy: 0.34, sell: -0.042 }, bar: { buy: 0.34, sell: -0.057 } },
};

export function customItemPremiums(
  metal: Metal,
  category: Category,
): CatalogPremium {
  return CUSTOM_PREMIUMS[metal][category === "coin" ? "coin" : "bar"];
}

/** Premiums for a catalog item; throws so a new catalog entry can't ship uncalibrated. */
export function catalogPremiums(name: string): CatalogPremium {
  const premium = CATALOG_PREMIUMS[name];
  if (!premium) throw new Error(`No calibrated premiums for catalog item "${name}"`);
  return premium;
}
