import { describe, it, expect } from "vitest";

import {
  mapSnaptradeHoldings,
  normalizeAssetType,
  positionOverrideKeys,
  positionProfitLoss,
  readSnaptradeSymbolFields,
  snaptradeAccountFields,
  snaptradeHoldingsCurrency,
  type SnaptradeHoldingsLike,
} from "./snaptradePosition";
import { fxRatesFromDaily } from "../finance/currency";
import { classifySnaptradePosition } from "../../frontend/convex/lib/classification/engine";
import { parseClassificationOverride } from "../../frontend/lib/types/classification";

describe("normalizeAssetType", () => {
  it.each([
    ["cs", "equity"],
    ["ad", "equity"],
    ["ps", "equity"],
    ["et", "etf"],
    ["oef", "mutual_fund"],
    ["cef", "mutual_fund"],
    ["bnd", "bond"],
    ["pm", "precious_metal"],
    ["crypto", "cryptocurrency"],
    ["rt", "other"],
    ["wt", "other"],
    ["ut", "other"],
    ["struct", "other"],
  ])("maps SnapTrade code %s to %s", (code, expected) => {
    expect(normalizeAssetType(code)).toBe(expected);
  });

  it("is case-insensitive and keeps the long names", () => {
    expect(normalizeAssetType("CS")).toBe("equity");
    expect(normalizeAssetType("ETF")).toBe("etf");
    expect(normalizeAssetType("mutual_fund")).toBe("mutual_fund");
    expect(normalizeAssetType("Option")).toBe("option");
  });

  it("returns other for unknown or missing codes", () => {
    expect(normalizeAssetType("zzz")).toBe("other");
    expect(normalizeAssetType(undefined)).toBe("other");
    expect(normalizeAssetType(null)).toBe("other");
    expect(normalizeAssetType("")).toBe("other");
  });
});

describe("readSnaptradeSymbolFields", () => {
  // Shape per snaptrade-typescript-sdk Position / PositionSymbol / UniversalSymbol
  const sap = {
    symbol: {
      id: "legacy-position-symbol-id",
      description: "deprecated description",
      symbol: {
        id: "universal-id",
        symbol: "SAP.DE",
        raw_symbol: "SAP",
        description: "SAP SE",
        currency: { id: "c1", code: "EUR", name: "Euro" },
        type: { id: "t1", code: "cs", description: "Common Stock" },
        figi_code: "BBG000BG7DY8",
      },
    },
    units: 10,
    price: 200,
  };

  it("reads ticker, type, currency and FIGI from the UniversalSymbol", () => {
    expect(readSnaptradeSymbolFields(sap, "EUR")).toEqual({
      symbol: "SAP.DE",
      symbolId: "universal-id",
      name: "SAP SE",
      assetType: "equity",
      currency: "EUR",
      isin: undefined,
      cusip: undefined,
      figi: "BBG000BG7DY8",
    });
  });

  it("prefers the position's quote currency over the listing currency", () => {
    const r = readSnaptradeSymbolFields(
      { ...sap, currency: { code: "USD" } },
      "EUR",
    );
    expect(r?.currency).toBe("USD");
  });

  it("never stringifies the symbol object", () => {
    const r = readSnaptradeSymbolFields(sap, "EUR");
    expect(r?.symbol).not.toContain("[object");
  });

  it("returns null without a ticker", () => {
    expect(readSnaptradeSymbolFields({}, "EUR")).toBeNull();
    expect(readSnaptradeSymbolFields({ symbol: { id: "x" } }, "EUR")).toBeNull();
    expect(
      readSnaptradeSymbolFields({ symbol: { symbol: { symbol: "" } } }, "EUR"),
    ).toBeNull();
  });

  it("falls back to the account currency and type other when the payload omits them", () => {
    const r = readSnaptradeSymbolFields(
      { symbol: { symbol: { symbol: "X" } } },
      "CHF",
    );
    expect(r?.currency).toBe("CHF");
    expect(r?.assetType).toBe("other");
  });
});

// ═══════════════════════════════════════════════════════════════
// Holdings response
// ═══════════════════════════════════════════════════════════════

// 1 EUR = 1.25 USD, so 1 USD = 0.8 EUR
const rates = fxRatesFromDaily([
  { date: "2026-11-10", currency: "USD", unitsPerEur: 1.25 },
]);

const stock = (ticker: string, units: number, price: number, extra = {}) => ({
  symbol: {
    symbol: {
      symbol: ticker,
      currency: { code: "USD" },
      type: { code: "cs" },
    },
  },
  units,
  price,
  ...extra,
});

describe("mapSnaptradeHoldings", () => {
  it("maps stock positions with value and cost", () => {
    const mapped = mapSnaptradeHoldings(
      { positions: [stock("AAPL", 10, 200, { average_purchase_price: 150 })] },
      "USD",
    );
    expect(mapped.positions).toEqual([
      expect.objectContaining({
        symbol: "AAPL",
        quantity: 10,
        currentPrice: 200,
        marketValue: 2_000,
        averageCostBasis: 150,
        totalCostBasis: 1_500,
      }),
    ]);
  });

  it("values option positions as contracts times price times multiplier", () => {
    const holdings: SnaptradeHoldingsLike = {
      option_positions: [
        {
          symbol: {
            option_symbol: {
              id: "opt-1",
              ticker: "AAPL  261218C00200000",
              option_type: "CALL",
              strike_price: 200,
              expiration_date: "2026-12-18",
              underlying_symbol: { symbol: "AAPL", currency: { code: "USD" } },
            },
          },
          units: 2,
          price: 5.5,
          average_purchase_price: 400,
        },
        {
          symbol: {
            option_symbol: {
              ticker: "MINI",
              is_mini_option: true,
              underlying_symbol: { symbol: "SPY" },
            },
          },
          units: -1,
          price: 3,
        },
      ],
    };
    const [standard, mini] = mapSnaptradeHoldings(holdings, "USD").positions;
    expect(standard).toEqual(
      expect.objectContaining({
        symbol: "AAPL  261218C00200000",
        assetType: "option",
        currency: "USD",
        quantity: 2,
        currentPrice: 550,
        marketValue: 1_100,
        averageCostBasis: 400,
        totalCostBasis: 800,
        name: "AAPL 2026-12-18 200 CALL",
      }),
    );
    // Short mini option: 10 shares per contract, negative value
    expect(mini.marketValue).toBe(-30);
    expect(mini.totalCostBasis).toBeUndefined();
  });

  it("tells absent cash apart from a reported zero", () => {
    expect(mapSnaptradeHoldings({}, "USD").cashBalances).toBeUndefined();
    expect(
      mapSnaptradeHoldings({ balances: [{ cash: null }] }, "USD").cashBalances,
    ).toBeUndefined();
    expect(mapSnaptradeHoldings({ balances: [] }, "USD").cashBalances).toEqual(
      [],
    );
    expect(
      mapSnaptradeHoldings(
        { balances: [{ cash: 0, currency: { code: "USD" } }] },
        "USD",
      ).cashBalances,
    ).toEqual([{ amount: 0, currency: "USD" }]);
  });

  it("prefers the account's balance total over the deprecated total_value", () => {
    const mapped = mapSnaptradeHoldings(
      {
        account: { balance: { total: { amount: 5_000, currency: "USD" } } },
        total_value: { value: 4_000, currency: "USD" },
      },
      "USD",
    );
    expect(mapped.total).toEqual({ amount: 5_000, currency: "USD" });
    expect(
      mapSnaptradeHoldings({ total_value: { value: 4_000 } }, "USD").total,
    ).toEqual({ amount: 4_000, currency: undefined });
  });
});

describe("snaptradeAccountFields", () => {
  it("writes negative cash as a margin-loan liability", () => {
    const fields = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          positions: [stock("AAPL", 250, 200)],
          balances: [{ cash: -15_000, currency: { code: "USD" } }],
          account: { balance: { total: { amount: 35_000, currency: "USD" } } },
        },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(fields).toEqual({
      balance: 35_000,
      balanceCurrency: "USD",
      balanceIsMixed: false,
      cash: -15_000,
      cashSource: "reported",
      cashInvestmentCategory: "liabilities",
      cashInvestmentSubcategory: "margin-loans",
    });
  });

  it("writes a zero cash balance as zero, and leaves absent cash unset", () => {
    const zero = snaptradeAccountFields(
      mapSnaptradeHoldings({ balances: [] }, "USD"),
      "USD",
      rates,
    );
    expect(zero.cash).toBe(0);
    expect(zero.cashInvestmentCategory).toBe("cash");

    const absent = snaptradeAccountFields(
      mapSnaptradeHoldings({}, "USD"),
      "USD",
      rates,
    );
    expect(absent.cash).toBeUndefined();
    expect(absent.cashInvestmentCategory).toBeUndefined();
  });

  it("converts cash in other currencies into the balance currency", () => {
    const fields = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          balances: [
            { cash: 100, currency: { code: "USD" } },
            { cash: 100, currency: { code: "EUR" } },
          ],
        },
        "USD",
      ),
      "USD",
      rates,
    );
    // 100 EUR = 125 USD
    expect(fields.cash).toBeCloseTo(225, 9);
  });

  it("takes cash-equivalent positions out of cash once", () => {
    const fields = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          positions: [stock("SPAXX", 1_000, 1, { cash_equivalent: true })],
          balances: [{ cash: 1_500, currency: { code: "USD" } }],
        },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(fields.cash).toBe(500);
    // Without a broker total: positions plus cash
    expect(fields.balance).toBe(1_500);
  });

  it("never turns a cash equivalent into margin debt", () => {
    const sweep = [stock("SPAXX", 1_000, 1, { cash_equivalent: true })];
    const zeroCash = snaptradeAccountFields(
      mapSnaptradeHoldings(
        { positions: sweep, balances: [{ cash: 0, currency: { code: "USD" } }] },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(zeroCash.cash).toBe(0);
    expect(zeroCash.cashInvestmentCategory).toBe("cash");
    expect(zeroCash.cashInvestmentSubcategory).toBe("broker-cash");
    expect(zeroCash.balance).toBe(1_000);

    const smallCash = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          positions: sweep,
          balances: [{ cash: 300, currency: { code: "USD" } }],
        },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(smallCash.cash).toBe(0);
    expect(smallCash.cashInvestmentCategory).toBe("cash");
    expect(smallCash.balance).toBe(1_000);
  });

  it("keeps a negative reported cash as margin debt despite equivalents", () => {
    const fields = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          positions: [stock("SPAXX", 1_000, 1, { cash_equivalent: true })],
          balances: [{ cash: -200, currency: { code: "USD" } }],
        },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(fields.cash).toBe(-200);
    expect(fields.cashInvestmentCategory).toBe("liabilities");
  });

  it("derives cash as total minus positions when no cash is reported", () => {
    const cashOnly = snaptradeAccountFields(
      mapSnaptradeHoldings(
        { account: { balance: { total: { amount: 5_000, currency: "USD" } } } },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(cashOnly).toEqual({
      balance: 5_000,
      balanceCurrency: "USD",
      balanceIsMixed: false,
      cash: 5_000,
      cashSource: "residual",
      cashInvestmentCategory: "cash",
      cashInvestmentSubcategory: "broker-cash",
    });

    const withPositions = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          positions: [stock("AAPL", 10, 200)],
          account: { balance: { total: { amount: 2_500, currency: "USD" } } },
        },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(withPositions.cash).toBe(500);

    // Positions worth more than the total: no fake debt
    const over = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          positions: [stock("AAPL", 10, 200)],
          account: { balance: { total: { amount: 1_500, currency: "USD" } } },
        },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(over.cash).toBe(0);
    expect(over.cashInvestmentCategory).toBe("cash");
  });

  it("keeps stored cash in its own currency and counts it in the balance", () => {
    const fields = snaptradeAccountFields(
      mapSnaptradeHoldings({ positions: [stock("AAPL", 10, 200)] }, "USD"),
      "USD",
      rates,
      { cash: 400, currency: "EUR" },
    );
    expect(fields.balanceCurrency).toBe("EUR");
    expect(fields.cash).toBe(400);
    expect(fields.cashSource).toBeUndefined();
    // 2000 USD = 1600 EUR, plus the kept 400 EUR
    expect(fields.balance).toBeCloseTo(2_000, 9);
  });

  it("flags a summed balance that has an unconvertible part", () => {
    const fields = snaptradeAccountFields(
      mapSnaptradeHoldings(
        {
          positions: [
            {
              symbol: { symbol: { symbol: "X", currency: { code: "ZZZ" } } },
              units: 1,
              price: 10,
            },
          ],
        },
        "USD",
      ),
      "USD",
      rates,
    );
    expect(fields.balanceIsMixed).toBe(true);
  });
});

describe("snaptradeHoldingsCurrency", () => {
  it("reads the total, then cash, then a position, else nothing", () => {
    expect(
      snaptradeHoldingsCurrency({
        account: { balance: { total: { amount: 1, currency: "CAD" } } },
        balances: [{ cash: 1, currency: { code: "EUR" } }],
      }),
    ).toBe("CAD");
    expect(
      snaptradeHoldingsCurrency({
        balances: [{ cash: 1, currency: { code: "EUR" } }],
      }),
    ).toBe("EUR");
    expect(
      snaptradeHoldingsCurrency({
        positions: [{ symbol: { symbol: { symbol: "X", currency: { code: "GBP" } } } }],
      }),
    ).toBe("GBP");
    expect(snaptradeHoldingsCurrency({})).toBeUndefined();
  });
});

describe("positionProfitLoss", () => {
  it("derives P/L from value and cost, and none without cost", () => {
    expect(
      positionProfitLoss({ marketValue: 2_000, totalCostBasis: 1_500 }),
    ).toEqual({ unrealizedPL: 500, unrealizedPLPercent: (500 / 1_500) * 100 });
    expect(positionProfitLoss({ marketValue: 2_000 })).toEqual({});
  });
});

describe("positionOverrideKeys", () => {
  it("keys by ISIN first, then ticker", () => {
    expect(positionOverrideKeys({ symbol: "sap.de", isin: "de0007164600" }))
      .toEqual(["isin:DE0007164600", "symbol:SAP.DE"]);
    expect(positionOverrideKeys({ symbol: "AAPL" })).toEqual(["symbol:AAPL"]);
  });
});

describe("SnapTrade classification by symbol", () => {
  const classify = (symbol: string, assetType: string) =>
    classifySnaptradePosition({
      assetType,
      symbol,
      name: null,
      quantity: 1,
      marketValue: 100,
    });

  it("does not turn an ETF with a crypto-like ticker into a coin", () => {
    expect(classify("BTC", "etf")).toMatchObject({
      category: "equities",
      subcategory: "etfs",
    });
    expect(classify("DAI", "equity")).toMatchObject({
      category: "equities",
      subcategory: "stocks",
    });
  });

  it("refines crypto holdings by ticker", () => {
    expect(classify("BTC", "cryptocurrency")).toMatchObject({
      category: "crypto",
      subcategory: "bitcoin",
    });
    expect(classify("USDC", "cryptocurrency")).toMatchObject({
      category: "crypto",
      subcategory: "stablecoins",
    });
  });

  it("keeps money-market funds in cash, by symbol and by name", () => {
    expect(classify("SPAXX", "mutual_fund")).toMatchObject({
      category: "cash",
      subcategory: "money-market",
    });
    expect(
      classifySnaptradePosition({
        assetType: "mutual_fund",
        symbol: "XYZXX",
        name: "Acme Government Money Fund",
        quantity: 1,
        marketValue: 1,
      }),
    ).toMatchObject({ category: "cash", subcategory: "money-market" });
  });
});

describe("parseClassificationOverride", () => {
  it("accepts a subcategory of its category", () => {
    expect(parseClassificationOverride("commodities", "metals")).toEqual({
      category: "commodities",
      subcategory: "metals",
    });
    // "funds" exists under equities and bonds alike
    expect(parseClassificationOverride("bonds", "funds").category).toBe(
      "bonds",
    );
  });

  it("rejects unknown values and mismatched pairs", () => {
    expect(() => parseClassificationOverride("stocks", "etfs")).toThrow();
    expect(() => parseClassificationOverride("equities", "metals")).toThrow();
    expect(() => parseClassificationOverride("equities", "etf")).toThrow();
    expect(() =>
      parseClassificationOverride("constructor", "x"),
    ).toThrow();
  });

  it("limits the categories when asked", () => {
    expect(() =>
      parseClassificationOverride("equities", "stocks", ["cash", "liabilities"]),
    ).toThrow();
    expect(
      parseClassificationOverride("liabilities", "loans", [
        "cash",
        "liabilities",
      ]).category,
    ).toBe("liabilities");
  });
});
