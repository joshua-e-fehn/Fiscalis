import { describe, it, expect } from "vitest";

import { fxRatesFromDaily } from "../finance/currency";
import {
  bankAccountValue,
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

describe("resolveCategoryProfitLoss", () => {
  const holdings = { costBasis: 1000, profitLoss: 0, profitLossPercent: 0 };

  it("prefers the holdings' cost basis, even at break-even", () => {
    expect(
      resolveCategoryProfitLoss({
        currentValue: 5000,
        holdings,
        firstSnapshotValue: 4000,
      }),
    ).toEqual({
      costBasis: 1000,
      costLine: 5000,
      profitLoss: 0,
      profitLossPercent: 0,
      source: "cost-basis",
    });
  });

  it("falls back to the first snapshot value when no holding has a cost", () => {
    expect(
      resolveCategoryProfitLoss({
        currentValue: 5000,
        holdings: {
          costBasis: null,
          profitLoss: null,
          profitLossPercent: null,
        },
        firstSnapshotValue: 4000,
      }),
    ).toEqual({
      costBasis: 4000,
      costLine: 4000,
      profitLoss: 1000,
      profitLossPercent: 25,
      source: "first-snapshot",
    });
  });

  it("draws a cost line whose gap to the value is the KPI P/L", () => {
    // 5000 in the category, of which 1200 carry a cost of 1000
    const partial = { costBasis: 1000, profitLoss: 200, profitLossPercent: 20 };
    for (const firstSnapshotValue of [4000, null]) {
      const r = resolveCategoryProfitLoss({
        currentValue: 5000,
        holdings: partial,
        firstSnapshotValue,
      });
      expect(r.source).toBe("cost-basis");
      expect(r.costBasis).toBe(1000);
      expect(5000 - r.costLine!).toBe(r.profitLoss);
      expect(r.profitLoss).toBe(200);
    }
  });

  it("reports nothing without a cost basis or snapshot", () => {
    expect(
      resolveCategoryProfitLoss({
        currentValue: 5000,
        holdings: null,
        firstSnapshotValue: null,
      }),
    ).toEqual({
      costBasis: null,
      costLine: null,
      profitLoss: null,
      profitLossPercent: null,
      source: null,
    });
  });
});
