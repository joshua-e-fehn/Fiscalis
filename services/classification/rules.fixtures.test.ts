/**
 * Rule-table fixtures (ENG-237): one provider input per classification rule,
 * with the rule it must hit and where it files the item. Every rule in
 * CLASSIFICATION_RULES and every engine-level outcome (fiat handling,
 * fallbacks, Plaid defaults) needs at least one fixture, so a new rule or a
 * priority change that steals another rule's inputs fails here.
 */
import { describe, expect, it } from "vitest";
import type {
  BitpandaPositionContext,
  PlaidAccountContext,
  SnaptradePositionContext,
} from "../../frontend/lib/types/classification";
import {
  CLASSIFICATION_RULES,
  classifyBitpandaPosition,
  classifyPlaidAccount,
  classifySnaptradePosition,
  getRuleById,
} from "./index";

type Expected = { ruleId: string; category: string; subcategory: string };

type Fixture =
  | ({ provider: "plaid"; input: Omit<PlaidAccountContext, "provider"> } & Expected)
  | ({
      provider: "snaptrade";
      input: Omit<SnaptradePositionContext, "provider">;
    } & Expected)
  | ({
      provider: "bitpanda";
      input: Omit<BitpandaPositionContext, "provider">;
    } & Expected);

const plaid = (
  type: string,
  subtype: string | null,
  ruleId: string,
  category: string,
  subcategory: string,
  name = "Account",
): Fixture => ({
  provider: "plaid",
  input: { type, subtype, name },
  ruleId,
  category,
  subcategory,
});

const snaptrade = (
  assetType: string,
  symbol: string,
  ruleId: string,
  category: string,
  subcategory: string,
  extra: Partial<Omit<SnaptradePositionContext, "provider">> = {},
): Fixture => ({
  provider: "snaptrade",
  input: { assetType, symbol, name: null, quantity: 10, marketValue: 1000, ...extra },
  ruleId,
  category,
  subcategory,
});

const bitpanda = (
  assetType: string,
  symbol: string,
  ruleId: string,
  category: string,
  subcategory: string,
): Fixture => ({
  provider: "bitpanda",
  input: { assetType, symbol, name: null },
  ruleId,
  category,
  subcategory,
});

const CLASSIFICATION_FIXTURES: Fixture[] = [
  // Plaid: type:subtype rules
  plaid("depository", "checking", "plaid_checking", "cash", "checking-accounts"),
  plaid("Depository", "Checking", "plaid_checking", "cash", "checking-accounts"),
  plaid("depository", "savings", "plaid_savings", "cash", "savings-accounts"),
  plaid("depository", "money market", "plaid_money_market", "cash", "money-market"),
  plaid("depository", "cd", "plaid_cd", "cash", "cds"),
  plaid("depository", "hsa", "plaid_hsa", "cash", "savings-accounts"),
  plaid("depository", "paypal", "plaid_paypal", "cash", "checking-accounts"),
  plaid("depository", "cash management", "plaid_paypal", "cash", "checking-accounts"),
  plaid("credit", "credit card", "plaid_credit_card", "liabilities", "credit-cards"),
  plaid("loan", "mortgage", "plaid_mortgage", "liabilities", "mortgages"),
  plaid("loan", "student", "plaid_student_loan", "liabilities", "loans"),
  plaid("loan", "auto", "plaid_auto_loan", "liabilities", "loans"),
  plaid("loan", "personal", "plaid_personal_loan", "liabilities", "loans"),
  plaid("loan", "consumer", "plaid_personal_loan", "liabilities", "loans"),
  plaid("loan", "home equity", "plaid_home_equity", "liabilities", "loans"),
  plaid("loan", "line of credit", "plaid_line_of_credit", "liabilities", "loans"),
  // Plaid: a type without subtype hits the type-only fallback rules
  plaid("depository", null, "plaid_depository_fallback", "cash", "savings-accounts"),
  plaid("loan", null, "plaid_loan_fallback", "liabilities", "loans"),
  // Plaid: an unknown subtype matches no rule and gets the type default
  plaid("depository", "prepaid", "default_depository", "cash", "savings-accounts"),
  plaid("credit", "store card", "default_credit", "liabilities", "credit-cards"),
  plaid("loan", "boat", "default_loan", "liabilities", "loans"),
  plaid("investment", "brokerage", "default_investment", "equities", "stocks"),
  plaid("other", null, "default_unknown", "cash", "savings-accounts"),
  // The money-market name rule is provider-agnostic and outranks the
  // Plaid fallbacks
  plaid("depository", null, "snaptrade_money_market_name", "cash", "money-market", "Government Money Fund"),

  // SnapTrade
  snaptrade("cash", "EUR", "snaptrade_cash", "cash", "broker-cash"),
  snaptrade("CASH", "USD", "snaptrade_cash", "cash", "broker-cash"),
  snaptrade("cash", "CASH", "snaptrade_margin_loan", "liabilities", "margin-loans", { quantity: -500 }),
  snaptrade("cash", "EUR", "snaptrade_margin_loan", "liabilities", "margin-loans", { marketValue: -1 }),
  snaptrade("mutual_fund", "SPAXX", "snaptrade_money_market_symbol", "cash", "money-market"),
  snaptrade("mutual_fund", "XYZXX", "snaptrade_money_market_name", "cash", "money-market", { name: "Treasury Liquidity Fund" }),
  snaptrade("forex", "EURUSD", "snaptrade_forex", "cash", "forex"),
  snaptrade("equity", "AAPL", "snaptrade_stock", "equities", "stocks"),
  snaptrade("etf", "VWCE", "snaptrade_etf", "equities", "etfs"),
  snaptrade("mutual_fund", "VTSAX", "snaptrade_mutual_fund", "equities", "funds"),
  snaptrade("option", "AAPL240119C00150000", "snaptrade_option", "equities", "options"),
  snaptrade("bond", "DE0001102580", "snaptrade_bond", "bonds", "corporate"),
  snaptrade("fixed_income", "US912828", "snaptrade_bond", "bonds", "corporate"),
  snaptrade("precious_metal", "XAU", "snaptrade_precious_metal", "commodities", "metals"),
  snaptrade("cryptocurrency", "SOL", "snaptrade_crypto", "crypto", "altcoins"),
  snaptrade("cryptocurrency", "BTC", "symbol_bitcoin", "crypto", "bitcoin"),
  snaptrade("cryptocurrency", "wbtc", "symbol_bitcoin", "crypto", "bitcoin"),
  snaptrade("cryptocurrency", "ETH", "symbol_ethereum", "crypto", "ethereum"),
  snaptrade("cryptocurrency", "USDC", "symbol_stablecoin", "crypto", "stablecoins"),
  // A crypto symbol on a non-crypto asset (a stock ticker) is not crypto
  snaptrade("equity", "BTC", "snaptrade_stock", "equities", "stocks"),
  snaptrade("warrant", "XYZ.WS", "fallback_unknown", "equities", "stocks"),

  // Bitpanda
  bitpanda("fiat", "EUR", "bitpanda_fiat_base", "cash", "savings-accounts"),
  bitpanda("fiatwallet", "eur", "bitpanda_fiat_base", "cash", "savings-accounts"),
  bitpanda("fiat", "USD", "bitpanda_fiat_forex", "cash", "forex"),
  bitpanda("metal", "XAU", "bitpanda_metal", "commodities", "metals"),
  bitpanda("commodity", "OIL", "bitpanda_commodity", "commodities", "energy"),
  bitpanda("stock", "TSLA", "bitpanda_stock", "equities", "stocks"),
  bitpanda("etf", "SPY", "bitpanda_etf", "equities", "etfs"),
  bitpanda("index", "BCI5", "bitpanda_index", "crypto", "altcoins"),
  bitpanda("crypto", "SOL", "bitpanda_crypto_fallback", "crypto", "altcoins"),
  bitpanda("crypto", "BTC", "symbol_bitcoin", "crypto", "bitcoin"),
  bitpanda("crypto", "ETH", "symbol_ethereum", "crypto", "ethereum"),
  bitpanda("crypto", "USDT", "symbol_stablecoin", "crypto", "stablecoins"),
  bitpanda("leveraged", "BTC3L", "fallback_bitpanda", "crypto", "altcoins"),
];

/** Outcomes the engine returns without a rule-table entry. */
const ENGINE_OUTCOMES = [
  "bitpanda_fiat_base",
  "bitpanda_fiat_forex",
  "fallback_unknown",
  "fallback_bitpanda",
  "default_depository",
  "default_credit",
  "default_loan",
  "default_investment",
  "default_unknown",
];

function classify(fixture: Fixture) {
  switch (fixture.provider) {
    case "plaid":
      return classifyPlaidAccount(fixture.input);
    case "snaptrade":
      return classifySnaptradePosition(fixture.input);
    case "bitpanda":
      return classifyBitpandaPosition(fixture.input);
  }
}

const label = (f: Fixture) =>
  `${f.provider} ${JSON.stringify(f.input)} -> ${f.ruleId}`;

describe("classification rule table", () => {
  it.each(CLASSIFICATION_FIXTURES.map((f) => [label(f), f] as const))(
    "%s",
    (_, fixture) => {
      const result = classify(fixture);
      expect({
        ruleId: result.ruleId,
        category: result.category,
        subcategory: result.subcategory,
      }).toEqual({
        ruleId: fixture.ruleId,
        category: fixture.category,
        subcategory: fixture.subcategory,
      });
    },
  );

  it("files a fixture where its rule says", () => {
    for (const fixture of CLASSIFICATION_FIXTURES) {
      const rule = getRuleById(fixture.ruleId);
      if (!rule) continue;
      expect(rule.result, label(fixture)).toEqual({
        category: fixture.category,
        subcategory: fixture.subcategory,
      });
    }
  });

  it("has a fixture for every rule and engine outcome", () => {
    const covered = new Set(CLASSIFICATION_FIXTURES.map((f) => f.ruleId));
    const outcomes = [...CLASSIFICATION_RULES.map((r) => r.id), ...ENGINE_OUTCOMES];
    expect(outcomes.filter((id) => !covered.has(id))).toEqual([]);
  });

  it("has unique rule ids", () => {
    const ids = CLASSIFICATION_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
