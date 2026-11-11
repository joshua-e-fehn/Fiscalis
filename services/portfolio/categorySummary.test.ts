import { describe, it, expect } from "vitest";

import { fxRatesFromDaily } from "../finance/currency";
import { holdingNetFlow } from "./aggregate";
import {
  averageCostPerUnit,
  bankAccountValue,
  bitpandaCostBasis,
  brokerAccountCash,
  brokerAccountMarginDebt,
  buildCategorySummary,
  groupSmallSlices,
  holdingProfitLoss,
  loanBalanceInBase,
  loanCountsAsLiability,
  positionCostBasis,
  positionToHolding,
  resolveCategoryProfitLoss,
  summarizeHoldings,
  topHoldings,
} from "./categorySummary";

describe("summarizeHoldings", () => {
  it("computes cost and P/L only over holdings with a cost basis", () => {
    // A transfer-in without cost basis worth 5000 must not count as profit
    const s = summarizeHoldings([
      { value: 1200, costBasis: 1000 },
      { value: 5000, costBasis: undefined },
    ]);
    expect(s.value).toBe(6200);
    expect(s.count).toBe(2);
    expect(s.costBasis).toBe(1000);
    expect(s.coveredValue).toBe(1200);
    expect(s.profitLoss).toBe(200);
    expect(s.profitLossPercent).toBe(20);
    expect(s.coverage).toBeCloseTo(1200 / 6200, 12);
  });

  it("keeps a break-even P/L of 0 (not null)", () => {
    const s = summarizeHoldings([{ value: 1000, costBasis: 1000 }]);
    expect(s.profitLoss).toBe(0);
    expect(s.profitLossPercent).toBe(0);
  });

  it("counts a worthless holding with a cost as a full loss", () => {
    const s = summarizeHoldings([{ value: 0, costBasis: 300 }]);
    expect(s.profitLoss).toBe(-300);
    expect(s.profitLossPercent).toBe(-100);
    expect(s.coverage).toBeNull();
  });

  it("has no cost or P/L when no holding has a cost basis", () => {
    const s = summarizeHoldings([{ value: 100, costBasis: null }]);
    expect(s).toMatchObject({
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      coveredValue: 0,
      coverage: 0,
    });
  });

  it("has no percent for a zero cost basis", () => {
    const s = summarizeHoldings([{ value: 100, costBasis: 0 }]);
    expect(s.profitLoss).toBe(100);
    expect(s.profitLossPercent).toBeNull();
  });

  it("summarises an empty list", () => {
    expect(summarizeHoldings([])).toEqual({
      value: 0,
      count: 0,
      costBasis: null,
      coveredValue: 0,
      profitLoss: null,
      profitLossPercent: null,
      coverage: null,
    });
  });
});

describe("positionCostBasis / positionToHolding", () => {
  it("reads the base-currency value and cost stamped at sync time", () => {
    const usd = {
      _id: "p1",
      symbol: "AAPL",
      valueInBaseCurrency: 1000,
      costBasisInBaseCurrency: 800,
    };
    expect(positionCostBasis(usd)).toBe(800);
    expect(positionToHolding(usd)).toEqual({
      id: "p1",
      name: "AAPL",
      subcategory: "unknown",
      value: 1000,
      costBasis: 800,
    });
  });

  it("has no cost and no value without the base-currency fields", () => {
    expect(positionCostBasis({ _id: "b", valueInBaseCurrency: 10 })).toBeNull();
    expect(positionToHolding({ _id: "c" })).toMatchObject({
      value: 0,
      costBasis: null,
    });
  });
});

describe("accounts and loans", () => {
  it("values a bank account by its base-currency balance only", () => {
    expect(bankAccountValue({ valueInBaseCurrency: 850 })).toBe(850);
    expect(bankAccountValue({})).toBe(0);
  });

  it("counts explicit broker cash only, never the account balance", () => {
    const usd = {
      cash: 1_170,
      balance: 11_700,
      cashValueInBaseCurrency: 1_000,
      balanceInBaseCurrency: 10_000,
      cashInvestmentCategory: "cash",
    };
    expect(brokerAccountCash(usd)).toBe(1_000);
    expect(brokerAccountMarginDebt(usd)).toBe(0);
    // A zero cash balance is zero, whatever the account is worth
    expect(
      brokerAccountCash({ ...usd, cash: 0, cashValueInBaseCurrency: 0 }),
    ).toBe(0);
    // Native amounts without a base value are never counted as EUR
    expect(brokerAccountCash({ cash: 500 })).toBe(0);
  });

  it("reads negative cash as a margin debit, not as zero cash", () => {
    const margin = {
      cash: -2_340,
      cashValueInBaseCurrency: -2_000,
      cashInvestmentCategory: "liabilities",
    };
    expect(brokerAccountCash(margin)).toBe(0);
    expect(brokerAccountMarginDebt(margin)).toBe(2_000);
    // Rows synced before the category was written: classified by sign
    expect(
      brokerAccountMarginDebt({ cash: -10, cashValueInBaseCurrency: -9 }),
    ).toBe(9);
  });

  it("converts outstanding loans by their currency (D1 statuses)", () => {
    const rates = fxRatesFromDaily([
      { date: "2026-11-10", currency: "CHF", unitsPerEur: 0.94 },
    ]);
    const mortgage = { currentBalance: 188_000, currency: "CHF" };
    expect(
      loanBalanceInBase({ ...mortgage, status: "active" }, rates),
    ).toBeCloseTo(200_000, 6);
    expect(
      loanBalanceInBase({ ...mortgage, status: "defaulted" }, rates),
    ).toBeCloseTo(200_000, 6);
    expect(loanBalanceInBase({ ...mortgage, status: "paid_off" }, rates)).toBe(0);
    expect(loanBalanceInBase({ ...mortgage, status: "refinanced" }, rates)).toBe(0);
    expect(
      loanBalanceInBase(
        { currentBalance: 1_000, currency: "VND", status: "active" },
        rates,
      ),
    ).toBe(0);
    expect(loanCountsAsLiability("defaulted")).toBe(true);
  });
});

describe("buildCategorySummary", () => {
  it("summarises the category and each subcategory under one policy", () => {
    const s = buildCategorySummary([
      { id: "a", name: "A", subcategory: "stocks", value: 150, costBasis: 100 },
      { id: "b", name: "B", subcategory: "stocks", value: 50, costBasis: null },
      { id: "c", name: "C", subcategory: "etfs", value: 90, costBasis: 100 },
    ]);
    expect(s.value).toBe(290);
    expect(s.costBasis).toBe(200);
    expect(s.profitLoss).toBe(40);
    expect(s.bySubcategory.stocks).toMatchObject({
      value: 200,
      count: 2,
      costBasis: 100,
      profitLoss: 50,
      coverage: 0.75,
    });
    expect(s.bySubcategory.etfs.profitLoss).toBe(-10);
  });
});

describe("holdingProfitLoss / topHoldings", () => {
  it("derives P/L from value and cost, null without a cost", () => {
    expect(holdingProfitLoss({ value: 120, costBasis: 100 })).toEqual({
      profitLoss: 20,
      profitLossPercent: 20,
    });
    expect(holdingProfitLoss({ value: 100, costBasis: 100 })).toEqual({
      profitLoss: 0,
      profitLossPercent: 0,
    });
    expect(holdingProfitLoss({ value: 120, costBasis: undefined })).toEqual({
      profitLoss: null,
      profitLossPercent: null,
    });
  });

  it("returns the largest holdings without mutating the input", () => {
    const input = [{ value: 1 }, { value: 3 }, { value: 2 }];
    expect(topHoldings(input, 2)).toEqual([{ value: 3 }, { value: 2 }]);
    expect(input[0].value).toBe(1);
  });
});

describe("groupSmallSlices", () => {
  it("groups slices under the threshold and beyond the slot limit", () => {
    const slices = [50, 30, 10, 5, 3, 1, 1].map((value, i) => ({
      id: i,
      value,
    }));
    const r = groupSmallSlices(slices, { thresholdPercent: 2, maxSlices: 4 });
    expect(r.shown.map((s) => s.value)).toEqual([50, 30, 10]);
    expect(r.otherValue).toBe(10);
    expect(r.total).toBe(100);
  });

  it("puts everything into other when the total is 0", () => {
    const r = groupSmallSlices([{ value: 0 }], {
      thresholdPercent: 2,
      maxSlices: 8,
    });
    expect(r.shown).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("averageCostPerUnit", () => {
  const eur = (amount: number, currency: string) =>
    currency === "EUR" ? amount : currency === "USD" ? amount * 0.9 : null;
  const trade = (
    type: string,
    quantity: number,
    amount: number,
    date: string,
    extra: { symbol?: string; currency?: string } = {},
  ) => ({
    type,
    symbol: extra.symbol ?? "btc",
    quantity,
    amount,
    currency: extra.currency ?? "EUR",
    transactionDate: date,
  });

  it("averages buys and keeps the average through a sale", () => {
    const avg = averageCostPerUnit(
      [
        trade("buy", 2, 20_000, "2026-03-01"),
        trade("sell", 1, 15_000, "2026-05-01"),
        trade("buy", 1, 40_000, "2026-02-01"),
        trade("reward", 0.5, 0, "2026-04-01"),
      ],
      eur,
    );
    // Feb 1 @ 40k, Mar 1 2 @ 10k, a 0.5 reward at no cost → 60k / 3.5;
    // the sale keeps the average and leaves 2.5 units
    expect(avg.get("BTC")!.perUnit).toBeCloseTo(60_000 / 3.5);
    expect(avg.get("BTC")!.quantity).toBeCloseTo(2.5);
  });

  it("adds a reward at no cost, so the cost basis does not move", () => {
    const before = averageCostPerUnit([trade("buy", 1, 20_000, "2026-01-01")], eur);
    const after = averageCostPerUnit(
      [trade("buy", 1, 20_000, "2026-01-01"), trade("reward", 0.1, 0, "2026-01-02")],
      eur,
    );
    const cost = (books: typeof before, quantity: number) =>
      bitpandaCostBasis({ assetType: "crypto", symbol: "BTC", quantity }, books)?.base;
    expect(cost(before, 1)).toBeCloseTo(20_000);
    // The reward's value is a gain on the same cost
    expect(cost(after, 1.1)).toBeCloseTo(20_000);
  });

  it("replays trades in time order whatever the date format", () => {
    // A sale stored as epoch seconds (a unix time as a string) sorts
    // before ISO dates as text, but comes after both buys
    const avg = averageCostPerUnit(
      [
        trade("sell", 1, 0, String(Date.UTC(2026, 2, 1) / 1000)),
        trade("buy", 1, 100, "2026-01-01T00:00:00Z"),
        trade("buy", 1, 300, "2026-02-01T00:00:00Z"),
      ],
      eur,
    );
    expect(avg.get("BTC")).toEqual({ perUnit: 200, quantity: 1 });
  });

  it("converts each buy to EUR and gives up on a currency without a rate", () => {
    expect(
      averageCostPerUnit([trade("buy", 1, 1_000, "2026-01-01", { currency: "USD" })], eur).get("BTC")!
        .perUnit,
    ).toBeCloseTo(900);
    expect(
      averageCostPerUnit(
        [
          trade("buy", 1, 1_000, "2026-01-01"),
          trade("buy", 1, 1_000, "2026-01-02", { currency: "XYZ" }),
        ],
        eur,
      ).has("BTC"),
    ).toBe(false);
  });

  it("has no average once everything bought is sold", () => {
    const avg = averageCostPerUnit(
      [trade("buy", 1, 100, "2026-01-01"), trade("sell", 1, 150, "2026-01-02")],
      eur,
    );
    expect(avg.has("BTC")).toBe(false);
  });

  it("takes withdrawn units out at the running average", () => {
    const avg = averageCostPerUnit(
      [
        trade("buy", 1, 100, "2026-01-01"),
        trade("withdrawal", 1, 0, "2026-01-02"),
        trade("buy", 1, 200, "2026-01-03"),
      ],
      eur,
    );
    expect(avg.get("BTC")).toEqual({ perUnit: 200, quantity: 1 });
  });

  it("ignores deposits and transfers, which carry no price", () => {
    const avg = averageCostPerUnit(
      [
        trade("buy", 1, 100, "2026-01-01"),
        trade("deposit", 1, 0, "2026-01-02"),
        trade("transfer", 1, 0, "2026-01-03"),
      ],
      eur,
    );
    expect(avg.get("BTC")).toEqual({ perUnit: 100, quantity: 1 });
  });

  it("forgets an unpriced buy once everything bought is sold", () => {
    const avg = averageCostPerUnit(
      [
        trade("buy", 1, 1_000, "2026-01-01", { currency: "XYZ" }),
        trade("sell", 1, 1_100, "2026-01-02"),
        trade("buy", 1, 500, "2026-01-03"),
      ],
      eur,
    );
    expect(avg.get("BTC")).toEqual({ perUnit: 500, quantity: 1 });
  });

  it("stays unknown while units of an unpriced buy are still held", () => {
    const avg = averageCostPerUnit(
      [
        trade("buy", 2, 1_000, "2026-01-01", { currency: "XYZ" }),
        trade("sell", 1, 600, "2026-01-02"),
        trade("buy", 1, 500, "2026-01-03"),
      ],
      eur,
    );
    expect(avg.has("BTC")).toBe(false);
  });

  it("keeps a cost paid in one foreign currency in that currency", () => {
    const usdAt = (eurPerUsd: number) => (amount: number, currency: string) =>
      currency === "EUR" ? amount : currency === "USD" ? amount * eurPerUsd : null;
    const trades = [
      trade("buy", 2, 1_000, "2026-01-01", { currency: "USD" }),
      trade("sell", 1, 700, "2026-01-02"),
    ];
    const holding = { assetType: "crypto", symbol: "BTC", quantity: 1 };
    const before = bitpandaCostBasis(holding, averageCostPerUnit(trades, usdAt(0.9)))!;
    const after = bitpandaCostBasis(holding, averageCostPerUnit(trades, usdAt(0.8)))!;
    // The EUR cost moves with the rate, the USD cost does not
    expect(before.base).toBeCloseTo(450);
    expect(after.base).toBeCloseTo(400);
    expect(before.native).toEqual({ amount: 500, currency: "USD" });
    expect(after.native).toEqual({ amount: 500, currency: "USD" });
    // So an unchanged holding has no flow across the rate move
    const entry = (c: typeof before) => ({
      key: "btc",
      value: 1_000,
      cost: c.base,
      costNative: c.native!.amount,
      currency: c.native!.currency,
    });
    expect(holdingNetFlow(entry(before), entry(after))).toEqual({
      amount: 0,
      estimated: false,
    });
  });

  it("keeps no foreign cost for EUR or mixed-currency books", () => {
    const eurOnly = averageCostPerUnit([trade("buy", 1, 100, "2026-01-01")], eur);
    expect(eurOnly.get("BTC")!.native).toBeUndefined();
    const mixed = averageCostPerUnit(
      [
        trade("buy", 1, 100, "2026-01-01"),
        trade("buy", 1, 100, "2026-01-02", { currency: "USD" }),
      ],
      eur,
    );
    expect(mixed.get("BTC")!.native).toBeUndefined();
    expect(mixed.get("BTC")!.perUnit).toBeCloseTo(95);
  });

  it("costs a holding at the average times the quantity held, never fiat", () => {
    const avg = new Map([["BTC", { perUnit: 20_000, quantity: 2 }]]);
    expect(bitpandaCostBasis({ assetType: "crypto", symbol: "btc", quantity: 1.5 }, avg)).toEqual({ base: 30_000 });
    expect(bitpandaCostBasis({ assetType: "crypto", symbol: "ETH", quantity: 1 }, avg)).toBeUndefined();
    expect(bitpandaCostBasis({ assetType: "fiat", symbol: "BTC", quantity: 1 }, avg)).toBeUndefined();
  });

  it("leaves a holding uncovered when more is held than the trades account for", () => {
    // 1 BTC transferred in next to 0.01 bought: the transfer's cost is unknown
    const avg = new Map([["BTC", { perUnit: 60_000, quantity: 0.01 }]]);
    expect(bitpandaCostBasis({ assetType: "crypto", symbol: "BTC", quantity: 1.01 }, avg)).toBeUndefined();
    // Rounding within the tolerance still counts
    expect(bitpandaCostBasis({ assetType: "crypto", symbol: "BTC", quantity: 0.010005 }, avg)!.base)
      .toBeCloseTo(600.3);
  });
});

describe("resolveCategoryProfitLoss", () => {
  const holdings = { costBasis: 1000, profitLoss: 0, profitLossPercent: 0 };
  const noCost = { costBasis: null, profitLoss: null, profitLossPercent: null };
  const tracked = {
    change: 300,
    changePercent: 7.5,
    since: 1_700_000_000_000,
    flowAdjusted: true,
    flowsEstimated: false,
  };
  const none = { since: null, flowAdjusted: false, flowsEstimated: false };

  it("prefers the holdings' cost basis, even at break-even", () => {
    expect(
      resolveCategoryProfitLoss({ currentValue: 5000, holdings, sinceTracking: tracked }),
    ).toEqual({
      costBasis: 1000,
      costLine: 5000,
      profitLoss: 0,
      profitLossPercent: 0,
      source: "cost-basis",
      ...none,
    });
  });

  it("falls back to the performance since tracking, never a snapshot cost basis", () => {
    expect(
      resolveCategoryProfitLoss({ currentValue: 5000, holdings: noCost, sinceTracking: tracked }),
    ).toEqual({
      costBasis: null,
      costLine: 4700,
      profitLoss: 300,
      profitLossPercent: 7.5,
      source: "since-tracking",
      since: tracked.since,
      flowAdjusted: true,
      flowsEstimated: false,
    });
  });

  it("draws a cost line whose gap to the value is the KPI P/L", () => {
    // 5000 in the category, of which 1200 carry a cost of 1000
    const partial = { costBasis: 1000, profitLoss: 200, profitLossPercent: 20 };
    for (const sinceTracking of [tracked, null]) {
      const r = resolveCategoryProfitLoss({ currentValue: 5000, holdings: partial, sinceTracking });
      expect(r.source).toBe("cost-basis");
      expect(r.costBasis).toBe(1000);
      expect(5000 - r.costLine!).toBe(r.profitLoss);
      expect(r.profitLoss).toBe(200);
    }
  });

  it("reports nothing without a cost basis or history", () => {
    expect(
      resolveCategoryProfitLoss({ currentValue: 5000, holdings: null, sinceTracking: null }),
    ).toEqual({
      costBasis: null,
      costLine: null,
      profitLoss: null,
      profitLossPercent: null,
      source: null,
      ...none,
    });
  });
});
