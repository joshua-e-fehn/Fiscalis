/**
 * Investment Classification Rules
 *
 * Rule definitions for classifying financial data from providers
 * (Plaid, Snaptrade, Vezgo) into investment categories and subcategories.
 *
 * Rules are evaluated in priority order (highest first).
 * The first matching rule determines the classification.
 */

import type { ClassificationRule } from "../../../lib/types/classification";

// ═══════════════════════════════════════════════════════════════
// KNOWN SYMBOLS
// ═══════════════════════════════════════════════════════════════

/**
 * Known money market fund symbols
 * These are classified as cash/money-market even though they may
 * appear as mutual_fund in Snaptrade
 */
export const MONEY_MARKET_FUND_SYMBOLS = [
  // Fidelity
  "SPAXX", // Fidelity Government Money Market Fund
  "FDRXX", // Fidelity Government Cash Reserves
  "FTEXX", // Fidelity Treasury Money Market Fund
  "FZFXX", // Fidelity Treasury Only Money Market Fund
  "SPRXX", // Fidelity Money Market Fund - Premium Class
  "FDLXX", // Fidelity Treasury Money Market
  // Vanguard
  "VMFXX", // Vanguard Federal Money Market Fund
  "VMMXX", // Vanguard Prime Money Market Fund
  "VUSXX", // Vanguard Treasury Money Market Fund
  // Schwab
  "SWVXX", // Schwab Value Advantage Money Fund
  "SNSXX", // Schwab Government Money Fund
  "SNVXX", // Schwab Treasury Obligations Money Fund
  // Other
  "TTTXX", // BlackRock Liquidity FedFund
  "PRTXX", // T. Rowe Price Government Money Fund
] as const;

/**
 * Known stablecoin symbols
 * Classified as crypto/stablecoins
 */
export const STABLECOIN_SYMBOLS = [
  // USD-pegged
  "USDC", // USD Coin
  "USDT", // Tether
  "DAI", // Dai
  "BUSD", // Binance USD
  "TUSD", // TrueUSD
  "FRAX", // Frax
  "USDP", // Pax Dollar
  "GUSD", // Gemini Dollar
  "PYUSD", // PayPal USD
  "FDUSD", // First Digital USD
  "USDD", // Decentralized USD
  // EUR-pegged
  "EURC", // EUR Coin
  "EURT", // Tether EUR
  "EURS", // Stasis Euro
  // Other
  "LUSD", // Liquity USD
  "SUSD", // sUSD
  "MIM", // Magic Internet Money
  "CRVUSD", // Curve USD
] as const;

/**
 * Known Bitcoin symbols
 */
export const BITCOIN_SYMBOLS = [
  "BTC",
  "WBTC", // Wrapped Bitcoin
  "BTCB", // Bitcoin BEP2
  "renBTC", // Ren Bitcoin
  "HBTC", // Huobi BTC
  "sBTC", // Synthetix Bitcoin
] as const;

/**
 * Known Ethereum symbols
 */
export const ETHEREUM_SYMBOLS = [
  "ETH",
  "WETH", // Wrapped Ether
  "stETH", // Lido Staked Ether
  "rETH", // Rocket Pool ETH
  "cbETH", // Coinbase Wrapped Staked ETH
  "frxETH", // Frax Ether
  "sfrxETH", // Staked Frax Ether
  "wstETH", // Wrapped stETH
] as const;

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION RULES
// ═══════════════════════════════════════════════════════════════

/**
 * All classification rules ordered by priority (highest first)
 */
export const CLASSIFICATION_RULES: ClassificationRule[] = [
  // ═══════════════════════════════════════════════════════════════
  // PLAID ACCOUNT RULES (Banking)
  // Priority 100-199 for account-type based rules
  // ═══════════════════════════════════════════════════════════════

  // Cash accounts
  {
    id: "plaid_checking",
    name: "Plaid Checking Accounts",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["depository:checking"],
    },
    result: {
      category: "cash",
      subcategory: "checking-accounts",
    },
  },
  {
    id: "plaid_savings",
    name: "Plaid Savings Accounts",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["depository:savings"],
    },
    result: {
      category: "cash",
      subcategory: "savings-accounts",
    },
  },
  {
    id: "plaid_money_market",
    name: "Plaid Money Market Accounts",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["depository:money market"],
    },
    result: {
      category: "cash",
      subcategory: "money-market",
    },
  },
  {
    id: "plaid_cd",
    name: "Plaid Certificates of Deposit",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["depository:cd"],
    },
    result: {
      category: "cash",
      subcategory: "cds",
    },
  },
  {
    id: "plaid_hsa",
    name: "Plaid HSA Accounts",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["depository:hsa"],
    },
    result: {
      category: "cash",
      subcategory: "savings-accounts",
    },
  },
  {
    id: "plaid_paypal",
    name: "Plaid PayPal/Cash App",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["depository:paypal", "depository:cash management"],
    },
    result: {
      category: "cash",
      subcategory: "checking-accounts",
    },
  },

  // Liabilities
  {
    id: "plaid_credit_card",
    name: "Plaid Credit Cards",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["credit:credit card"],
    },
    result: {
      category: "liabilities",
      subcategory: "credit-cards",
    },
  },
  {
    id: "plaid_mortgage",
    name: "Plaid Mortgages",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["loan:mortgage"],
    },
    result: {
      category: "liabilities",
      subcategory: "mortgages",
    },
  },
  {
    id: "plaid_student_loan",
    name: "Plaid Student Loans",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["loan:student"],
    },
    result: {
      category: "liabilities",
      subcategory: "loans",
    },
  },
  {
    id: "plaid_auto_loan",
    name: "Plaid Auto Loans",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["loan:auto"],
    },
    result: {
      category: "liabilities",
      subcategory: "loans",
    },
  },
  {
    id: "plaid_personal_loan",
    name: "Plaid Personal Loans",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["loan:personal", "loan:consumer"],
    },
    result: {
      category: "liabilities",
      subcategory: "loans",
    },
  },
  {
    id: "plaid_home_equity",
    name: "Plaid Home Equity Lines",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["loan:home equity"],
    },
    result: {
      category: "liabilities",
      subcategory: "loans",
    },
  },
  {
    id: "plaid_line_of_credit",
    name: "Plaid Lines of Credit",
    priority: 100,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["loan:line of credit"],
    },
    result: {
      category: "liabilities",
      subcategory: "loans",
    },
  },

  // Fallback for unknown depository accounts
  {
    id: "plaid_depository_fallback",
    name: "Plaid Unknown Depository",
    priority: 50,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["depository"],
    },
    result: {
      category: "cash",
      subcategory: "savings-accounts",
    },
  },

  // Fallback for unknown loan accounts
  {
    id: "plaid_loan_fallback",
    name: "Plaid Unknown Loan",
    priority: 50,
    matcher: {
      type: "account_type",
      provider: "plaid",
      values: ["loan"],
    },
    result: {
      category: "liabilities",
      subcategory: "loans",
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // SNAPTRADE POSITION RULES (Brokers)
  // Priority 100-199 for specific matches
  // Priority 50-99 for general asset type matches
  // ═══════════════════════════════════════════════════════════════

  // Cash positions (highest priority for broker cash)
  {
    id: "snaptrade_cash",
    name: "SnapTrade Cash Positions",
    priority: 100,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: ["cash", "CASH", "Cash"],
    },
    result: {
      category: "cash",
      subcategory: "broker-cash",
    },
  },
  {
    id: "snaptrade_margin_loan",
    name: "SnapTrade Margin Loans (Negative Cash)",
    priority: 110,
    matcher: {
      type: "custom",
      fn: "isNegativeCash",
    },
    result: {
      category: "liabilities",
      subcategory: "margin-loans",
    },
  },

  // Money Market Funds (by symbol - higher priority than mutual_fund)
  {
    id: "snaptrade_money_market_symbol",
    name: "SnapTrade Money Market Funds (by symbol)",
    priority: 95,
    matcher: {
      type: "symbol_exact",
      values: [...MONEY_MARKET_FUND_SYMBOLS],
    },
    result: {
      category: "cash",
      subcategory: "money-market",
    },
  },

  // Money Market Funds (by name pattern)
  {
    id: "snaptrade_money_market_name",
    name: "SnapTrade Money Market Funds (by name)",
    priority: 90,
    matcher: {
      type: "name_pattern",
      regex: "money\\s*market|treasury\\s*liquidity|government\\s*money",
    },
    result: {
      category: "cash",
      subcategory: "money-market",
    },
  },

  // Forex positions
  {
    id: "snaptrade_forex",
    name: "SnapTrade Forex Positions",
    priority: 100,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: ["forex", "FOREX", "Forex", "currency", "CURRENCY"],
    },
    result: {
      category: "cash",
      subcategory: "forex",
    },
  },

  // Equity positions
  {
    id: "snaptrade_stock",
    name: "SnapTrade Stocks",
    priority: 50,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: ["equity", "EQUITY", "Equity", "stock", "STOCK", "Stock"],
    },
    result: {
      category: "equities",
      subcategory: "stocks",
    },
  },

  // ETF positions
  {
    id: "snaptrade_etf",
    name: "SnapTrade ETFs",
    priority: 60,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: ["etf", "ETF", "Etf"],
    },
    result: {
      category: "equities",
      subcategory: "etfs",
    },
  },

  // Mutual Fund positions
  {
    id: "snaptrade_mutual_fund",
    name: "SnapTrade Mutual Funds",
    priority: 55,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: ["mutual_fund", "MUTUAL_FUND", "MutualFund", "mutual fund"],
    },
    result: {
      category: "equities",
      subcategory: "funds",
    },
  },

  // Option positions
  {
    id: "snaptrade_option",
    name: "SnapTrade Options",
    priority: 70,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: ["option", "OPTION", "Option"],
    },
    result: {
      category: "equities",
      subcategory: "options",
    },
  },

  // Bond positions
  {
    id: "snaptrade_bond",
    name: "SnapTrade Bonds",
    priority: 50,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: [
        "bond",
        "BOND",
        "Bond",
        "fixed_income",
        "FIXED_INCOME",
        "FixedIncome",
      ],
    },
    result: {
      category: "bonds",
      subcategory: "corporate", // Default to corporate, could be refined
    },
  },

  // Cryptocurrency positions (in broker accounts)
  {
    id: "snaptrade_crypto",
    name: "SnapTrade Cryptocurrency",
    priority: 50,
    matcher: {
      type: "asset_type",
      provider: "snaptrade",
      values: ["cryptocurrency", "CRYPTOCURRENCY", "Cryptocurrency", "crypto"],
    },
    result: {
      category: "crypto",
      subcategory: "altcoins", // Default, will be refined by symbol
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // VEZGO POSITION RULES (Crypto)
  // For future Vezgo integration
  // ═══════════════════════════════════════════════════════════════

  // Bitcoin (by symbol - highest priority)
  {
    id: "vezgo_bitcoin",
    name: "Vezgo Bitcoin",
    priority: 100,
    matcher: {
      type: "symbol_exact",
      values: [...BITCOIN_SYMBOLS],
    },
    result: {
      category: "crypto",
      subcategory: "bitcoin",
    },
  },

  // Ethereum (by symbol)
  {
    id: "vezgo_ethereum",
    name: "Vezgo Ethereum",
    priority: 100,
    matcher: {
      type: "symbol_exact",
      values: [...ETHEREUM_SYMBOLS],
    },
    result: {
      category: "crypto",
      subcategory: "ethereum",
    },
  },

  // Stablecoins (by symbol)
  {
    id: "vezgo_stablecoin",
    name: "Vezgo Stablecoins",
    priority: 95,
    matcher: {
      type: "symbol_exact",
      values: [...STABLECOIN_SYMBOLS],
    },
    result: {
      category: "crypto",
      subcategory: "stablecoins",
    },
  },

  // NFTs
  {
    id: "vezgo_nft",
    name: "Vezgo NFTs",
    priority: 100,
    matcher: {
      type: "asset_type",
      provider: "vezgo",
      values: ["nft", "NFT", "Nft"],
    },
    result: {
      category: "crypto",
      subcategory: "nfts",
    },
  },

  // DeFi positions
  {
    id: "vezgo_defi",
    name: "Vezgo DeFi Positions",
    priority: 90,
    matcher: {
      type: "asset_type",
      provider: "vezgo",
      values: ["defi", "DEFI", "DeFi", "lp_token", "LP_TOKEN", "liquidity"],
    },
    result: {
      category: "crypto",
      subcategory: "defi",
    },
  },

  // Generic cryptocurrency fallback
  {
    id: "vezgo_crypto_fallback",
    name: "Vezgo Cryptocurrency (fallback)",
    priority: 10,
    matcher: {
      type: "asset_type",
      provider: "vezgo",
      values: ["cryptocurrency", "token", "coin"],
    },
    result: {
      category: "crypto",
      subcategory: "altcoins",
    },
  },
];

/**
 * Get rules filtered by provider
 */
export function getRulesByProvider(
  provider: "plaid" | "snaptrade" | "vezgo",
): ClassificationRule[] {
  return CLASSIFICATION_RULES.filter((rule) => {
    if (rule.matcher.type === "account_type") {
      return rule.matcher.provider === provider;
    }
    if (rule.matcher.type === "asset_type") {
      return rule.matcher.provider === provider;
    }
    // Symbol and name pattern rules can apply to any provider
    return true;
  });
}

/**
 * Get rules sorted by priority (highest first)
 */
export function getRulesSortedByPriority(): ClassificationRule[] {
  return [...CLASSIFICATION_RULES].sort((a, b) => b.priority - a.priority);
}

/**
 * Find rule by ID
 */
export function getRuleById(ruleId: string): ClassificationRule | undefined {
  return CLASSIFICATION_RULES.find((rule) => rule.id === ruleId);
}
