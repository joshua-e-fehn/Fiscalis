/**
 * Currency formatting utilities
 *
 * Locale-specific presentation helpers for monetary values and percentages.
 * Uses Intl.NumberFormat with the "de-CH" locale throughout.
 *
 * Every string these return is UI text: it is wrapped in a left-to-right
 * isolate (isolateLtr, services/i18n/bidi.ts) so an amount, a percentage or
 * a signed number reads "-15'881.29€" in the right-to-left Arabic UI too,
 * not "881.29€'15-". Exports and APIs write plain numbers (toFixed), never
 * these; stripBidiMarks reads a displayed value back.
 */

import { isolateLtr } from "@/../services/i18n/bidi";
import type { InvestmentCurrency } from "@/lib/types/investments";

/**
 * Currency symbols mapping
 */
export const currencySymbols: Record<InvestmentCurrency, string> = {
  eur: "€",
  usd: "$",
  gbp: "£",
  chf: "CHF ",
};

/**
 * What follows an amount: the symbol, written straight after the number
 * ("1'234.56€", "-15'000€"); codes without a short symbol get a space
 * ("1'234.56 CHF").
 */
export const currencySuffixes: Record<InvestmentCurrency, string> = {
  eur: "€",
  usd: "$",
  gbp: "£",
  chf: " CHF",
};

/** Append the display currency to an already formatted amount. */
export function withCurrency(
  formattedAmount: string,
  currency: InvestmentCurrency,
): string {
  return isolateLtr(`${formattedAmount}${currencySuffixes[currency]}`);
}

/**
 * Currency codes for Intl.NumberFormat
 */
export const currencyCodes: Record<InvestmentCurrency, string> = {
  eur: "EUR",
  usd: "USD",
  gbp: "GBP",
  chf: "CHF",
};

/**
 * Read a stored currency code ("EUR", "usd") as a supported display currency;
 * undefined when it is none of them.
 */
export function toInvestmentCurrency(
  code: string,
): InvestmentCurrency | undefined {
  const lower = code.toLowerCase();
  return Object.hasOwn(currencyCodes, lower)
    ? (lower as InvestmentCurrency)
    : undefined;
}

/**
 * Short form for charts and summaries: "950€", "12.5K€", "1.46M€".
 * Keeps decimals so neighbouring values (1.5M vs 2M) stay distinguishable;
 * de-CH's own compact notation rounds to whole millions and has no "K".
 */
function formatCompactAmount(absValue: number, suffix: string): string {
  const [divisor, unit, digits] =
    absValue >= 999_950
      ? [1e6, "M", 2]
      : absValue >= 999.5
        ? [1e3, "K", 1]
        : [1, "", 0];
  const amount = new Intl.NumberFormat("de-CH", {
    maximumFractionDigits: digits,
  }).format(absValue / divisor);
  return `${amount}${unit}${suffix}`;
}

/**
 * Symbols for the other currencies a stored amount can carry (loans offer
 * these, see add-loan-dialog.tsx CURRENCIES), written after the amount.
 */
const otherCurrencySuffixes: Record<string, string> = {
  jpy: "¥",
  cad: "C$",
  aud: "A$",
};

/**
 * A display currency, or any other ISO 4217 code a stored amount carries
 * (a loan in "GBP"): the text written after the amount. Only codes without
 * a known symbol fall back to the code itself ("1'234.00 SEK").
 */
function resolveSuffix(currency: string): string {
  const known = toInvestmentCurrency(currency);
  if (known) return currencySuffixes[known];
  const lower = currency.toLowerCase();
  return Object.hasOwn(otherCurrencySuffixes, lower)
    ? otherCurrencySuffixes[lower]
    : ` ${currency.toUpperCase()}`;
}

/**
 * Format a number as currency, the symbol after the amount: "-15'795.87€".
 * Takes a display currency or a stored ISO code ("EUR", "GBP"): "1'234.00£";
 * only codes with no known symbol are written as a code ("1'234.00 SEK").
 * `fractionDigits` (default 2) sets the decimals, e.g. 0 for whole-unit
 * axis labels and summaries ("84'998€"); it is ignored when `compact`.
 */
export function formatCurrency(
  value: number,
  currency: InvestmentCurrency | (string & {}),
  options?: { compact?: boolean; showSign?: boolean; fractionDigits?: number },
): string {
  const { compact = false, showSign = false, fractionDigits = 2 } =
    options ?? {};
  const suffix = resolveSuffix(currency);

  const formatted = compact
    ? formatCompactAmount(Math.abs(value), suffix)
    : `${new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(Math.abs(value))}${suffix}`;

  return isolateLtr(`${signOf(value, showSign)}${formatted}`);
}

/**
 * The sign written before an amount: "-" for a negative value, "+" for a
 * positive one when `showSign`, nothing for zero.
 */
function signOf(value: number, showSign: boolean): string {
  if (value < 0) return "-";
  return showSign && value > 0 ? "+" : "";
}

/**
 * A plain number in the house style, e.g. a quantity or a weight:
 * "1'234.5", "+12". `fractionDigits` fixes the decimals (default: up to 2,
 * as needed); `maximumFractionDigits` allows more when they are there.
 */
export function formatNumber(
  value: number,
  options?: {
    showSign?: boolean;
    fractionDigits?: number;
    maximumFractionDigits?: number;
  },
): string {
  const { showSign = false, fractionDigits, maximumFractionDigits } =
    options ?? {};
  const formatted = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: fractionDigits ?? 0,
    maximumFractionDigits: maximumFractionDigits ?? fractionDigits ?? 2,
  }).format(Math.abs(value));
  return isolateLtr(`${signOf(value, showSign)}${formatted}`);
}

/**
 * Format a percentage value: "12.50%", "+3.1%", "-0.25%". Decimals run from
 * `minimumFractionDigits` (default 2) to `maximumFractionDigits` (default 2,
 * or the minimum when that is higher).
 */
export function formatPercent(
  value: number,
  showSign = false,
  minimumFractionDigits = 2,
  maximumFractionDigits = Math.max(2, minimumFractionDigits),
): string {
  const formatted = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Math.abs(value));

  return isolateLtr(`${signOf(value, showSign)}${formatted}%`);
}

/** Format a fractional rate (0.0718) as a percentage without trailing zeros: "7.18%", "4%". */
export function formatRate(rate: number): string {
  return formatPercent(rate * 100, false, 0);
}
