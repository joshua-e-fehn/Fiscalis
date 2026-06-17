/**
 * Classification Module
 *
 * Main entry point for the investment classification system.
 * Exports all classification-related functionality.
 */

// Classification Rules
export {
  CLASSIFICATION_RULES,
  MONEY_MARKET_FUND_SYMBOLS,
  STABLECOIN_SYMBOLS,
  BITCOIN_SYMBOLS,
  ETHEREUM_SYMBOLS,
  getRulesByProvider,
  getRulesSortedByPriority,
  getRuleById,
} from "./rules";

// Classification Engine
export {
  classifyPlaidAccount,
  classifySnaptradePosition,
  classifyBitpandaPosition,
  applyUserOverride,
  hasUserOverride,
  getClassificationFields,
  reclassifyPlaidAccounts,
  reclassifyBrokerPositions,
} from "./engine";

// Currency Utilities
export {
  BASE_CURRENCY,
  KNOWN_CURRENCIES,
  EXCHANGE_RATE_CACHE_DURATION_MS,
  convertCurrency,
  getExchangeRateToBaseCurrency,
  getCurrencyConversionFields,
  convertMultipleCurrencies,
  calculateTotalInBaseCurrency,
  isValidCurrencyCode,
  isKnownCurrency,
  normalizeCurrencyCode,
  getCurrencySymbol,
  formatCurrency,
  createExchangeRateCache,
  isCacheStale,
  getRateFromCache,
  addRateToCache,
  isForexPosition,
  extractCurrencyFromForex,
} from "./currency";

// Re-export types
export type {
  KnownCurrency,
  ExchangeRate,
  ExchangeRateCache,
} from "./currency";
