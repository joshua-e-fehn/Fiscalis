import { describe, expect, it } from "vitest";
import { chartListing, searchHits, yahooSearchUrl } from "./yahooQuotes";

describe("searchHits", () => {
  it("reads the listings of a search response", () => {
    expect(
      searchHits({
        quotes: [
          { symbol: "HJ35.F", quoteType: "ETF", exchange: "FRA" },
          { symbol: "DE000A2N8127.SG", quoteType: "MUTUALFUND" },
          { name: "no symbol" },
        ],
      }),
    ).toEqual([
      { symbol: "HJ35.F", quoteType: "ETF" },
      { symbol: "DE000A2N8127.SG", quoteType: "MUTUALFUND" },
    ]);
  });

  it("is empty for an unexpected payload", () => {
    expect(searchHits(null)).toEqual([]);
    expect(searchHits({ quotes: "x" })).toEqual([]);
  });
});

describe("chartListing", () => {
  it("reads the last price from the chart meta", () => {
    expect(
      chartListing(
        {
          chart: {
            result: [
              {
                meta: {
                  symbol: "HJ35.F",
                  currency: "EUR",
                  regularMarketPrice: 849.546,
                  regularMarketTime: 1_794_830_000,
                },
              },
            ],
          },
        },
        "ETF",
      ),
    ).toEqual({
      symbol: "HJ35.F",
      price: 849.546,
      currency: "EUR",
      marketTime: 1_794_830_000_000,
      quoteType: "ETF",
    });
  });

  it("is null without a price", () => {
    expect(chartListing({ chart: { result: [{ meta: { symbol: "X" } }] } })).toBeNull();
    expect(chartListing({ chart: { error: "Not Found" } })).toBeNull();
  });
});

it("encodes the ISIN in the search URL", () => {
  expect(yahooSearchUrl("DE000A2N8127")).toContain("q=DE000A2N8127");
});
