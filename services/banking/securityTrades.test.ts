import { describe, expect, it } from "vitest";
import {
  conservativeListing,
  depotPositions,
  parseSecurityTrade,
  securitySubcategory,
  type SettledSecurityTrade,
} from "./securityTrades";

const FUND_BUY =
  "DKB AG - Depot 0511391062 Wertp.Abrechn. 16.11.2026 000002823074800 WKN A2N812 Gesch.Art KV Stück 2,0000 BIT GL.TECH.LEAD. R-I ISIN DE000A2N8127";
const STOCK_BUY =
  "DKB AG - Depot 0511391062 Wertp.Abrechn. 06.11.2025 000001218900000 WKN A0NDYQ Gesch.Art KV Stück 10,0000 ECHOSTAR CORP. A DL -,001 ISIN US2787681061";

describe("parseSecurityTrade", () => {
  it("reads a DKB fund purchase", () => {
    expect(parseSecurityTrade(FUND_BUY)).toEqual({
      depot: "0511391062",
      tradeDate: "2026-11-16",
      reference: "000002823074800",
      wkn: "A2N812",
      isin: "DE000A2N8127",
      name: "BIT GL.TECH.LEAD. R-I",
      side: "buy",
      quantity: 2,
    });
  });

  it("keeps a name with spaces, commas and dashes", () => {
    expect(parseSecurityTrade(STOCK_BUY)).toMatchObject({
      name: "ECHOSTAR CORP. A DL -,001",
      isin: "US2787681061",
      quantity: 10,
    });
  });

  it("reads a sale and German thousands", () => {
    const text = STOCK_BUY.replace("Gesch.Art KV", "Gesch.Art VK").replace(
      "10,0000",
      "1.234,5000",
    );
    expect(parseSecurityTrade(text)).toMatchObject({
      side: "sell",
      quantity: 1234.5,
    });
  });

  it("accepts the umlaut spelled out or dropped", () => {
    expect(parseSecurityTrade(FUND_BUY.replace("Stück", "Stueck"))).not.toBeNull();
    expect(parseSecurityTrade(FUND_BUY.replace("Stück", "Stuck"))).not.toBeNull();
  });

  it("ignores other bookings and unknown trade codes", () => {
    expect(parseSecurityTrade("Rundfunk ARD, ZDF, DRadio - Rundfunk")).toBeNull();
    expect(
      parseSecurityTrade(FUND_BUY.replace("Gesch.Art KV", "Gesch.Art XY")),
    ).toBeNull();
  });
});

function trade(
  overrides: Partial<SettledSecurityTrade>,
): SettledSecurityTrade {
  return {
    depot: "1",
    tradeDate: "2026-01-01",
    reference: "1",
    wkn: "A2N812",
    isin: "DE000A2N8127",
    name: "FUND",
    side: "buy",
    quantity: 1,
    cash: 100,
    currency: "EUR",
    ...overrides,
  };
}

describe("depotPositions", () => {
  it("adds buys at their cash cost", () => {
    const [position] = depotPositions([
      trade({ quantity: 2, cash: 200 }),
      trade({ tradeDate: "2026-02-01", quantity: 1, cash: 160 }),
    ]);
    expect(position).toMatchObject({
      quantity: 3,
      cost: 360,
      lastBuyPrice: 160,
      lastTradeDate: "2026-02-01",
    });
  });

  it("removes sold units at the average cost, in date order", () => {
    const [position] = depotPositions([
      trade({ tradeDate: "2026-03-01", side: "sell", quantity: 1, cash: 500 }),
      trade({ quantity: 4, cash: 400 }),
    ]);
    expect(position).toMatchObject({ quantity: 3, cost: 300 });
  });

  it("drops a holding sold in full", () => {
    expect(
      depotPositions([
        trade({ quantity: 2 }),
        trade({ tradeDate: "2026-02-01", side: "sell", quantity: 2 }),
      ]),
    ).toEqual([]);
  });

  it("drops a holding sold beyond the known buys", () => {
    expect(
      depotPositions([
        trade({ quantity: 1 }),
        trade({ tradeDate: "2026-02-01", side: "sell", quantity: 5 }),
      ]),
    ).toEqual([]);
  });

  it("keeps depots and securities apart", () => {
    const positions = depotPositions([
      trade({}),
      trade({ depot: "2" }),
      trade({ isin: "US2787681061" }),
    ]);
    expect(positions).toHaveLength(3);
  });
});

describe("conservativeListing", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const listing = (symbol: string, price: number, currency = "EUR", ageDays = 0) => ({
    symbol,
    price,
    currency,
    marketTime: now - ageDays * 86_400_000,
  });

  it("takes the lowest recent EUR price", () => {
    expect(
      conservativeListing(
        [listing("A.SG", 851.9), listing("HJ35.F", 849.55), listing("HJ35.MU", 875.4)],
        now,
      )?.symbol,
    ).toBe("HJ35.F");
  });

  it("skips stale listings and prefers EUR over a cheaper foreign quote", () => {
    expect(
      conservativeListing(
        [listing("SATS", 70, "USD"), listing("OLD.F", 1, "EUR", 30), listing("E.F", 60)],
        now,
      )?.symbol,
    ).toBe("E.F");
  });

  it("falls back to the first listing's currency and converts pence", () => {
    expect(
      conservativeListing([listing("X.L", 1500, "GBp"), listing("X", 30, "USD")], now),
    ).toMatchObject({ symbol: "X.L", price: 15, currency: "GBP" });
  });

  it("is null without a recent price", () => {
    expect(conservativeListing([listing("OLD", 10, "EUR", 8)], now)).toBeNull();
  });
});

describe("securitySubcategory", () => {
  it("prefers fund over ETF over stock", () => {
    expect(securitySubcategory(["ETF", "MUTUALFUND"])).toBe("funds");
    expect(securitySubcategory(["EQUITY", "ETF"])).toBe("etfs");
    expect(securitySubcategory([undefined])).toBe("stocks");
  });
});
