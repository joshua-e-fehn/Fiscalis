import { describe, expect, it } from "vitest";
import {
  continuousSourcesFor,
  getValueTypeForConfig,
  priceFeedFor,
  resolveValuationConfig,
} from "../performance/config";
import { FALLBACK_FX_RATES } from "../finance/currency";
import {
  batches,
  plausiblePriceMove,
  quotePrice,
  quotePricesById,
  repricedBitpandaFields,
  repricedPositionFields,
  sameCurrencyUnit,
  tickerPrices,
} from "./livePrices";

const NOW = Date.UTC(2026, 10, 15, 12);

describe("price feed resolution (ENG-239)", () => {
  it("finds the live feed of a holding through the whole chain", () => {
    expect(priceFeedFor("brokerPosition", "equities", "stocks")?.history).toBe(false);
    expect(priceFeedFor("brokerPosition", "equities", "etfs")).toBeDefined();
    expect(priceFeedFor("brokerPosition", "real-estate", "reits")).toBeDefined();
    expect(priceFeedFor("bitpanda", "crypto", "bitcoin")).toBeDefined();
    expect(priceFeedFor("bitpanda", "crypto", "stablecoins")).toBeDefined();
    expect(priceFeedFor("bitpanda", "commodities", "metals")).toBeDefined();
    expect(priceFeedFor("vault", "commodities", "metals")?.history).toBe(true);
  });

  it("has no feed where the providers price nothing between syncs", () => {
    expect(priceFeedFor("brokerPosition", "equities", "options")).toBeUndefined();
    expect(priceFeedFor("brokerPosition", "bonds", "government")).toBeUndefined();
    expect(priceFeedFor("brokerPosition", "crypto", "bitcoin")).toBeUndefined();
    expect(priceFeedFor("bitpanda", "commodities", "energy")).toBeUndefined();
    expect(priceFeedFor("manualAsset", "equities", "private")).toBeUndefined();
    expect(priceFeedFor("brokerPosition", "equities", undefined)).toBeUndefined();
  });

  it("keeps history (continuous) to the feeds that have one", () => {
    expect(getValueTypeForConfig(resolveValuationConfig("equities", "stocks"))).toBe(
      "discrete",
    );
    expect(getValueTypeForConfig(resolveValuationConfig("crypto", "bitcoin"))).toBe(
      "discrete",
    );
    expect(continuousSourcesFor("all")).toEqual([
      { source: "vault", category: "commodities" },
    ]);
    expect(continuousSourcesFor("crypto")).toEqual([]);
    expect(continuousSourcesFor({ source: "bitpanda" })).toEqual([]);
  });
});

describe("live provider prices", () => {
  it("reads the Bitpanda ticker's EUR prices", () => {
    expect(
      tickerPrices({
        BTC: { EUR: "82000.50", USD: "90000" },
        eth: { EUR: "2900" },
        DEAD: { EUR: "0" },
        USDONLY: { USD: "1" },
        BAD: { EUR: "n/a" },
      }),
    ).toEqual([
      { symbol: "BTC", price: 82000.5, currency: "EUR" },
      { symbol: "ETH", price: 2900, currency: "EUR" },
    ]);
  });

  it("reads a SnapTrade quote's last trade, else the midpoint", () => {
    expect(quotePrice({ last_trade_price: 101 })).toBe(101);
    expect(quotePrice({ last_trade_price: 0, bid_price: 99, ask_price: 101 })).toBe(100);
    expect(quotePrice({ bid_price: 99 })).toBeUndefined();
    const byId = quotePricesById([
      { symbol: { id: "a", symbol: "AAPL", currency: { code: "USD" } }, last_trade_price: 200 },
      { symbol: { id: "b", currency: null }, last_trade_price: 1 },
      { symbol: { id: "c", currency: { code: "EUR" } } },
    ]);
    expect([...byId.keys()]).toEqual(["a"]);
    expect(byId.get("a")).toEqual({ symbol: "AAPL", price: 200, currency: "USD" });
  });

  it("batches symbol lists", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 2)).toEqual([]);
  });

  it("applies a quote only in the position's own unit", () => {
    expect(sameCurrencyUnit("usd", "USD")).toBe(true);
    expect(sameCurrencyUnit("GBp", "GBX")).toBe(true);
    expect(sameCurrencyUnit("GBp", "GBP")).toBe(false);
    expect(sameCurrencyUnit("EUR", "USD")).toBe(false);
    expect(sameCurrencyUnit("", "USD")).toBe(false);
  });

  it("rejects a jump of more than ten times", () => {
    expect(plausiblePriceMove(100, 120)).toBe(true);
    expect(plausiblePriceMove(100, 1001)).toBe(false);
    expect(plausiblePriceMove(100, 9)).toBe(false);
    expect(plausiblePriceMove(undefined, 5)).toBe(true);
    expect(plausiblePriceMove(100, 0)).toBe(false);
  });

  it("re-prices a broker position the way the sync values it", () => {
    const fields = repricedPositionFields(
      { quantity: 10, totalCostBasis: 800, currency: "EUR" },
      95.5,
      FALLBACK_FX_RATES,
    );
    expect(fields).toMatchObject({
      currentPrice: 95.5,
      marketValue: 955,
      unrealizedPL: 155,
      valueInBaseCurrency: 955,
      costBasisInBaseCurrency: 800,
      unrealizedPLInBaseCurrency: 155,
    });
  });

  it("re-prices a Bitpanda holding as a live ticker price", () => {
    expect(repricedBitpandaFields(0.5, 80000, NOW)).toEqual({
      currentPrice: 80000,
      marketValue: 40000,
      valueInBaseCurrency: 40000,
      priceStatus: "live",
      priceAsOf: NOW,
    });
  });
});

