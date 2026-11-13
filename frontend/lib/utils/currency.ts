/**
 * Currency formatting utilities
 *
 * Locale-specific presentation helpers for monetary values and percentages.
 * Uses Intl.NumberFormat with the "de-CH" locale throughout.
 */

import type { InvestmentCurrency } from "@/lib/types/investments";

/**
 * Currency symbols mapping
 */
export const currencySymbols: Record<InvestmentCurrency, string> = {
  eur: "€",
  usd: "$",
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
  chf: " CHF",
};

/** Append the display currency to an already formatted amount. */
export function withCurrency(
  formattedAmount: string,
  currency: InvestmentCurrency,
): string {
  return `${formattedAmount}${currencySuffixes[currency]}`;
}

/**
 * Currency codes for Intl.NumberFormat
 */
export const currencyCodes: Record<InvestmentCurrency, string> = {
  eur: "EUR",
  usd: "USD",
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
 * A display currency, or any other ISO 4217 code a stored amount carries
 * (a loan in "GBP"): the text written after the amount.
 */
function resolveSuffix(currency: string): string {
  const known = toInvestmentCurrency(currency);
  return known ? currencySuffixes[known] : ` ${currency.toUpperCase()}`;
}

/**
 * Format a number as currency, the symbol after the amount: "-15'795.87€".
 * Takes a display currency or a stored ISO code ("EUR", "GBP"); codes
 * outside InvestmentCurrency are written as a code ("1'234.00 GBP").
 */
export function formatCurrency(
  value: number,
  currency: InvestmentCurrency | (string & {}),
  options?: { compact?: boolean; showSign?: boolean },
): string {
  const { compact = false, showSign = false } = options ?? {};
  const suffix = resolveSuffix(currency);

  const formatted = compact
    ? formatCompactAmount(Math.abs(value), suffix)
    : `${new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(value))}${suffix}`;

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  }

  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Format a percentage value
 */
export function formatPercent(
  value: number,
  showSign = false,
  minimumFractionDigits = 2,
): string {
  const formatted = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
  }

  return `${value < 0 ? "-" : ""}${formatted}%`;
}

/** Format a fractional rate (0.0718) as a percentage without trailing zeros: "7.18%", "4%". */
export function formatRate(rate: number): string {
  return formatPercent(rate * 100, false, 0);
}
