/**
 * Investment Classification Engine
 *
 * Core logic for classifying financial data from providers
 * into investment categories and subcategories.
 */

import type {
  ClassificationResult,
  ClassificationRule,
  PlaidAccountContext,
  SnaptradePositionContext,
  BitpandaPositionContext,
  InvestmentCategory,
  InvestmentSubcategory,
} from "../../../lib/types/classification";

import { BASE_CURRENCY } from "./currency";

import {
  CLASSIFICATION_RULES,
  MONEY_MARKET_FUND_SYMBOLS,
  STABLECOIN_SYMBOLS,
  BITCOIN_SYMBOLS,
  ETHEREUM_SYMBOLS,
} from "./rules";

// ═══════════════════════════════════════════════════════════════
// MAIN CLASSIFICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Classify a Plaid account
 */
export function classifyPlaidAccount(
  context: Omit<PlaidAccountContext, "provider">,
): ClassificationResult {
  const fullContext: PlaidAccountContext = { ...context, provider: "plaid" };

  // Build the account type string (e.g., "depository:checking")
  const accountTypeKey = context.subtype
    ? `${context.type}:${context.subtype}`
    : context.type;

  // Sort rules by priority (highest first)
  const sortedRules = [...CLASSIFICATION_RULES].sort(
    (a, b) => b.priority - a.priority,
  );

  // Find matching rule
  for (const rule of sortedRules) {
    if (matchRule(rule, fullContext, accountTypeKey)) {
      return {
        category: rule.result.category,
        subcategory: rule.result.subcategory,
        confidence: 1.0,
        ruleId: rule.id,
        ruleName: rule.name,
        source: "auto",
      };
    }
  }

  // Default fallback based on account type
  return getDefaultClassification(context.type);
}

/**
 * Classify a Snaptrade position
 */
export function classifySnaptradePosition(
  context: Omit<SnaptradePositionContext, "provider">,
): ClassificationResult {
  const fullContext: SnaptradePositionContext = {
    ...context,
    provider: "snaptrade",
  };

  // Check for margin loan (negative cash)
  if (isNegativeCash(fullContext)) {
    return {
      category: "liabilities",
      subcategory: "margin-loans",
      confidence: 1.0,
      ruleId: "snaptrade_margin_loan",
      ruleName: "SnapTrade Margin Loans (Negative Cash)",
      source: "auto",
    };
  }

  // Check symbol-based classifications first (money market funds, etc.)
  const symbolClassification = classifyBySymbol(context.symbol, context.name);
  if (symbolClassification) {
    return symbolClassification;
  }

  // Sort rules by priority (highest first)
  const sortedRules = [...CLASSIFICATION_RULES].sort(
    (a, b) => b.priority - a.priority,
  );

  // Find matching rule
  for (const rule of sortedRules) {
    if (matchRule(rule, fullContext)) {
      return {
        category: rule.result.category,
        subcategory: rule.result.subcategory,
        confidence: 1.0,
        ruleId: rule.id,
        ruleName: rule.name,
        source: "auto",
      };
    }
  }

  // Default fallback for unknown asset types
  return {
    category: "equities",
    subcategory: "stocks",
    confidence: 0.5,
    ruleId: "fallback_unknown",
    ruleName: "Unknown Asset Type (defaulted to stocks)",
    source: "auto",
  };
}

/**
 * Classify a Bitpanda holding
 *
 * Bitpanda spans crypto, metals, commodities, stocks/ETFs, indices and fiat.
 * Order: fiat handling → symbol-based (BTC/ETH/stablecoins/MMF) → asset-type rules → fallback.
 */
export function classifyBitpandaPosition(
  context: Omit<BitpandaPositionContext, "provider">,
): ClassificationResult {
  const fullContext: BitpandaPositionContext = {
    ...context,
    provider: "bitpanda",
  };

  // Fiat wallets: base currency → cash savings; anything else → forex
  const assetType = context.assetType.toLowerCase();
  if (assetType === "fiat" || assetType === "fiatwallet") {
    const isBase =
      context.symbol.toUpperCase() === BASE_CURRENCY.toUpperCase();
    return {
      category: "cash",
      subcategory: isBase ? "savings-accounts" : "forex",
      confidence: 1.0,
      ruleId: isBase ? "bitpanda_fiat_base" : "bitpanda_fiat_forex",
      ruleName: isBase
        ? "Bitpanda Fiat (base currency)"
        : "Bitpanda Fiat (foreign currency)",
      source: "auto",
    };
  }

  // Check symbol-based classifications first (BTC, ETH, stablecoins, etc.)
  const symbolClassification = classifyBySymbol(context.symbol, context.name);
  if (symbolClassification) {
    return symbolClassification;
  }

  // Sort rules by priority (highest first)
  const sortedRules = [...CLASSIFICATION_RULES].sort(
    (a, b) => b.priority - a.priority,
  );

  // Find matching rule
  for (const rule of sortedRules) {
    if (matchRule(rule, fullContext)) {
      return {
        category: rule.result.category,
        subcategory: rule.result.subcategory,
        confidence: 1.0,
        ruleId: rule.id,
        ruleName: rule.name,
        source: "auto",
      };
    }
  }

  // Default fallback: treat unknown Bitpanda assets as altcoins
  return {
    category: "crypto",
    subcategory: "altcoins",
    confidence: 0.5,
    ruleId: "fallback_bitpanda",
    ruleName: "Unknown Bitpanda Asset (defaulted to altcoins)",
    source: "auto",
  };
}

// ═══════════════════════════════════════════════════════════════
// RULE MATCHING
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a rule matches the given context
 */
function matchRule(
  rule: ClassificationRule,
  context:
    | PlaidAccountContext
    | SnaptradePositionContext
    | BitpandaPositionContext,
  accountTypeKey?: string,
): boolean {
  const { matcher } = rule;

  switch (matcher.type) {
    case "account_type": {
      if (context.provider !== "plaid") return false;
      if (matcher.provider !== "plaid") return false;
      if (!accountTypeKey) return false;

      // Check if the account type matches any of the values
      const normalizedKey = accountTypeKey.toLowerCase();
      return matcher.values.some((v) => normalizedKey === v.toLowerCase());
    }

    case "asset_type": {
      if (context.provider === "plaid") return false;
      if (matcher.provider !== context.provider) return false;

      const assetType = "assetType" in context ? context.assetType : "";
      const normalizedAssetType = assetType.toLowerCase();

      return matcher.values.some(
        (v) => normalizedAssetType === v.toLowerCase(),
      );
    }

    case "symbol_exact": {
      if (context.provider === "plaid") return false;
      const symbol = "symbol" in context ? context.symbol : "";
      const normalizedSymbol = symbol.toUpperCase();

      return matcher.values.some((v) => normalizedSymbol === v.toUpperCase());
    }

    case "symbol_pattern": {
      if (context.provider === "plaid") return false;
      const symbol = "symbol" in context ? context.symbol : "";

      try {
        const regex = new RegExp(matcher.regex, "i");
        return regex.test(symbol);
      } catch {
        return false;
      }
    }

    case "name_pattern": {
      const name =
        context.provider === "plaid"
          ? context.name
          : "name" in context
            ? (context.name ?? "")
            : "";

      try {
        const regex = new RegExp(matcher.regex, "i");
        return regex.test(name);
      } catch {
        return false;
      }
    }

    case "custom": {
      // Handle custom matchers
      if (matcher.fn === "isNegativeCash") {
        if (context.provider === "plaid") return false;
        return isNegativeCash(context as SnaptradePositionContext);
      }
      return false;
    }

    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// SYMBOL-BASED CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Classify based on known symbol lists
 */
function classifyBySymbol(
  symbol: string,
  name: string | null,
): ClassificationResult | null {
  const normalizedSymbol = symbol.toUpperCase();

  // Check money market funds
  if (
    MONEY_MARKET_FUND_SYMBOLS.some((s) => normalizedSymbol === s.toUpperCase())
  ) {
    return {
      category: "cash",
      subcategory: "money-market",
      confidence: 1.0,
      ruleId: "symbol_money_market",
      ruleName: "Money Market Fund (by symbol)",
      source: "auto",
    };
  }

  // Check Bitcoin
  if (BITCOIN_SYMBOLS.some((s) => normalizedSymbol === s.toUpperCase())) {
    return {
      category: "crypto",
      subcategory: "bitcoin",
      confidence: 1.0,
      ruleId: "symbol_bitcoin",
      ruleName: "Bitcoin (by symbol)",
      source: "auto",
    };
  }

  // Check Ethereum
  if (ETHEREUM_SYMBOLS.some((s) => normalizedSymbol === s.toUpperCase())) {
    return {
      category: "crypto",
      subcategory: "ethereum",
      confidence: 1.0,
      ruleId: "symbol_ethereum",
      ruleName: "Ethereum (by symbol)",
      source: "auto",
    };
  }

  // Check stablecoins
  if (STABLECOIN_SYMBOLS.some((s) => normalizedSymbol === s.toUpperCase())) {
    return {
      category: "crypto",
      subcategory: "stablecoins",
      confidence: 1.0,
      ruleId: "symbol_stablecoin",
      ruleName: "Stablecoin (by symbol)",
      source: "auto",
    };
  }

  // Check name for money market pattern
  if (name) {
    const moneyMarketPattern = /money\s*market|treasury\s*liquidity/i;
    if (moneyMarketPattern.test(name)) {
      return {
        category: "cash",
        subcategory: "money-market",
        confidence: 0.9,
        ruleId: "name_money_market",
        ruleName: "Money Market Fund (by name pattern)",
        source: "auto",
      };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM MATCHERS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a position is negative cash (margin loan)
 */
function isNegativeCash(context: SnaptradePositionContext): boolean {
  const assetType = context.assetType.toLowerCase();
  const isCash =
    assetType === "cash" || context.symbol.toUpperCase() === "CASH";

  if (!isCash) return false;

  // Check for negative quantity or market value
  if (context.quantity < 0) return true;
  if (context.marketValue !== null && context.marketValue < 0) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Get default classification based on Plaid account type
 */
function getDefaultClassification(accountType: string): ClassificationResult {
  const normalizedType = accountType.toLowerCase();

  if (normalizedType === "depository") {
    return {
      category: "cash",
      subcategory: "savings-accounts",
      confidence: 0.7,
      ruleId: "default_depository",
      ruleName: "Unknown Depository (defaulted to savings)",
      source: "auto",
    };
  }

  if (normalizedType === "credit") {
    return {
      category: "liabilities",
      subcategory: "credit-cards",
      confidence: 0.7,
      ruleId: "default_credit",
      ruleName: "Unknown Credit (defaulted to credit cards)",
      source: "auto",
    };
  }

  if (normalizedType === "loan") {
    return {
      category: "liabilities",
      subcategory: "loans",
      confidence: 0.7,
      ruleId: "default_loan",
      ruleName: "Unknown Loan (defaulted to loans)",
      source: "auto",
    };
  }

  if (normalizedType === "investment") {
    return {
      category: "equities",
      subcategory: "stocks",
      confidence: 0.5,
      ruleId: "default_investment",
      ruleName: "Investment Account (defaulted to equities)",
      source: "auto",
    };
  }

  // Final fallback
  return {
    category: "cash",
    subcategory: "savings-accounts",
    confidence: 0.3,
    ruleId: "default_unknown",
    ruleName: "Unknown Account Type",
    source: "auto",
  };
}

// ═══════════════════════════════════════════════════════════════
// USER OVERRIDES
// ═══════════════════════════════════════════════════════════════

/**
 * Apply user override to a classification result
 */
export function applyUserOverride(
  result: ClassificationResult,
  userOverride: {
    category?: InvestmentCategory | null;
    subcategory?: InvestmentSubcategory | null;
  } | null,
): ClassificationResult {
  if (!userOverride) return result;

  const hasOverride = userOverride.category || userOverride.subcategory;
  if (!hasOverride) return result;

  return {
    ...result,
    category: userOverride.category ?? result.category,
    subcategory: userOverride.subcategory ?? result.subcategory,
    source: "user_override",
    ruleId: "user_override",
    ruleName: "User Override",
    confidence: 1.0,
  };
}

/**
 * Check if an item has a user override
 */
export function hasUserOverride(item: {
  userCategoryOverride?: string | null;
  userSubcategoryOverride?: string | null;
}): boolean {
  return Boolean(item.userCategoryOverride || item.userSubcategoryOverride);
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get classification fields for database storage
 */
export function getClassificationFields(result: ClassificationResult): {
  investmentCategory: string;
  investmentSubcategory: string;
  classificationSource: string;
  classificationRule: string;
} {
  return {
    investmentCategory: result.category,
    investmentSubcategory: result.subcategory,
    classificationSource: result.source,
    classificationRule: result.ruleId,
  };
}

/**
 * Re-classify all items of a given type (for migrations/bulk updates)
 */
export function reclassifyPlaidAccounts(
  accounts: Array<{
    type: string;
    subtype: string | null;
    name: string;
    userCategoryOverride?: string | null;
    userSubcategoryOverride?: string | null;
  }>,
): Array<ClassificationResult> {
  return accounts.map((account) => {
    const result = classifyPlaidAccount({
      type: account.type,
      subtype: account.subtype,
      name: account.name,
    });

    return applyUserOverride(result, {
      category: account.userCategoryOverride as InvestmentCategory | null,
      subcategory:
        account.userSubcategoryOverride as InvestmentSubcategory | null,
    });
  });
}

/**
 * Re-classify all broker positions (for migrations/bulk updates)
 */
export function reclassifyBrokerPositions(
  positions: Array<{
    assetType: string;
    symbol: string;
    name: string | null;
    quantity: number;
    marketValue: number | null;
    userCategoryOverride?: string | null;
    userSubcategoryOverride?: string | null;
  }>,
): Array<ClassificationResult> {
  return positions.map((position) => {
    const result = classifySnaptradePosition({
      assetType: position.assetType,
      symbol: position.symbol,
      name: position.name,
      quantity: position.quantity,
      marketValue: position.marketValue,
    });

    return applyUserOverride(result, {
      category: position.userCategoryOverride as InvestmentCategory | null,
      subcategory:
        position.userSubcategoryOverride as InvestmentSubcategory | null,
    });
  });
}
