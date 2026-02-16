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
 * Format a number as currency
 */
export function formatCurrency(
  value: number,
  currency: InvestmentCurrency,
  options?: { compact?: boolean; showSign?: boolean },
): string {
  const { compact = false, showSign = false } = options ?? {};

  const formatted = new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyCodes[currency],
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(Math.abs(value));

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  }

  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Format a percentage value
 */
export function formatPercent(value: number, showSign = false): string {
  const formatted = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
  }

  return `${value < 0 ? "-" : ""}${formatted}%`;
}
