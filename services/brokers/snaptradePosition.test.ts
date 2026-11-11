import { describe, it, expect } from "vitest";

import {
  normalizeAssetType,
  readSnaptradeSymbolFields,
} from "./snaptradePosition";
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
    expect(readSnaptradeSymbolFields(sap)).toEqual({
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
    const r = readSnaptradeSymbolFields({ ...sap, currency: { code: "USD" } });
    expect(r?.currency).toBe("USD");
  });

  it("never stringifies the symbol object", () => {
    const r = readSnaptradeSymbolFields(sap);
    expect(r?.symbol).not.toContain("[object");
  });

  it("returns null without a ticker", () => {
    expect(readSnaptradeSymbolFields({})).toBeNull();
    expect(readSnaptradeSymbolFields({ symbol: { id: "x" } })).toBeNull();
    expect(
      readSnaptradeSymbolFields({ symbol: { symbol: { symbol: "" } } }),
    ).toBeNull();
  });

  it("falls back to USD and type other when the payload omits them", () => {
    const r = readSnaptradeSymbolFields({ symbol: { symbol: { symbol: "X" } } });
    expect(r?.currency).toBe("USD");
    expect(r?.assetType).toBe("other");
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
