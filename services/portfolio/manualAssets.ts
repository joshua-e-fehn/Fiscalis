/**
 * Manual assets: property, vehicles, private equity, collectibles and the
 * other things no provider reports, each recorded as a dated series of
 * valuations in its own currency (frontend/convex/manualAssets.ts).
 *
 * This module holds what a manual asset is worth and the rules its input
 * follows: which subcategories take manual entries, which attributes each
 * one records, the latest valuation, the gain or loss against its cost
 * basis and its value in the base currency. lib/netWorth.ts feeds the
 * result to the aggregator (aggregate.ts) as the "manualAsset" source,
 * valued discretely: by its own valuations, never by a price feed.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

import {
  BASE_CURRENCY,
  MIRRORED_CURRENCIES,
  normalizeCurrency,
} from "../finance/currency";
import type { ToBaseAmount } from "../finance/metalsLedger";
import type { UserErrorCode } from "../i18n/userErrorCodes";
import { holdingProfitLoss } from "./categorySummary";

// ═══════════════════════════════════════════════════════════════
// Where manual entries go
// ═══════════════════════════════════════════════════════════════

/**
 * The subcategories that take manual entries, by category: every
 * subcategory no provider fills. Precious metals have their own vertical
 * (the vault) and liabilities are loans, so neither is here.
 */
export const MANUAL_ASSET_SUBCATEGORIES = {
  cash: ["treasury-bills"],
  equities: ["private"],
  bonds: ["government", "municipal", "savings", "funds"],
  crypto: ["defi"],
  commodities: ["energy", "industrial", "agricultural", "rare-earth", "gemstones"],
  "real-estate": ["residential", "commercial", "crowdfunding", "land"],
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
} as const satisfies Record<string, readonly string[]>;

export type ManualAssetCategory = keyof typeof MANUAL_ASSET_SUBCATEGORIES;

/** Whether `category` takes manual entries in at least one subcategory. */
export function isManualAssetCategory(
  category: string,
): category is ManualAssetCategory {
  return Object.prototype.hasOwnProperty.call(MANUAL_ASSET_SUBCATEGORIES, category);
}

/** Whether manual entries can be recorded in this subcategory. */
export function isManualAssetSubcategory(
  category: string,
  subcategory: string,
): boolean {
  if (!isManualAssetCategory(category)) return false;
  const slugs: readonly string[] = MANUAL_ASSET_SUBCATEGORIES[category];
  return slugs.includes(subcategory);
}

// ═══════════════════════════════════════════════════════════════
// Attributes
// ═══════════════════════════════════════════════════════════════

/**
 * The optional details a manual asset can carry, by kind: free text, or a
 * calendar year. Kept small and typed (the schema's validator lists the
 * same fields, convex/lib/manualAssetValidators.ts).
 */
export const MANUAL_ASSET_ATTRIBUTE_KINDS = {
  artist: "text",
  brand: "text",
  model: "text",
  referenceNumber: "text",
  producer: "text",
  vintage: "year",
  year: "year",
  address: "text",
  grade: "text",
} as const;

export type ManualAssetAttribute = keyof typeof MANUAL_ASSET_ATTRIBUTE_KINDS;

export type ManualAssetAttributes = {
  [K in ManualAssetAttribute]?: (typeof MANUAL_ASSET_ATTRIBUTE_KINDS)[K] extends "year"
    ? number
    : string;
};

/** The attributes the add/edit form asks for in each subcategory. */
const ATTRIBUTES_BY_SUBCATEGORY: Record<string, readonly ManualAssetAttribute[]> = {
  art: ["artist", "year"],
  watches: ["brand", "model", "referenceNumber", "year"],
  wine: ["producer", "vintage"],
  cars: ["brand", "model", "year"],
  jewelry: ["brand"],
  "trading-cards": ["grade", "year"],
  memorabilia: ["year"],
  gemstones: ["grade"],
  residential: ["address"],
  commercial: ["address"],
  land: ["address"],
};

/** The attributes recorded for a subcategory, in form order. */
export function attributesFor(subcategory: string): readonly ManualAssetAttribute[] {
  return ATTRIBUTES_BY_SUBCATEGORY[subcategory] ?? [];
}

/** Longest attribute text, and longest name. */
export const MANUAL_ASSET_TEXT_MAX = 120;

/**
 * The attributes to store: the subcategory's own, with blank text dropped
 * and text trimmed. Undefined when none is left.
 */
export function cleanAttributes(
  subcategory: string,
  attributes: ManualAssetAttributes | undefined,
): ManualAssetAttributes | undefined {
  if (!attributes) return undefined;
  const allowed = attributesFor(subcategory);
  const cleaned: Record<string, string | number> = {};
  for (const key of allowed) {
    const raw = attributes[key];
    if (raw === undefined) continue;
    if (typeof raw === "string") {
      const text = raw.trim();
      if (text) cleaned[key] = text;
    } else {
      cleaned[key] = raw;
    }
  }
  return Object.keys(cleaned).length > 0
    ? (cleaned as ManualAssetAttributes)
    : undefined;
}

// ═══════════════════════════════════════════════════════════════
// Valuations
// ═══════════════════════════════════════════════════════════════

/** What the asset was worth on a day, in the asset's currency. */
export interface ManualValuation {
  /** ISO date, YYYY-MM-DD */
  date: string;
  value: number;
}

/** Most valuations one asset keeps. */
export const MANUAL_ASSET_MAX_VALUATIONS = 500;

/**
 * The valuations oldest first, one per date: of two on the same date the
 * one given later wins (an edit of that day's value).
 */
export function normalizeValuations(
  valuations: readonly ManualValuation[],
): ManualValuation[] {
  const byDate = new Map<string, ManualValuation>();
  for (const v of valuations) byDate.set(v.date, { date: v.date, value: v.value });
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/** The most recent valuation (by date; the later one on a tie), or null. */
export function latestValuation(
  valuations: readonly ManualValuation[],
): ManualValuation | null {
  let latest: ManualValuation | null = null;
  for (const v of valuations) {
    if (!latest || v.date >= latest.date) latest = v;
  }
  return latest;
}

/** The fields of a stored manual asset this module reads. */
export interface ManualAssetLike {
  currency: string;
  valuations: readonly ManualValuation[];
  costBasis?: number;
}

/**
 * Value (latest valuation), cost basis and gain or loss, in the asset's
 * own currency. Without a cost basis the gain or loss is unknown (null),
 * never 0.
 */
export function manualAssetGainLoss(asset: ManualAssetLike): {
  value: number;
  valuedOn: string | null;
  costBasis: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
} {
  const latest = latestValuation(asset.valuations);
  const value = latest?.value ?? 0;
  const costBasis = asset.costBasis ?? null;
  return {
    value,
    valuedOn: latest?.date ?? null,
    costBasis,
    ...holdingProfitLoss({ value, costBasis }),
  };
}

/**
 * The asset in the base currency (EUR) at today's rates, as the aggregator
 * counts it: an amount without a rate counts 0 and its cost as unknown,
 * never 1:1 as EUR. A foreign cost also comes back in its own currency
 * (costNative), so a snapshot flow is not taken from an FX move.
 */
export function manualAssetInBase(
  asset: ManualAssetLike,
  toBaseAmount: ToBaseAmount,
): {
  valueBase: number;
  costBase: number | null;
  costNative?: { amount: number; currency: string };
} {
  const { value, costBasis } = manualAssetGainLoss(asset);
  const valueBase = toBaseAmount(value, asset.currency) ?? 0;
  const costBase = costBasis !== null ? toBaseAmount(costBasis, asset.currency) : null;
  return {
    valueBase,
    costBase,
    ...(costBase !== null && costBasis !== null && asset.currency !== BASE_CURRENCY
      ? { costNative: { amount: costBasis, currency: asset.currency } }
      : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

/** What the add/edit form sends. */
export interface ManualAssetInput {
  category: string;
  subcategory: string;
  name: string;
  currency: string;
  valuations: readonly ManualValuation[];
  costBasis?: number;
  attributes?: ManualAssetAttributes;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Whether `date` is a real calendar date written YYYY-MM-DD. */
export function isIsoDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
}

/**
 * The stored currency code of an input currency (upper case), or null when
 * it is not a major unit with an exchange rate: the base currency or one
 * the FX mirror holds (MIRRORED_CURRENCIES, the list the form offers). Any
 * other code would count as 0 in net worth, so it is refused up front.
 */
export function manualAssetCurrency(currency: string): string | null {
  const normalized = normalizeCurrency(currency);
  if (!normalized || normalized.divisor !== 1) return null;
  const { code } = normalized;
  return code === BASE_CURRENCY || MIRRORED_CURRENCIES.includes(code)
    ? code
    : null;
}

/**
 * The first rule the input breaks, as a user error code, or null when it is
 * valid. `now` (ms) bounds the valuation dates: a date up to a day ahead of
 * UTC is accepted, for time zones ahead of it.
 */
export function validateManualAsset(
  input: ManualAssetInput,
  now: number,
): UserErrorCode | null {
  if (!isManualAssetSubcategory(input.category, input.subcategory)) {
    return "manualAssetSubcategoryInvalid";
  }
  const name = input.name.trim();
  if (!name) return "manualAssetNameRequired";
  if (name.length > MANUAL_ASSET_TEXT_MAX) return "manualAssetNameTooLong";
  if (!manualAssetCurrency(input.currency)) return "manualAssetCurrencyInvalid";
  if (input.valuations.length === 0) return "manualAssetValuationRequired";
  if (input.valuations.length > MANUAL_ASSET_MAX_VALUATIONS) {
    return "manualAssetTooManyValuations";
  }
  for (const v of input.valuations) {
    if (!isIsoDate(v.date)) return "manualAssetInvalidDate";
    if (Date.parse(`${v.date}T00:00:00Z`) > now + DAY_MS) {
      return "manualAssetDateInFuture";
    }
    if (!Number.isFinite(v.value) || v.value < 0) return "manualAssetValueInvalid";
  }
  if (
    input.costBasis !== undefined &&
    (!Number.isFinite(input.costBasis) || input.costBasis < 0)
  ) {
    return "manualAssetCostInvalid";
  }
  for (const [key, raw] of Object.entries(input.attributes ?? {})) {
    if (raw === undefined) continue;
    const kind = MANUAL_ASSET_ATTRIBUTE_KINDS[key as ManualAssetAttribute];
    if (kind === undefined) return "manualAssetAttributeInvalid";
    if (kind === "year") {
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 9999) {
        return "manualAssetAttributeInvalid";
      }
    } else if (typeof raw !== "string" || raw.trim().length > MANUAL_ASSET_TEXT_MAX) {
      return "manualAssetAttributeInvalid";
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Typed amounts
// ═══════════════════════════════════════════════════════════════

/**
 * The decimal mark a locale writes ("," for de, es, fr and it, "." for en),
 * from Intl so every UI language gets its own convention. Falls back to "."
 * for a tag Intl rejects.
 */
export function localeDecimalMark(locale: string): "." | "," {
  try {
    const part = new Intl.NumberFormat(locale)
      .formatToParts(1.5)
      .find((p) => p.type === "decimal");
    return part?.value === "," ? "," : ".";
  } catch {
    return ".";
  }
}

/** A stored amount as a form shows it, with the locale's decimal mark. */
export function typedAmountText(value: number, locale: string): string {
  const text = String(value);
  return localeDecimalMark(locale) === "," ? text.replace(".", ",") : text;
}

/**
 * An amount as typed in the form, as a number: undefined when blank, NaN
 * when it is not a number. Spaces and apostrophes group digits. With both
 * "." and "," in it, the last one is the decimal mark ("1.250,50",
 * "1,250.50"). With one of them only, repeated it groups ("1.250.000"),
 * and once it is the decimal mark, except the locale's grouping mark
 * before exactly three digits: in German, Spanish, French, Italian or
 * Portuguese "250.000" is 250000, in English "1,500" is 1500. So a typed
 * "250.000" is never read as 250. The grouping mark is "." in every locale
 * whose decimal mark is ",", else ",".
 */
export function parseTypedAmount(
  text: string,
  locale: string,
): number | undefined {
  const compact = text.trim().replace(/[\s'  ]/g, "");
  if (!compact) return undefined;
  if (!/^-?[\d.,]+$/.test(compact)) return Number.NaN;
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  let decimalMark: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalMark = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? "." : ",";
    const groupingMark = localeDecimalMark(locale) === "," ? "." : ",";
    const count = compact.split(mark).length - 1;
    const digitsAfter = compact.length - compact.lastIndexOf(mark) - 1;
    const groups = count > 1 || (mark === groupingMark && digitsAfter === 3);
    decimalMark = groups ? null : mark;
  }
  const groupingMarks = decimalMark === "," ? /\./g : decimalMark === "." ? /,/g : /[.,]/g;
  const normalized = compact
    .replace(groupingMarks, "")
    .replace(decimalMark ?? "", decimalMark ? "." : "");
  if (decimalMark && normalized.split(".").length > 2) return Number.NaN;
  return Number(normalized);
}
