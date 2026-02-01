/**
 * Currency Conversion Utilities
 *
 * Handles exchange rate lookups and currency conversions
 * for consolidating multi-currency holdings to EUR base.
 */

import type {
  CurrencyConversion,
  SupportedCurrency,
} from "../../../lib/types/classification";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Default base currency for the application */
export const BASE_CURRENCY = "EUR";

/** Cache duration for exchange rates (15 minutes) */
export const EXCHANGE_RATE_CACHE_DURATION_MS = 15 * 60 * 1000;

/** Known currency codes */
export const KNOWN_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "CNY",
  "HKD",
  "SGD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "BRL",
  "MXN",
  "INR",
  "KRW",
  "NZD",
  "ZAR",
  "TRY",
  "ILS",
  "AED",
  "THB",
  "TWD",
  "RUB",
] as const;

export type KnownCurrency = (typeof KNOWN_CURRENCIES)[number];

// ═══════════════════════════════════════════════════════════════
// EXCHANGE RATE TYPES
// ═══════════════════════════════════════════════════════════════

export interface ExchangeRate {
  /** Source currency code */
  from: string;
  /** Target currency code */
  to: string;
  /** Exchange rate (multiply source by this to get target) */
  rate: number;
  /** Timestamp when the rate was fetched */
  timestamp: number;
  /** Source of the rate data */
  source: "api" | "fallback" | "cached";
}

export interface ExchangeRateCache {
  rates: Record<string, ExchangeRate>;
  lastUpdated: number;
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK RATES
// ═══════════════════════════════════════════════════════════════

/**
 * Fallback exchange rates (to EUR) for when API is unavailable.
 * These are approximate and should only be used as a last resort.
 * Updated: January 2025 (approximate values)
 */
const FALLBACK_RATES_TO_EUR: Record<string, number> = {
  EUR: 1.0,
  USD: 0.92,
  GBP: 1.19,
  CHF: 1.06,
  JPY: 0.0061,
  CAD: 0.66,
  AUD: 0.59,
  CNY: 0.13,
  HKD: 0.12,
  SGD: 0.69,
  SEK: 0.088,
  NOK: 0.084,
  DKK: 0.134,
  PLN: 0.23,
  CZK: 0.04,
  HUF: 0.0024,
  BRL: 0.15,
  MXN: 0.046,
  INR: 0.011,
  KRW: 0.00065,
  NZD: 0.55,
  ZAR: 0.051,
  TRY: 0.026,
  ILS: 0.25,
  AED: 0.25,
  THB: 0.027,
  TWD: 0.029,
  RUB: 0.0092,
};

// ═══════════════════════════════════════════════════════════════
// MAIN CONVERSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Convert an amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string = BASE_CURRENCY,
  exchangeRate?: number,
): CurrencyConversion {
  const normalizedFrom = fromCurrency.toUpperCase();
  const normalizedTo = toCurrency.toUpperCase() as SupportedCurrency;

  // Same currency - no conversion needed
  if (normalizedFrom === normalizedTo) {
    return {
      originalValue: amount,
      originalCurrency: normalizedFrom,
      baseValue: amount,
      baseCurrency: normalizedTo,
      exchangeRate: 1.0,
      rateTimestamp: Date.now(),
    };
  }

  // Use provided rate or get fallback
  const rate =
    exchangeRate ?? getExchangeRateToBaseCurrency(normalizedFrom, normalizedTo);

  const baseValue = amount * rate;

  return {
    originalValue: amount,
    originalCurrency: normalizedFrom,
    baseValue: Math.round(baseValue * 100) / 100, // Round to 2 decimal places
    baseCurrency: normalizedTo,
    exchangeRate: rate,
    rateTimestamp: Date.now(),
  };
}

/**
 * Get exchange rate to convert from source currency to base currency
 */
export function getExchangeRateToBaseCurrency(
  fromCurrency: string,
  toCurrency: string = BASE_CURRENCY,
): number {
  const normalizedFrom = fromCurrency.toUpperCase();
  const normalizedTo = toCurrency.toUpperCase();

  // Same currency
  if (normalizedFrom === normalizedTo) {
    return 1.0;
  }

  // Direct conversion to EUR
  if (normalizedTo === "EUR") {
    return FALLBACK_RATES_TO_EUR[normalizedFrom] ?? 1.0;
  }

  // Conversion from EUR to another currency
  if (normalizedFrom === "EUR") {
    const toEurRate = FALLBACK_RATES_TO_EUR[normalizedTo];
    if (toEurRate) {
      return 1 / toEurRate;
    }
    return 1.0;
  }

  // Cross conversion via EUR
  const fromToEur = FALLBACK_RATES_TO_EUR[normalizedFrom] ?? 1.0;
  const toToEur = FALLBACK_RATES_TO_EUR[normalizedTo] ?? 1.0;

  if (toToEur === 0) return 1.0;

  return fromToEur / toToEur;
}

/**
 * Get conversion fields for database storage
 */
export function getCurrencyConversionFields(conversion: CurrencyConversion): {
  valueInBaseCurrency: number;
  exchangeRateUsed: number;
  exchangeRateTimestamp: number;
  baseCurrency: string;
} {
  return {
    valueInBaseCurrency: conversion.baseValue,
    exchangeRateUsed: conversion.exchangeRate,
    exchangeRateTimestamp: conversion.rateTimestamp,
    baseCurrency: conversion.baseCurrency,
  };
}

// ═══════════════════════════════════════════════════════════════
// BATCH OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Convert multiple amounts to base currency
 */
export function convertMultipleCurrencies(
  items: Array<{
    amount: number;
    currency: string;
  }>,
  toCurrency: string = BASE_CURRENCY,
  exchangeRates?: Record<string, number>,
): CurrencyConversion[] {
  return items.map((item) =>
    convertCurrency(
      item.amount,
      item.currency,
      toCurrency,
      exchangeRates?.[item.currency.toUpperCase()],
    ),
  );
}

/**
 * Calculate total in base currency from multiple holdings
 */
export function calculateTotalInBaseCurrency(
  holdings: Array<{
    amount: number;
    currency: string;
  }>,
  toCurrency: string = BASE_CURRENCY,
  exchangeRates?: Record<string, number>,
): {
  total: number;
  conversions: CurrencyConversion[];
} {
  const conversions = convertMultipleCurrencies(
    holdings,
    toCurrency,
    exchangeRates,
  );

  const total = conversions.reduce(
    (sum, conversion) => sum + conversion.baseValue,
    0,
  );

  return {
    total: Math.round(total * 100) / 100,
    conversions,
  };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION & UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a currency code is valid
 */
export function isValidCurrencyCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;

  const normalized = code.toUpperCase().trim();

  // Must be 3 characters
  if (normalized.length !== 3) return false;

  // Must be alphabetic
  if (!/^[A-Z]{3}$/.test(normalized)) return false;

  return true;
}

/**
 * Check if a currency code is in our known list
 */
export function isKnownCurrency(code: string): code is KnownCurrency {
  return KNOWN_CURRENCIES.includes(code.toUpperCase() as KnownCurrency);
}

/**
 * Normalize a currency code
 */
export function normalizeCurrencyCode(code: string): string {
  return code.toUpperCase().trim();
}

/**
 * Get the symbol for a currency
 */
export function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    CHF: "CHF",
    JPY: "¥",
    CAD: "CA$",
    AUD: "A$",
    CNY: "¥",
    HKD: "HK$",
    SGD: "S$",
    SEK: "kr",
    NOK: "kr",
    DKK: "kr",
    PLN: "zł",
    CZK: "Kč",
    HUF: "Ft",
    BRL: "R$",
    MXN: "MX$",
    INR: "₹",
    KRW: "₩",
    NZD: "NZ$",
    ZAR: "R",
    TRY: "₺",
    ILS: "₪",
    AED: "د.إ",
    THB: "฿",
    TWD: "NT$",
    RUB: "₽",
  };

  return symbols[code.toUpperCase()] ?? code;
}

/**
 * Format an amount in a currency
 */
export function formatCurrency(
  amount: number,
  currency: string,
  options: Intl.NumberFormatOptions = {},
): string {
  const normalized = normalizeCurrencyCode(currency);

  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: normalized,
      ...options,
    }).format(amount);
  } catch {
    // Fallback if currency code is invalid
    const symbol = getCurrencySymbol(normalized);
    return `${symbol}${amount.toFixed(2)}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXCHANGE RATE CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Create an empty exchange rate cache
 */
export function createExchangeRateCache(): ExchangeRateCache {
  return {
    rates: {},
    lastUpdated: 0,
  };
}

/**
 * Check if a cache is stale
 */
export function isCacheStale(
  cache: ExchangeRateCache,
  maxAgeMs: number = EXCHANGE_RATE_CACHE_DURATION_MS,
): boolean {
  return Date.now() - cache.lastUpdated > maxAgeMs;
}

/**
 * Get a rate from cache
 */
export function getRateFromCache(
  cache: ExchangeRateCache,
  fromCurrency: string,
  toCurrency: string = BASE_CURRENCY,
): ExchangeRate | null {
  const key = `${fromCurrency.toUpperCase()}_${toCurrency.toUpperCase()}`;
  return cache.rates[key] ?? null;
}

/**
 * Add a rate to cache
 */
export function addRateToCache(
  cache: ExchangeRateCache,
  rate: ExchangeRate,
): ExchangeRateCache {
  const key = `${rate.from.toUpperCase()}_${rate.to.toUpperCase()}`;
  return {
    rates: {
      ...cache.rates,
      [key]: rate,
    },
    lastUpdated: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════
// FOREX POSITION DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a symbol represents a forex position (foreign currency holding)
 */
export function isForexPosition(
  symbol: string,
  baseCurrency: string = BASE_CURRENCY,
): boolean {
  const normalized = symbol.toUpperCase();

  // Check if it's a known currency code that's not the base
  if (
    isKnownCurrency(normalized) &&
    normalized !== baseCurrency.toUpperCase()
  ) {
    return true;
  }

  // Check for forex pair patterns like EUR/USD, EURUSD
  const forexPairPattern = /^([A-Z]{3})[\/]?([A-Z]{3})$/;
  const match = normalized.match(forexPairPattern);

  if (match) {
    const [, currency1, currency2] = match;
    return (
      (isKnownCurrency(currency1) || isKnownCurrency(currency2)) &&
      normalized !== baseCurrency.toUpperCase()
    );
  }

  return false;
}

/**
 * Extract the currency from a forex symbol
 */
export function extractCurrencyFromForex(
  symbol: string,
  baseCurrency: string = BASE_CURRENCY,
): string | null {
  const normalized = symbol.toUpperCase();

  // Direct currency code
  if (isKnownCurrency(normalized)) {
    return normalized;
  }

  // Forex pair pattern
  const forexPairPattern = /^([A-Z]{3})[\/]?([A-Z]{3})$/;
  const match = normalized.match(forexPairPattern);

  if (match) {
    const [, currency1, currency2] = match;
    // Return the currency that's not the base currency
    if (currency1.toUpperCase() === baseCurrency.toUpperCase()) {
      return currency2;
    }
    if (currency2.toUpperCase() === baseCurrency.toUpperCase()) {
      return currency1;
    }
    // If neither is base, return the first one
    return currency1;
  }

  return null;
}
