import { describe, it, expect } from "vitest";

import {
  normalizeAssetType,
  readSnaptradeSymbolFields,
} from "./snaptradePosition";

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
