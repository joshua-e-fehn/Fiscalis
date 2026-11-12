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
} from "./engine";

// Currency conversion lives in services/finance/currency.ts (toBase)
