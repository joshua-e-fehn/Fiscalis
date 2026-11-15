/**
 * Per-asset valuation overrides (ENG-239): tier 3 of the valuation
 * resolution chain (docs/adr/0001-valuation-resolution.md).
 *
 *   asset override  →  subcategory override  →  category default
 *
 * A user can value one provider holding (a broker position or a Bitpanda
 * holding) themselves when its provider price is missing or wrong:
 *
 * - manualPrice: a fixed price per unit in a currency, as of a date.
 * - markToModel: a price per unit on a date grown at a fixed annual rate
 *   (compounded daily), for a holding with no market such as a private
 *   placement held at a broker, or a bond accruing towards par.
 *
 * Either one makes the holding discrete with the "manual" provider, so the
 * refresh crons leave it alone (services/performance/config.ts
 * priceFeedFor), and every net-worth figure values it from the override
 * (frontend/convex/lib/netWorth.ts). The value follows the synced
 * quantity, so a sale or purchase still moves it.
 *
 * Overrides live in their own table (valuationOverrides), keyed by the
 * holding's sync-stable key (services/portfolio/flows.ts brokerPositionKey,
 * bitpandaHoldingKey), because provider syncs replace the holding rows.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

import type { ToBaseAmount } from "../finance/metalsLedger";
import type { UserErrorCode } from "../i18n/userErrorCodes";
import type { ValuationConfig } from "../performance/types";
import { isIsoDate, manualAssetCurrency } from "../portfolio/manualAssets";

export type ValuationOverrideKind = "manualPrice" | "markToModel";

export const VALUATION_OVERRIDE_KINDS: readonly ValuationOverrideKind[] = [
  "manualPrice",
  "markToModel",
];

/** The user's input, as stored (minus ids and timestamps). */
export interface ValuationOverride {
  kind: ValuationOverrideKind;
  /** Price per unit in `currency`, on `asOf` */
  pricePerUnit: number;
  /** ISO 4217 code with a mirrored exchange rate */
  currency: string;
  /** YYYY-MM-DD: the day the price holds (the model's anchor) */
  asOf: string;
  /** markToModel only: annual growth in percent (negative for decay) */
  annualRatePercent?: number;
}

/** Bounds of a model's annual rate, in percent. */
export const MODEL_RATE_MIN_PERCENT = -100;
export const MODEL_RATE_MAX_PERCENT = 100;

/** Upper bound of a price per unit: a typo guard, not a market limit. */
export const OVERRIDE_PRICE_MAX = 1e12;

const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.25;

/**
 * Categories whose holdings can take an override: assets with a price per
 * unit. Cash is valued by its balance and a liability by what is owed.
 */
const OVERRIDABLE_CATEGORIES: ReadonlySet<string> = new Set([
  "equities",
  "bonds",
  "crypto",
  "commodities",
  "real-estate",
  "collectibles",
  "unclassified",
]);

/** Whether a holding in `category` can be valued by an override. */
export function canOverrideValuation(category: string): boolean {
  return OVERRIDABLE_CATEGORIES.has(category);
}

/**
 * The first rule the input breaks, or null when it is valid. `now` bounds
 * the date (one day of slack for time zones).
 */
export function validateValuationOverride(
  input: ValuationOverride,
  now: number,
): UserErrorCode | null {
  if (
    !Number.isFinite(input.pricePerUnit) ||
    input.pricePerUnit < 0 ||
    input.pricePerUnit > OVERRIDE_PRICE_MAX
  ) {
    return "valuationPriceInvalid";
  }
  if (!manualAssetCurrency(input.currency)) return "valuationCurrencyInvalid";
  if (!isIsoDate(input.asOf)) return "valuationInvalidDate";
  if (Date.parse(`${input.asOf}T00:00:00Z`) > now + DAY_MS) {
    return "valuationDateInFuture";
  }
  if (input.kind === "markToModel") {
    const rate = input.annualRatePercent;
    if (
      rate === undefined ||
      !Number.isFinite(rate) ||
      rate < MODEL_RATE_MIN_PERCENT ||
      rate > MODEL_RATE_MAX_PERCENT
    ) {
      return "valuationRateInvalid";
    }
  }
  return null;
}

/**
 * The stored form of valid input: the currency upper-cased, and the rate
 * kept only for a model.
 */
export function normalizeValuationOverride(
  input: ValuationOverride,
): ValuationOverride {
  const currency = manualAssetCurrency(input.currency) ?? input.currency;
  return input.kind === "markToModel"
    ? {
        kind: "markToModel",
        pricePerUnit: input.pricePerUnit,
        currency,
        asOf: input.asOf,
        annualRatePercent: input.annualRatePercent ?? 0,
      }
    : {
        kind: "manualPrice",
        pricePerUnit: input.pricePerUnit,
        currency,
        asOf: input.asOf,
      };
}

/**
 * Tier 3 of the resolution chain: an override values the holding
 * manually and discretely, whatever its subcategory's feed.
 */
export function valuationOverrideConfig(
  override: ValuationOverride | undefined,
): Partial<ValuationConfig> | undefined {
  return override ? { method: "discrete", priceProvider: "manual" } : undefined;
}

/**
 * The price per unit the override gives at `now`, in its currency: the
 * entered price, or for a model the entered price grown at the annual rate
 * for the whole days since `asOf` (never before it).
 */
export function overridePricePerUnit(
  override: ValuationOverride,
  now: number,
): number {
  if (override.kind === "manualPrice") return override.pricePerUnit;
  const anchor = Date.parse(`${override.asOf}T00:00:00Z`);
  const days = Number.isFinite(anchor)
    ? Math.max(0, Math.floor((now - anchor) / DAY_MS))
    : 0;
  const rate = (override.annualRatePercent ?? 0) / 100;
  // -100 % a year is a total write-off, not a negative price
  if (rate <= -1) return days > 0 ? 0 : override.pricePerUnit;
  return override.pricePerUnit * Math.pow(1 + rate, days / DAYS_PER_YEAR);
}

/** An overridden holding's value. */
export interface OverriddenValue {
  /** Price per unit at `now`, in `currency` */
  pricePerUnit: number;
  currency: string;
  /** quantity × pricePerUnit, in `currency` */
  marketValue: number;
  /** marketValue in the base currency; null without an exchange rate */
  valueBase: number | null;
}

/**
 * Value a holding by its override: the synced quantity at the override's
 * price, converted to the base currency.
 */
export function overriddenValue(
  quantity: number,
  override: ValuationOverride,
  now: number,
  toBaseAmount: ToBaseAmount,
): OverriddenValue {
  const pricePerUnit = overridePricePerUnit(override, now);
  const marketValue = quantity * pricePerUnit;
  return {
    pricePerUnit,
    currency: override.currency,
    marketValue,
    valueBase: toBaseAmount(marketValue, override.currency),
  };
}
