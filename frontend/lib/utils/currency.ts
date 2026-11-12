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
 * Short form for charts and summaries: "€950", "€12.5K", "€1.46M".
 * Keeps decimals so neighbouring values (1.5M vs 2M) stay distinguishable;
 * de-CH's own compact notation rounds to whole millions and has no "K".
 */
function formatCompactAmount(absValue: number, symbol: string): string {
  const [divisor, suffix, digits] =
    absValue >= 999_950
      ? [1e6, "M", 2]
      : absValue >= 999.5
        ? [1e3, "K", 1]
        : [1, "", 0];
  const amount = new Intl.NumberFormat("de-CH", {
    maximumFractionDigits: digits,
  }).format(absValue / divisor);
  return `${symbol}${amount}${suffix}`;
}

/**
 * A display currency, or any other ISO 4217 code a stored amount carries
 * (a loan in "GBP"): the code passed to Intl and the compact-form symbol.
 */
function resolveCurrency(currency: string): { code: string; symbol: string } {
  const known = toInvestmentCurrency(currency);
  if (known) return { code: currencyCodes[known], symbol: currencySymbols[known] };
  const code = currency.toUpperCase();
  return { code, symbol: `${code} ` };
}

/**
 * Format a number as currency. Takes a display currency or a stored ISO
 * code ("EUR", "GBP"); codes outside InvestmentCurrency format by code.
 */
export function formatCurrency(
  value: number,
  currency: InvestmentCurrency | (string & {}),
  options?: { compact?: boolean; showSign?: boolean },
): string {
  const { compact = false, showSign = false } = options ?? {};
  const { code, symbol } = resolveCurrency(currency);

  const formatted = compact
    ? formatCompactAmount(Math.abs(value), symbol)
    : new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(value));

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
