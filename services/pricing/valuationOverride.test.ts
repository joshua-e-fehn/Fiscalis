import { describe, expect, it } from "vitest";
import { priceFeedFor, resolveValuationConfig } from "../performance/config";
import {
  canOverrideValuation,
  normalizeValuationOverride,
  overridePricePerUnit,
  overriddenValue,
  validateValuationOverride,
  valuationOverrideConfig,
  type ValuationOverride,
} from "./valuationOverride";

const NOW = Date.UTC(2026, 10, 15, 12);

describe("per-asset valuation overrides", () => {
  const manual: ValuationOverride = {
    kind: "manualPrice",
    pricePerUnit: 12.5,
    currency: "usd",
    asOf: "2026-11-01",
  };
  const model: ValuationOverride = {
    kind: "markToModel",
    pricePerUnit: 100,
    currency: "EUR",
    asOf: "2025-11-15",
    annualRatePercent: 5,
  };

  it("validates the input", () => {
    expect(validateValuationOverride(manual, NOW)).toBeNull();
    expect(validateValuationOverride(model, NOW)).toBeNull();
    expect(validateValuationOverride({ ...manual, pricePerUnit: -1 }, NOW)).toBe(
      "valuationPriceInvalid",
    );
    expect(validateValuationOverride({ ...manual, pricePerUnit: NaN }, NOW)).toBe(
      "valuationPriceInvalid",
    );
    expect(validateValuationOverride({ ...manual, currency: "XYZ" }, NOW)).toBe(
      "valuationCurrencyInvalid",
    );
    expect(validateValuationOverride({ ...manual, asOf: "2026-02-30" }, NOW)).toBe(
      "valuationInvalidDate",
    );
    expect(validateValuationOverride({ ...manual, asOf: "2026-12-01" }, NOW)).toBe(
      "valuationDateInFuture",
    );
    expect(
      validateValuationOverride({ ...model, annualRatePercent: undefined }, NOW),
    ).toBe("valuationRateInvalid");
    expect(validateValuationOverride({ ...model, annualRatePercent: 150 }, NOW)).toBe(
      "valuationRateInvalid",
    );
  });

  it("stores the currency upper-cased and the rate only for a model", () => {
    expect(normalizeValuationOverride({ ...manual, annualRatePercent: 3 })).toEqual({
      kind: "manualPrice",
      pricePerUnit: 12.5,
      currency: "USD",
      asOf: "2026-11-01",
    });
    expect(normalizeValuationOverride(model).annualRatePercent).toBe(5);
  });

  it("prices a manual price as entered and a model grown since its date", () => {
    expect(overridePricePerUnit(manual, NOW)).toBe(12.5);
    // 365 days at 5 % a year (365.25-day years)
    expect(overridePricePerUnit(model, NOW)).toBeCloseTo(100 * 1.05 ** (365 / 365.25), 8);
    // Never before the anchor
    expect(overridePricePerUnit({ ...model, asOf: "2026-11-16" }, NOW)).toBe(100);
    expect(overridePricePerUnit({ ...model, annualRatePercent: -100 }, NOW)).toBe(0);
  });

  it("values the synced quantity at the override, converted to EUR", () => {
    const toBase = (amount: number, currency: string) =>
      currency === "USD" ? amount / 2 : currency === "EUR" ? amount : null;
    expect(overriddenValue(4, normalizeValuationOverride(manual), NOW, toBase)).toEqual({
      pricePerUnit: 12.5,
      currency: "USD",
      marketValue: 50,
      valueBase: 25,
    });
    expect(
      overriddenValue(1, { ...manual, currency: "SEK" }, NOW, toBase).valueBase,
    ).toBeNull();
  });

  it("is offered for priced assets, not cash or liabilities", () => {
    expect(canOverrideValuation("equities")).toBe(true);
    expect(canOverrideValuation("crypto")).toBe(true);
    expect(canOverrideValuation("cash")).toBe(false);
    expect(canOverrideValuation("liabilities")).toBe(false);
  });

  it("lets a per-asset override take a holding off its feed", () => {
    const tier3 = valuationOverrideConfig(manual);
    expect(tier3).toEqual({ method: "discrete", priceProvider: "manual" });
    expect(resolveValuationConfig("equities", "stocks", tier3).method).toBe("discrete");
    expect(priceFeedFor("brokerPosition", "equities", "stocks", tier3)).toBeUndefined();
    expect(valuationOverrideConfig(undefined)).toBeUndefined();
  });
});
