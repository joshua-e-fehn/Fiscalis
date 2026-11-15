import { describe, expect, it } from "vitest";
import { tradeDateCostBasis, type BrokerTrade } from "./tradeDateCost";
import type { ToBaseOn } from "./flows";
import { averageCostPerUnit, tradeDay } from "./categorySummary";

/** USD per 1 EUR by day; a day without a row takes the nearest earlier one */
const EURUSD: Record<string, number> = {
  "2015-03-16": 1.05,
  "2021-01-04": 1.25,
  "2024-06-03": 1.08,
  "2026-11-13": 1.16,
};

/** EUR at the nearest earlier mirrored day, like loadFxRates `asOf` */
const usdOn: ToBaseOn = (amount, currency, date) => {
  if (currency === "EUR") return amount;
  if (currency !== "USD") return null;
  const day = tradeDay(date);
  if (!day) return null;
  const earlier = Object.keys(EURUSD)
    .filter((d) => d <= day)
    .sort()
    .at(-1);
  return earlier ? amount / EURUSD[earlier] : null;
};

const TODAY_RATE = 1.16;

const buy = (quantity: number, amount: number, tradeDate: string): BrokerTrade => ({
  type: "BUY",
  quantity,
  amount,
  currency: "USD",
  tradeDate,
});
const sell = (quantity: number, amount: number, tradeDate: string): BrokerTrade => ({
  type: "SELL",
  quantity,
  amount,
  currency: "USD",
  tradeDate,
});

describe("tradeDateCostBasis", () => {
  it("converts a USD holding at the EURUSD of its trade date, not today's", () => {
    // 10 shares for $1,250 on 2021-01-04, when EURUSD was 1.25 (€1,000);
    // today it is 1.16, which would make the cost €1,077.59
    const position = { quantity: 10, totalCostBasis: 1_250, currency: "USD" };
    const cost = tradeDateCostBasis(
      position,
      [buy(10, 1_250, "2021-01-04T14:30:00Z")],
      usdOn,
      1_250 / TODAY_RATE,
    );
    expect(cost.estimated).toBe(false);
    expect(cost.base).toBeCloseTo(1_000, 9);
  });

  it("uses the nearest earlier day for a weekend or holiday trade", () => {
    // Saturday 2021-01-09: no row that day, the 2021-01-04 rate applies
    const cost = tradeDateCostBasis(
      { quantity: 1, totalCostBasis: 125, currency: "USD" },
      [buy(1, 125, "2021-01-09")],
      usdOn,
      0,
    );
    expect(cost.base).toBeCloseTo(100, 9);
  });

  it("blends the rates of several buys, weighted by their amounts", () => {
    // $1,050 at 1.05 (€1,000) + $1,250 at 1.25 (€1,000): €2,000 for $2,300
    const cost = tradeDateCostBasis(
      { quantity: 20, totalCostBasis: 2_300, currency: "USD" },
      [buy(10, 1_250, "2021-01-04"), buy(10, 1_050, "2015-03-16")],
      usdOn,
      2_300 / TODAY_RATE,
    );
    expect(cost.estimated).toBe(false);
    expect(cost.base).toBeCloseTo(2_000, 9);
  });

  it("keeps the blended rate through a sale at the average cost", () => {
    // Half sold: the remaining $1,150 cost keeps the €2,000 / $2,300 rate
    const cost = tradeDateCostBasis(
      { quantity: 10, totalCostBasis: 1_150, currency: "USD" },
      [
        buy(10, 1_050, "2015-03-16"),
        buy(10, 1_250, "2021-01-04"),
        sell(10, -1_600, "2024-06-03"),
      ],
      usdOn,
      1_150 / TODAY_RATE,
    );
    expect(cost.estimated).toBe(false);
    expect(cost.base).toBeCloseTo(1_000, 9);
  });

  it("takes the broker's native cost, the trades only date it", () => {
    // The broker folds a $10 fee into the cost basis the trade amount omits
    const cost = tradeDateCostBasis(
      { quantity: 10, totalCostBasis: 1_260, currency: "USD" },
      [buy(10, 1_250, "2021-01-04")],
      usdOn,
      0,
    );
    expect(cost.base).toBeCloseTo(1_260 / 1.25, 9);
  });

  it("reads units × price when a trade has no amount", () => {
    const cost = tradeDateCostBasis(
      { quantity: 2, totalCostBasis: 250, currency: "USD" },
      [{ ...buy(2, 0, "2021-01-04"), price: 125 }],
      usdOn,
      0,
    );
    expect(cost).toEqual({ base: 200, estimated: false });
  });

  describe("falls back to today's rate, flagged estimated", () => {
    const position = { quantity: 10, totalCostBasis: 1_250, currency: "USD" };
    const today = 1_250 / TODAY_RATE;
    const cases: [string, BrokerTrade[]][] = [
      ["without trades", []],
      ["when units came in untraded (more held than bought)", [buy(4, 500, "2021-01-04")]],
      ["when fewer are held than the trades leave (a split, a transfer out)", [buy(20, 2_500, "2021-01-04")]],
      ["when a sale exceeds the book", [sell(5, 600, "2020-01-01"), buy(10, 1_250, "2021-01-04")]],
      ["when a trade is in another currency", [{ ...buy(10, 1_000, "2021-01-04"), currency: "EUR" }]],
      ["when a trade date cannot be read", [buy(10, 1_250, "not a date")]],
      ["when a trade predates the rate history", [buy(10, 1_250, "2014-12-31")]],
    ];
    it.each(cases)("%s", (_name, trades) => {
      expect(tradeDateCostBasis(position, trades, usdOn, today)).toEqual({
        base: today,
        estimated: true,
      });
    });
  });

  it("ignores cash activities and returns a EUR position as is", () => {
    const dividend: BrokerTrade = { type: "DIVIDEND", amount: 12, currency: "USD", tradeDate: "2022-01-01" };
    expect(
      tradeDateCostBasis(
        { quantity: 10, totalCostBasis: 1_250, currency: "USD" },
        [buy(10, 1_250, "2021-01-04"), dividend],
        usdOn,
        0,
      ).base,
    ).toBeCloseTo(1_000, 9);
    expect(
      tradeDateCostBasis(
        { quantity: 1, totalCostBasis: 500, currency: "EUR" },
        [],
        usdOn,
        500,
      ),
    ).toEqual({ base: 500, estimated: false });
  });
});

describe("averageCostPerUnit at trade-date rates", () => {
  it("costs a USD buy at the EURUSD of its day", () => {
    const avg = averageCostPerUnit(
      [
        {
          type: "buy",
          symbol: "btc",
          quantity: 1,
          amount: 1_250,
          currency: "USD",
          transactionDate: "2021-01-04T10:00:00Z",
        },
      ],
      usdOn,
    );
    expect(avg.get("BTC")!.perUnit).toBeCloseTo(1_000, 9);
    expect(avg.get("BTC")!.native).toEqual({ perUnit: 1_250, currency: "USD" });
  });
});

describe("tradeDay", () => {
  it("reads ISO dates and epoch strings as their UTC day", () => {
    expect(tradeDay("2021-01-04T23:30:00-02:00")).toBe("2021-01-05");
    expect(tradeDay(String(Date.UTC(2021, 0, 4, 12) / 1000))).toBe("2021-01-04");
    expect(tradeDay("garbage")).toBeNull();
  });
});
