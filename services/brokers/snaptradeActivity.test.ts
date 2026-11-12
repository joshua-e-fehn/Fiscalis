import { describe, it, expect } from "vitest";

import {
  activitiesStartDate,
  fetchActivityPagesOldestFirst,
  mapSnaptradeActivity,
  nextActivitiesOffset,
} from "./snaptradeActivity";

describe("mapSnaptradeActivity", () => {
  it("maps a trade with its symbol, units, price and signed amount", () => {
    expect(
      mapSnaptradeActivity(
        {
          id: "act-1",
          symbol: { id: "sym-1", symbol: "AAPL" },
          units: 3,
          price: 190.5,
          amount: -571.5,
          currency: { code: "usd" },
          type: "buy",
          description: "Bought 3 AAPL",
          trade_date: "2026-11-10T00:00:00Z",
          settlement_date: "2026-11-12T00:00:00Z",
          fee: 1,
        },
        "EUR",
      ),
    ).toEqual({
      snaptradeActivityId: "act-1",
      type: "BUY",
      symbol: "AAPL",
      symbolId: "sym-1",
      description: "Bought 3 AAPL",
      quantity: 3,
      price: 190.5,
      amount: -571.5,
      currency: "USD",
      fees: 1,
      settlementDate: "2026-11-12T00:00:00Z",
      tradeDate: "2026-11-10T00:00:00Z",
    });
  });

  it("maps a cash activity without a symbol in the account's currency", () => {
    expect(
      mapSnaptradeActivity(
        { id: "act-2", symbol: null, amount: 500, type: "CONTRIBUTION", trade_date: "2026-11-09" },
        "eur",
      ),
    ).toEqual({
      snaptradeActivityId: "act-2",
      type: "CONTRIBUTION",
      symbol: undefined,
      symbolId: undefined,
      description: undefined,
      quantity: undefined,
      price: undefined,
      amount: 500,
      currency: "EUR",
      fees: undefined,
      settlementDate: undefined,
      tradeDate: "2026-11-09",
    });
  });

  it("drops an activity without an id or a trade date, and reads a null amount as 0", () => {
    expect(mapSnaptradeActivity({ trade_date: "2026-11-09" }, "EUR")).toBeNull();
    expect(mapSnaptradeActivity({ id: "x", trade_date: null }, "EUR")).toBeNull();
    expect(
      mapSnaptradeActivity({ id: "x", amount: null, trade_date: "2026-11-09" }, "EUR")!.amount,
    ).toBe(0);
  });
});

describe("activitiesStartDate", () => {
  it("re-fetches a week before the newest stored activity", () => {
    expect(activitiesStartDate("2026-11-10T15:00:00Z")).toBe("2026-11-03");
    expect(activitiesStartDate("2026-03-02")).toBe("2026-02-23");
  });

  it("fetches the whole history when nothing is stored", () => {
    expect(activitiesStartDate(null)).toBeUndefined();
    expect(activitiesStartDate("garbage")).toBeUndefined();
  });
});

describe("nextActivitiesOffset", () => {
  it("continues after a full page while the total is not reached", () => {
    expect(nextActivitiesOffset(0, 1000, 1000, 2500)).toBe(1000);
    expect(nextActivitiesOffset(1000, 1000, 1000, undefined)).toBe(2000);
  });

  it("stops on a short or empty page, or at the total", () => {
    expect(nextActivitiesOffset(2000, 500, 1000, 2500)).toBeNull();
    expect(nextActivitiesOffset(0, 0, 1000, undefined)).toBeNull();
    expect(nextActivitiesOffset(1000, 1000, 1000, 2000)).toBeNull();
  });
});

describe("fetchActivityPagesOldestFirst", () => {
  // Newest first, two rows a page: total 5
  const history = ["d5", "d4", "d3", "d2", "d1"];
  const fetchFrom = (failAt?: number) => {
    const offsets: number[] = [];
    const fetchPage = async (offset: number) => {
      offsets.push(offset);
      if (offset === failAt) throw new Error("rate limited");
      return { rows: history.slice(offset, offset + 2), total: history.length };
    };
    return { offsets, fetchPage };
  };

  it("returns every page, oldest page first, to store in that order", async () => {
    const { offsets, fetchPage } = fetchFrom();
    expect(await fetchActivityPagesOldestFirst(fetchPage, 2)).toEqual([
      ["d1"],
      ["d3", "d2"],
      ["d5", "d4"],
    ]);
    expect(offsets).toEqual([0, 2, 4]);
  });

  it("returns nothing to store when a later page fails", async () => {
    const { offsets, fetchPage } = fetchFrom(2);
    await expect(fetchActivityPagesOldestFirst(fetchPage, 2)).rejects.toThrow("rate limited");
    expect(offsets).toEqual([0, 2]);
  });

  it("returns no pages for an empty history", async () => {
    const fetchPage = async () => ({ rows: [] as string[], total: 0 });
    expect(await fetchActivityPagesOldestFirst(fetchPage, 2)).toEqual([]);
  });
});
