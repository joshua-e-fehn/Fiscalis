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
 * Short form for charts and summaries: "€950", "€12.5K", "€1.46M".
 * Keeps decimals so neighbouring values (1.5M vs 2M) stay distinguishable;
 * de-CH's own compact notation rounds to whole millions and has no "K".
 */
function formatCompactAmount(
  absValue: number,
  currency: InvestmentCurrency,
): string {
  const [divisor, suffix, digits] =
    absValue >= 999_950
      ? [1e6, "M", 2]
      : absValue >= 999.5
        ? [1e3, "K", 1]
        : [1, "", 0];
  const amount = new Intl.NumberFormat("de-CH", {
    maximumFractionDigits: digits,
  }).format(absValue / divisor);
  return `${currencySymbols[currency]}${amount}${suffix}`;
}

/**
 * Format a number as currency
 */
export function formatCurrency(
  value: number,
  currency: InvestmentCurrency,
  options?: { compact?: boolean; showSign?: boolean },
): string {
  const { compact = false, showSign = false } = options ?? {};

  const formatted = compact
    ? formatCompactAmount(Math.abs(value), currency)
    : new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: currencyCodes[currency],
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
