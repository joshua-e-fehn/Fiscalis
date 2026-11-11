import { describe, it, expect } from "vitest";

import {
  FALLBACK_FX_RATES,
  bankAccountBaseFields,
  brokerAccountBaseFields,
  fxRatesFromDaily,
  normalizeCurrency,
  parseFxDailyRates,
  positionBaseFields,
  toBase,
  withMarketRate,
} from "./currency";

// EUR/USD 1.17 → 1 USD = 0.8547 EUR; EUR/CHF 0.94 → 1 CHF = 1.0638 EUR
const rates = fxRatesFromDaily([
  { date: "2026-11-09", currency: "USD", unitsPerEur: 1.16 },
  { date: "2026-11-10", currency: "USD", unitsPerEur: 1.17 },
  { date: "2026-11-10", currency: "CHF", unitsPerEur: 0.94 },
]);

describe("normalizeCurrency", () => {
  it("maps minor-unit quotes to their major currency", () => {
    expect(normalizeCurrency("GBX")).toEqual({ code: "GBP", divisor: 100 });
    expect(normalizeCurrency("GBp")).toEqual({ code: "GBP", divisor: 100 });
    expect(normalizeCurrency("ZAc")).toEqual({ code: "ZAR", divisor: 100 });
    expect(normalizeCurrency("ILA")).toEqual({ code: "ILS", divisor: 100 });
  });

  it("keeps GBP as pounds and upper-cases ISO codes", () => {
    expect(normalizeCurrency("GBP")).toEqual({ code: "GBP", divisor: 1 });
    expect(normalizeCurrency(" usd ")).toEqual({ code: "USD", divisor: 1 });
  });

  it("rejects missing, malformed and no-currency codes", () => {
    expect(normalizeCurrency(undefined)).toBeNull();
    expect(normalizeCurrency("")).toBeNull();
    expect(normalizeCurrency("XXX")).toBeNull();
    expect(normalizeCurrency("US$")).toBeNull();
    expect(normalizeCurrency("USDT")).toBeNull();
  });
});

describe("fxRatesFromDaily", () => {
  it("uses the latest row per currency as a market rate", () => {
    expect(rates.USD).toEqual({
      eurPerUnit: 1 / 1.17,
      date: "2026-11-10",
      source: "market",
    });
    expect(rates.CHF.source).toBe("market");
  });

  it("keeps the fallback table for currencies the rows do not cover", () => {
    expect(rates.GBP).toEqual({ eurPerUnit: 1.19, source: "fallback" });
    expect(fxRatesFromDaily([])).toEqual(FALLBACK_FX_RATES);
  });

  it("ignores rows with a non-positive rate", () => {
    const r = fxRatesFromDaily([
      { date: "2026-11-11", currency: "USD", unitsPerEur: 0 },
    ]);
    expect(r.USD.source).toBe("fallback");
  });
});

describe("toBase", () => {
  it("converts with the market rate and reports its date", () => {
    const c = toBase(1_000, "USD", rates);
    expect(c).toMatchObject({
      ok: true,
      rateDate: "2026-11-10",
      source: "market",
    });
    expect(c.ok && c.value).toBeCloseTo(854.70, 2);
  });

  it("is the identity for EUR", () => {
    expect(toBase(5, "eur", rates)).toEqual({
      ok: true,
      value: 5,
      rate: 1,
      source: "identity",
    });
  });

  it("divides minor units by 100 (1,000 GBX = £10)", () => {
    const c = toBase(1_000, "GBX", rates);
    expect(c.ok && c.value).toBeCloseTo(11.9, 10);
    expect(c).toMatchObject({ source: "fallback" });
    expect(toBase(250, "GBp", { GBP: { eurPerUnit: 1.2, source: "market" } }))
      .toMatchObject({ ok: true, value: 3 });
  });

  it("flags a currency with no rate instead of converting at 1.0", () => {
    expect(toBase(100, "VND", rates)).toEqual({
      ok: false,
      reason: "unknown_currency",
    });
  });

  it("flags a missing currency", () => {
    expect(toBase(100, undefined, rates)).toEqual({
      ok: false,
      reason: "missing_currency",
    });
    expect(toBase(100, "XXX", rates)).toEqual({
      ok: false,
      reason: "missing_currency",
    });
  });

  it("prefers a market rate added with withMarketRate", () => {
    const live = withMarketRate(FALLBACK_FX_RATES, "usd", 0.9, "2026-11-11");
    expect(toBase(100, "USD", live)).toMatchObject({
      ok: true,
      value: 90,
      source: "market",
      rateDate: "2026-11-11",
    });
    expect(withMarketRate(live, "EUR", 2)).toBe(live);
  });
});

describe("parseFxDailyRates", () => {
  it("keeps well-formed rows and accepts numeric strings", () => {
    expect(
      parseFxDailyRates({
        base: "EUR",
        rates: [
          { date: "2026-11-10", currency: "USD", unitsPerEur: "1.1700" },
          { date: "2026-11-10", currency: "CHF", unitsPerEur: 0.94 },
          { date: "2026-11-10", currency: "EUR", unitsPerEur: 1 },
          { date: "10/11/2026", currency: "USD", unitsPerEur: 1.1 },
          { date: "2026-11-10", currency: "usd", unitsPerEur: 1.1 },
          { date: "2026-11-10", currency: "USD", unitsPerEur: -1 },
          null,
        ],
      }),
    ).toEqual([
      { date: "2026-11-10", currency: "USD", unitsPerEur: 1.17 },
      { date: "2026-11-10", currency: "CHF", unitsPerEur: 0.94 },
    ]);
  });

  it("returns nothing for an unexpected payload", () => {
    expect(parseFxDailyRates(null)).toEqual([]);
    expect(parseFxDailyRates({ error: "x" })).toEqual([]);
    expect(parseFxDailyRates([{ date: "2026-11-10" }])).toEqual([]);
  });
});

describe("positionBaseFields", () => {
  it("converts value and cost with one rate and derives P/L in EUR", () => {
    // $11,000 position bought for $10,000 at 1.17 USD/EUR
    const f = positionBaseFields(
      { marketValue: 11_000, totalCostBasis: 10_000, currency: "USD" },
      rates,
    );
    expect(f.valueInBaseCurrency).toBeCloseTo(11_000 / 1.17, 9);
    expect(f.costBasisInBaseCurrency).toBeCloseTo(10_000 / 1.17, 9);
    expect(f.unrealizedPLInBaseCurrency).toBeCloseTo(1_000 / 1.17, 9);
    expect(f).toMatchObject({
      exchangeRateDate: "2026-11-10",
      exchangeRateSource: "market",
      baseCurrency: "EUR",
    });
  });

  it("leaves the cost and P/L undefined without a cost basis", () => {
    const f = positionBaseFields({ marketValue: 50, currency: "EUR" }, rates);
    expect(f).toMatchObject({
      valueInBaseCurrency: 50,
      costBasisInBaseCurrency: undefined,
      unrealizedPLInBaseCurrency: undefined,
      exchangeRateUsed: 1,
      exchangeRateSource: "identity",
    });
  });

  it("clears every value for an unknown currency", () => {
    const f = positionBaseFields(
      { marketValue: 1_000, totalCostBasis: 900, currency: "VND" },
      rates,
    );
    expect(f).toEqual({
      valueInBaseCurrency: undefined,
      costBasisInBaseCurrency: undefined,
      unrealizedPLInBaseCurrency: undefined,
      exchangeRateUsed: undefined,
      exchangeRateSource: "unknown",
      baseCurrency: "EUR",
    });
  });

  it("values a GBX-quoted position in pounds", () => {
    const f = positionBaseFields(
      { marketValue: 1_000, currency: "GBX" },
      rates,
    );
    expect(f.valueInBaseCurrency).toBeCloseTo(11.9, 10);
  });
});

describe("account base fields", () => {
  it("converts a bank balance", () => {
    const f = bankAccountBaseFields(
      { currentBalance: 940, currency: "CHF" },
      rates,
    );
    expect(f.valueInBaseCurrency).toBeCloseTo(1_000, 9);
    expect(f.exchangeRateSource).toBe("market");
  });

  it("flags a bank account without a currency", () => {
    const f = bankAccountBaseFields(
      { currentBalance: 100, currency: "XXX" },
      rates,
    );
    expect(f.valueInBaseCurrency).toBeUndefined();
    expect(f.exchangeRateSource).toBe("unknown");
  });

  it("converts broker balance and cash with the account's rate", () => {
    const f = brokerAccountBaseFields(
      { balance: 11_700, cash: 1_170, currency: "USD" },
      rates,
    );
    expect(f.balanceInBaseCurrency).toBeCloseTo(10_000, 9);
    expect(f.cashValueInBaseCurrency).toBeCloseTo(1_000, 9);
    expect(f.cashExchangeRateUsed).toBeCloseTo(1 / 1.17, 12);
    expect(f.exchangeRateSource).toBe("market");
  });
});
