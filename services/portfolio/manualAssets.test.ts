import { describe, it, expect } from "vitest";

import {
  attributesFor,
  cleanAttributes,
  isIsoDate,
  isManualAssetSubcategory,
  latestValuation,
  manualAssetCurrency,
  manualAssetGainLoss,
  manualAssetInBase,
  normalizeValuations,
  validateManualAsset,
  type ManualAssetInput,
} from "./manualAssets";

const NOW = Date.parse("2026-11-15T12:00:00Z");

/** USD at 0.9 EUR; any other currency but EUR has no rate. */
const toBase = (amount: number, currency: string) =>
  currency === "EUR" ? amount : currency === "USD" ? amount * 0.9 : null;

function input(overrides: Partial<ManualAssetInput> = {}): ManualAssetInput {
  return {
    category: "collectibles",
    subcategory: "art",
    name: "Untitled, 1962",
    currency: "EUR",
    valuations: [{ date: "2026-01-10", value: 12_000 }],
    ...overrides,
  };
}

describe("isManualAssetSubcategory", () => {
  it("takes the subcategories no provider fills", () => {
    expect(isManualAssetSubcategory("real-estate", "residential")).toBe(true);
    expect(isManualAssetSubcategory("equities", "private")).toBe(true);
    expect(isManualAssetSubcategory("collectibles", "other")).toBe(true);
  });

  it("leaves out the vault metals, provider subcategories and liabilities", () => {
    expect(isManualAssetSubcategory("commodities", "metals")).toBe(false);
    expect(isManualAssetSubcategory("equities", "stocks")).toBe(false);
    expect(isManualAssetSubcategory("real-estate", "reits")).toBe(false);
    expect(isManualAssetSubcategory("liabilities", "loans")).toBe(false);
    expect(isManualAssetSubcategory("collectibles", "coins")).toBe(false);
  });
});

describe("latestValuation", () => {
  it("is the one with the latest date, whatever the order", () => {
    expect(
      latestValuation([
        { date: "2026-03-01", value: 3 },
        { date: "2026-05-01", value: 5 },
        { date: "2026-04-01", value: 4 },
      ]),
    ).toEqual({ date: "2026-05-01", value: 5 });
  });

  it("takes the later entry on a tie and null without valuations", () => {
    expect(
      latestValuation([
        { date: "2026-05-01", value: 1 },
        { date: "2026-05-01", value: 2 },
      ])?.value,
    ).toBe(2);
    expect(latestValuation([])).toBeNull();
  });
});

describe("normalizeValuations", () => {
  it("sorts oldest first and keeps one valuation per date, the last given", () => {
    expect(
      normalizeValuations([
        { date: "2026-05-01", value: 5 },
        { date: "2026-01-01", value: 1 },
        { date: "2026-05-01", value: 6 },
      ]),
    ).toEqual([
      { date: "2026-01-01", value: 1 },
      { date: "2026-05-01", value: 6 },
    ]);
  });
});

describe("manualAssetGainLoss", () => {
  it("measures the latest valuation against the cost basis", () => {
    const r = manualAssetGainLoss({
      currency: "EUR",
      costBasis: 10_000,
      valuations: [
        { date: "2025-01-01", value: 9_000 },
        { date: "2026-01-01", value: 12_500 },
      ],
    });
    expect(r.value).toBe(12_500);
    expect(r.valuedOn).toBe("2026-01-01");
    expect(r.profitLoss).toBe(2_500);
    expect(r.profitLossPercent).toBeCloseTo(25, 10);
  });

  it("reports a loss as negative", () => {
    const r = manualAssetGainLoss({
      currency: "EUR",
      costBasis: 40_000,
      valuations: [{ date: "2026-01-01", value: 30_000 }],
    });
    expect(r.profitLoss).toBe(-10_000);
    expect(r.profitLossPercent).toBeCloseTo(-25, 10);
  });

  it("is unknown without a cost basis, not break-even", () => {
    const r = manualAssetGainLoss({
      currency: "EUR",
      valuations: [{ date: "2026-01-01", value: 500 }],
    });
    expect(r.costBasis).toBeNull();
    expect(r.profitLoss).toBeNull();
    expect(r.profitLossPercent).toBeNull();
  });
});

describe("manualAssetInBase", () => {
  it("keeps EUR amounts as they are", () => {
    expect(
      manualAssetInBase(
        { currency: "EUR", costBasis: 100, valuations: [{ date: "2026-01-01", value: 150 }] },
        toBase,
      ),
    ).toEqual({ valueBase: 150, costBase: 100 });
  });

  it("converts a foreign asset and keeps its cost in its own currency", () => {
    expect(
      manualAssetInBase(
        { currency: "USD", costBasis: 1_000, valuations: [{ date: "2026-01-01", value: 2_000 }] },
        toBase,
      ),
    ).toEqual({
      valueBase: 1_800,
      costBase: 900,
      costNative: { amount: 1_000, currency: "USD" },
    });
  });

  it("counts an amount without a rate as 0 with an unknown cost", () => {
    expect(
      manualAssetInBase(
        { currency: "JPY", costBasis: 1_000, valuations: [{ date: "2026-01-01", value: 2_000 }] },
        toBase,
      ),
    ).toEqual({ valueBase: 0, costBase: null });
  });
});

describe("attributes", () => {
  it("asks each subcategory for its own details", () => {
    expect(attributesFor("art")).toEqual(["artist", "year"]);
    expect(attributesFor("wine")).toContain("vintage");
    expect(attributesFor("nfts")).toEqual([]);
  });

  it("keeps only the subcategory's attributes, trimmed and non-blank", () => {
    expect(
      cleanAttributes("watches", {
        brand: "  Rolex ",
        referenceNumber: "",
        artist: "not a watch field",
        year: 1968,
      }),
    ).toEqual({ brand: "Rolex", year: 1968 });
    expect(cleanAttributes("nfts", { brand: "x" })).toBeUndefined();
    expect(cleanAttributes("art", undefined)).toBeUndefined();
  });
});

describe("validateManualAsset", () => {
  it("accepts a complete input", () => {
    expect(validateManualAsset(input({ costBasis: 8_000 }), NOW)).toBeNull();
  });

  it("rejects a subcategory without manual entries", () => {
    expect(
      validateManualAsset(input({ category: "commodities", subcategory: "metals" }), NOW),
    ).toBe("manualAssetSubcategoryInvalid");
  });

  it("requires a name of at most 120 characters", () => {
    expect(validateManualAsset(input({ name: "   " }), NOW)).toBe(
      "manualAssetNameRequired",
    );
    expect(validateManualAsset(input({ name: "x".repeat(121) }), NOW)).toBe(
      "manualAssetNameTooLong",
    );
  });

  it("requires an ISO currency of a major unit", () => {
    expect(validateManualAsset(input({ currency: "EURO" }), NOW)).toBe(
      "manualAssetCurrencyInvalid",
    );
    expect(validateManualAsset(input({ currency: "GBp" }), NOW)).toBe(
      "manualAssetCurrencyInvalid",
    );
    expect(validateManualAsset(input({ currency: "usd" }), NOW)).toBeNull();
  });

  it("requires at least one valid, non-future, non-negative valuation", () => {
    expect(validateManualAsset(input({ valuations: [] }), NOW)).toBe(
      "manualAssetValuationRequired",
    );
    expect(
      validateManualAsset(input({ valuations: [{ date: "2026-02-30", value: 1 }] }), NOW),
    ).toBe("manualAssetInvalidDate");
    expect(
      validateManualAsset(input({ valuations: [{ date: "2026-11-20", value: 1 }] }), NOW),
    ).toBe("manualAssetDateInFuture");
    expect(
      validateManualAsset(input({ valuations: [{ date: "2026-01-01", value: -1 }] }), NOW),
    ).toBe("manualAssetValueInvalid");
    expect(
      validateManualAsset(input({ valuations: [{ date: "2026-01-01", value: NaN }] }), NOW),
    ).toBe("manualAssetValueInvalid");
  });

  it("accepts tomorrow's date for time zones ahead of UTC", () => {
    expect(
      validateManualAsset(input({ valuations: [{ date: "2026-11-16", value: 1 }] }), NOW),
    ).toBeNull();
  });

  it("rejects a negative cost basis", () => {
    expect(validateManualAsset(input({ costBasis: -5 }), NOW)).toBe(
      "manualAssetCostInvalid",
    );
  });

  it("rejects a year that is not a whole number and over-long text", () => {
    expect(validateManualAsset(input({ attributes: { year: 1962.5 } }), NOW)).toBe(
      "manualAssetAttributeInvalid",
    );
    expect(
      validateManualAsset(input({ attributes: { artist: "a".repeat(121) } }), NOW),
    ).toBe("manualAssetAttributeInvalid");
  });
});

describe("helpers", () => {
  it("checks calendar dates", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2025-2-1")).toBe(false);
  });

  it("stores currency codes in upper case", () => {
    expect(manualAssetCurrency("chf")).toBe("CHF");
    expect(manualAssetCurrency("")).toBeNull();
  });
});
