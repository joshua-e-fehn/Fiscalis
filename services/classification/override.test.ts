/**
 * Manual category overrides (ENG-195): which categories an item may move
 * to, the dialog's subcategory choice, and the stored fields of setting and
 * resetting an override (frontend/convex/lib/classificationOverride.ts).
 */
import { describe, expect, it } from "vitest";
import type { Doc } from "../../frontend/convex/_generated/dataModel";
import {
  INVESTMENT_CATEGORIES,
  overrideCategoriesFor,
  subcategoryForCategory,
} from "../../frontend/lib/types/classification";
import {
  automaticFields,
  bitpandaOverridePatch,
  overrideFields,
} from "../../frontend/convex/lib/classificationOverride";
import { classifyBitpandaPosition } from "./engine";

const holding = (fields: Partial<Doc<"bitpandaHoldings">>) =>
  ({
    assetType: "crypto",
    symbol: "BTC",
    name: "Bitcoin",
    ...fields,
  }) as Doc<"bitpandaHoldings">;

describe("overrideCategoriesFor", () => {
  it("limits a bank account to cash and liabilities", () => {
    expect(overrideCategoriesFor("plaid")).toEqual(["cash", "liabilities"]);
  });

  it("offers every category for broker and Bitpanda holdings", () => {
    expect(overrideCategoriesFor("broker")).toEqual(INVESTMENT_CATEGORIES);
    expect(overrideCategoriesFor("bitpanda")).toEqual(INVESTMENT_CATEGORIES);
    expect(INVESTMENT_CATEGORIES).toContain("collectibles");
  });
});

describe("subcategoryForCategory", () => {
  it("keeps a subcategory that belongs to the category", () => {
    // "funds" exists under equities and bonds alike
    expect(subcategoryForCategory("bonds", "funds")).toBe("funds");
  });

  it("falls back to the category's first subcategory", () => {
    expect(subcategoryForCategory("bonds", "etfs")).toBe("government");
    expect(subcategoryForCategory("cash", undefined)).toBe("savings-accounts");
  });
});

describe("overrideFields", () => {
  it("stores the override as the effective category", () => {
    expect(overrideFields("broker", "bonds", "funds")).toEqual({
      userCategoryOverride: "bonds",
      userSubcategoryOverride: "funds",
      investmentCategory: "bonds",
      investmentSubcategory: "funds",
      classificationSource: "user_override",
    });
  });

  it("rejects a category the item cannot move to", () => {
    expect(() => overrideFields("plaid", "equities", "stocks")).toThrow();
    expect(() => overrideFields("broker", "equities", "metals")).toThrow();
  });
});

describe("automaticFields", () => {
  it("clears the override and restores the rule engine's result", () => {
    const auto = classifyBitpandaPosition({
      assetType: "crypto",
      symbol: "BTC",
      name: null,
    });
    expect(automaticFields(auto)).toEqual({
      userCategoryOverride: undefined,
      userSubcategoryOverride: undefined,
      investmentCategory: auto.category,
      investmentSubcategory: auto.subcategory,
      classificationSource: "auto",
      classificationRule: auto.ruleId,
    });
  });
});

describe("bitpandaOverridePatch", () => {
  it("re-classifies the holding when the override is cleared", () => {
    const patch = bitpandaOverridePatch(
      holding({
        investmentCategory: "commodities",
        investmentSubcategory: "metals",
        userCategoryOverride: "commodities",
        userSubcategoryOverride: "metals",
      }),
      undefined,
      undefined,
    );
    expect(patch.userCategoryOverride).toBeUndefined();
    expect(patch.investmentCategory).toBe("crypto");
    expect(patch.classificationSource).toBe("auto");
  });

  it("fills a missing side from the holding's current classification", () => {
    const patch = bitpandaOverridePatch(
      holding({ investmentCategory: "crypto", investmentSubcategory: "bitcoin" }),
      undefined,
      "stablecoins",
    );
    expect(patch).toMatchObject({
      investmentCategory: "crypto",
      investmentSubcategory: "stablecoins",
      classificationSource: "user_override",
    });
  });
});
