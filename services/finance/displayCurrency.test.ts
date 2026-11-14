import { describe, expect, it } from "vitest";

import {
  DISPLAY_CURRENCIES,
  categorySummaryInCurrency,
  fromEur,
  isDisplayCurrency,
  portfolioSummaryInCurrency,
  quotesInCurrency,
  rateOn,
  scaleMoney,
  seriesInCurrency,
  snapshotInCurrency,
  toDisplayCurrency,
  type DisplayRatePoint,
} from "./displayCurrency";
import { computePeriodReturn } from "../performance/strategies/base";

// CHF per EUR on Thu 5 to Mon 9 Nov 2026; no rows on the weekend
const history: DisplayRatePoint[] = [
  { date: "2026-11-05", unitsPerEur: 0.93 },
  { date: "2026-11-06", unitsPerEur: 0.94 },
  { date: "2026-11-09", unitsPerEur: 0.95 },
];

describe("DISPLAY_CURRENCIES", () => {
  it("is the onboarding list", () => {
    expect(DISPLAY_CURRENCIES).toEqual(["EUR", "USD", "GBP", "CHF"]);
  });

  it("accepts only the allowlisted upper-case codes", () => {
    expect(isDisplayCurrency("GBP")).toBe(true);
    expect(isDisplayCurrency("gbp")).toBe(false);
    expect(isDisplayCurrency("JPY")).toBe(false);
    expect(isDisplayCurrency(undefined)).toBe(false);
  });

  it("reads stored codes case-insensitively", () => {
    expect(toDisplayCurrency("chf")).toBe("CHF");
    expect(toDisplayCurrency(" Usd ")).toBe("USD");
    expect(toDisplayCurrency("SEK")).toBeNull();
    expect(toDisplayCurrency(undefined)).toBeNull();
  });
});

describe("fromEur", () => {
  it("multiplies by units per EUR", () => {
    expect(fromEur(100, 1.17)).toBeCloseTo(117);
  });

  it("is the identity at rate 1 (EUR)", () => {
    expect(fromEur(-15_000, 1)).toBe(-15_000);
  });
});

describe("rateOn", () => {
  it("uses the day's own rate", () => {
    expect(rateOn(history, "2026-11-06")).toBe(0.94);
  });

  it("carries Friday's rate over the weekend", () => {
    expect(rateOn(history, "2026-11-07")).toBe(0.94);
    expect(rateOn(history, Date.UTC(2026, 10, 8, 18))).toBe(0.94);
    expect(rateOn(history, "2026-11-09")).toBe(0.95);
  });

  it("uses the latest rate after the history", () => {
    expect(rateOn(history, "2026-12-01")).toBe(0.95);
  });

  it("uses the earliest rate before the history", () => {
    expect(rateOn(history, "2020-01-01")).toBe(0.93);
  });

  it("is null without history", () => {
    expect(rateOn([], "2026-11-06")).toBeNull();
  });
});

describe("snapshotInCurrency", () => {
  const snapshot = {
    timestamp: Date.UTC(2026, 10, 6),
    date: "2026-11-06",
    source: "scheduled-daily",
    partial: false,
    totalAssets: 1_000,
    totalLiabilities: 200,
    netWorth: 800,
    totalCostBasis: 600,
    totalCoveredValue: 700,
    categoryBreakdown: [
      {
        category: "commodities",
        value: 500,
        costBasis: 300,
        coveredValue: 400,
        netFlow: 50,
        netFlowEstimated: true,
        sources: [
          {
            source: "vault",
            value: 500,
            costBasis: 300,
            coveredValue: 400,
            netFlow: 50,
            holdings: [
              { key: "coin", value: 500, cost: 300, costNative: 330, currency: "USD" },
            ],
          },
        ],
      },
      { category: "cash", value: 500 },
    ],
  };

  it("scales every money field", () => {
    const out = snapshotInCurrency(snapshot, 2);
    expect(out).toMatchObject({
      totalAssets: 2_000,
      totalLiabilities: 400,
      netWorth: 1_600,
      totalCostBasis: 1_200,
      totalCoveredValue: 1_400,
    });
    expect(out.categoryBreakdown[0]).toMatchObject({
      value: 1_000,
      costBasis: 600,
      coveredValue: 800,
      netFlow: 100,
    });
    expect(out.categoryBreakdown[0].sources?.[0]).toMatchObject({
      value: 1_000,
      costBasis: 600,
      coveredValue: 800,
      netFlow: 100,
    });
    expect(out.categoryBreakdown[0].sources?.[0].holdings[0]).toEqual({
      key: "coin",
      value: 1_000,
      cost: 600,
      // Native cost is in its own currency, never converted
      costNative: 330,
      currency: "USD",
    });
  });

  it("keeps non-money fields and absent fields absent", () => {
    const out = snapshotInCurrency(snapshot, 2);
    expect(out.timestamp).toBe(snapshot.timestamp);
    expect(out.date).toBe("2026-11-06");
    expect(out.source).toBe("scheduled-daily");
    expect(out.partial).toBe(false);
    expect(out.categoryBreakdown[0].netFlowEstimated).toBe(true);
    expect(out.categoryBreakdown[1]).toEqual({ category: "cash", value: 1_000 });
  });

  it("does not mutate its input", () => {
    snapshotInCurrency(snapshot, 2);
    expect(snapshot.netWorth).toBe(800);
    expect(snapshot.categoryBreakdown[0].sources?.[0].holdings[0].value).toBe(500);
  });

  it("is the identity at rate 1 (EUR)", () => {
    expect(snapshotInCurrency(snapshot, 1)).toBe(snapshot);
  });

  it("handles a snapshot without breakdown", () => {
    expect(
      snapshotInCurrency(
        { totalAssets: 10, totalLiabilities: 0, netWorth: 10 },
        0.5,
      ),
    ).toEqual({ totalAssets: 5, totalLiabilities: 0, netWorth: 5 });
  });
});

describe("quotesInCurrency", () => {
  const byDay = (timestamp: number) => rateOn(history, timestamp) ?? 1;

  it("converts each close at its own day's rate, carrying the weekend", () => {
    const out = quotesInCurrency(
      [
        { date: new Date(Date.UTC(2026, 10, 6, 12)), price: 100 },
        { date: new Date(Date.UTC(2026, 10, 7, 12)), price: 200 },
        { date: new Date(Date.UTC(2026, 10, 9, 12)), price: 100 },
      ],
      byDay,
      2,
    );
    expect(out.map((p) => p.price)).toEqual([94, 188, 95]);
  });

  it("keeps gaps as gaps and takes undated closes at the latest rate", () => {
    const gap = { date: new Date(Date.UTC(2026, 10, 6)), price: null };
    const zero = { date: new Date(Date.UTC(2026, 10, 6)), price: 0 };
    const out = quotesInCurrency(
      [gap, zero, { date: null, price: 10 }],
      byDay,
      2,
    );
    expect(out[0]).toBe(gap);
    expect(out[1]).toBe(zero);
    expect(out[2].price).toBe(20);
  });
});

describe("seriesInCurrency", () => {
  const points = [
    { timestamp: Date.UTC(2026, 10, 6, 12), value: 100, label: "Fri" },
    { timestamp: Date.UTC(2026, 10, 7, 12), value: 100, label: "Sat" },
    { timestamp: Date.UTC(2026, 10, 9, 12), value: 100, label: "Mon" },
  ];

  it("converts each point at its own day's rate", () => {
    const out = seriesInCurrency(points, history, 1);
    expect(out.map((p) => p.value)).toEqual([94, 94, 95]);
    expect(out.map((p) => p.label)).toEqual(["Fri", "Sat", "Mon"]);
  });

  it("uses the fallback rate without history", () => {
    expect(seriesInCurrency(points, [], 2).map((p) => p.value)).toEqual([
      200, 200, 200,
    ]);
  });
});

describe("return invariance", () => {
  it("leaves period returns unchanged at a constant rate", () => {
    const DAY = 86_400_000;
    const values = [
      { timestamp: 0, value: 1_000 },
      { timestamp: 10 * DAY, value: 1_500 },
      { timestamp: 20 * DAY, value: 1_650 },
    ];
    const flows = [{ timestamp: 10 * DAY, amount: 400 }];
    const rate = 1.17;

    const eur = computePeriodReturn(values, flows)!;
    const usd = computePeriodReturn(
      values.map((p) => ({ ...p, value: fromEur(p.value, rate) })),
      flows.map((f) => ({ ...f, amount: fromEur(f.amount, rate) })),
    )!;

    expect(usd.modifiedDietzPercent).toBeCloseTo(eur.modifiedDietzPercent!, 10);
    expect(usd.timeWeightedPercent).toBeCloseTo(eur.timeWeightedPercent!, 10);
    expect(usd.profitLoss).toBeCloseTo(eur.profitLoss * rate, 8);
  });
});

describe("scaleMoney", () => {
  it("scales the named number fields and keeps null and absent ones", () => {
    const row: { value: number; cost: number | null; pl?: number; label: string } = {
      value: -15_000,
      cost: null,
      label: "loan",
    };
    const out = scaleMoney(row, ["value", "cost", "pl"] as const, 1.25);
    expect(out).toEqual({ value: -18_750, cost: null, label: "loan" });
    expect("pl" in out).toBe(false);
    expect(row.value).toBe(-15_000);
  });
});

describe("categorySummaryInCurrency", () => {
  // EUR figures; 0.85 GBP per EUR
  const GBP = 0.85;
  const summary = {
    totalValue: 10_000,
    totalCost: 8_000,
    profitLoss: 2_000,
    profitLossPercent: 25,
    profitLossCoverage: 0.9,
    ytdProfitLoss: null,
    ytdProfitLossPercent: null,
    valueAtYearStart: null,
    subcategories: [
      {
        id: "stocks",
        name: "Stocks",
        totalValue: 10_000,
        costBasis: 8_000,
        profitLoss: 2_000,
        profitLossPercent: 25,
        holdingsCount: 2,
        topHoldings: [
          {
            id: "a",
            name: "ACME",
            value: 6_000,
            costBasis: null,
            profitLoss: null,
            profitLossPercent: null,
            allocationPercent: 60,
          },
        ],
      },
    ],
  };

  it("converts every amount and keeps percentages", () => {
    const out = categorySummaryInCurrency(summary, GBP);
    expect(out.totalValue).toBeCloseTo(8_500);
    expect(out.totalCost).toBeCloseTo(6_800);
    expect(out.profitLoss).toBeCloseTo(1_700);
    expect(out.profitLossPercent).toBe(25);
    expect(out.profitLossCoverage).toBe(0.9);
    expect(out.ytdProfitLoss).toBeNull();
    const sub = out.subcategories[0];
    expect(sub.totalValue).toBeCloseTo(8_500);
    expect(sub.costBasis).toBeCloseTo(6_800);
    expect(sub.profitLossPercent).toBe(25);
    expect(sub.holdingsCount).toBe(2);
    expect(sub.topHoldings[0]).toMatchObject({
      name: "ACME",
      costBasis: null,
      allocationPercent: 60,
    });
    expect(sub.topHoldings[0].value).toBeCloseTo(5_100);
  });

  it("keeps the summary consistent: P/L = value - cost after conversion", () => {
    const out = categorySummaryInCurrency(summary, GBP);
    expect(out.totalValue - out.totalCost!).toBeCloseTo(out.profitLoss!);
  });

  it("is the identity at rate 1 (EUR)", () => {
    expect(categorySummaryInCurrency(summary, 1)).toBe(summary);
  });
});

describe("portfolioSummaryInCurrency", () => {
  // 1.17 USD per EUR
  const USD = 1.17;
  const summary = {
    totalAssets: 100_000,
    totalLiabilities: 15_000,
    netWorth: 85_000,
    totalCostBasis: 60_000,
    costLine: 80_000,
    unrealizedProfitLoss: 20_000,
    unrealizedProfitLossPercent: 33.3,
    unrealizedProfitLossCoverage: 0.8,
    assetCategories: [
      {
        id: "equities",
        totalValue: 70_000,
        costBasis: null,
        profitLoss: null,
        profitLossPercent: null,
        holdingsCount: 4,
      },
    ],
    liabilities: {
      totalBalance: 15_000,
      monthlyPayment: 500,
      loansCount: 1,
      accountsCount: 0,
    },
    asOf: 1_700_000_000_000,
  };

  it("converts totals, cards and the liabilities card", () => {
    const out = portfolioSummaryInCurrency(summary, USD);
    expect(out.totalAssets).toBeCloseTo(117_000);
    expect(out.totalLiabilities).toBeCloseTo(17_550);
    expect(out.netWorth).toBeCloseTo(99_450);
    expect(out.totalAssets - out.totalLiabilities).toBeCloseTo(out.netWorth);
    expect(out.totalCostBasis).toBeCloseTo(70_200);
    expect(out.costLine).toBeCloseTo(93_600);
    expect(out.unrealizedProfitLoss).toBeCloseTo(23_400);
    expect(out.unrealizedProfitLossPercent).toBe(33.3);
    expect(out.unrealizedProfitLossCoverage).toBe(0.8);
    expect(out.asOf).toBe(summary.asOf);
    expect(out.assetCategories[0].totalValue).toBeCloseTo(81_900);
    expect(out.assetCategories[0].costBasis).toBeNull();
    expect(out.assetCategories[0].holdingsCount).toBe(4);
    expect(out.liabilities?.totalBalance).toBeCloseTo(17_550);
    expect(out.liabilities?.monthlyPayment).toBeCloseTo(585);
    expect(out.liabilities?.loansCount).toBe(1);
  });

  it("keeps a missing liabilities card missing", () => {
    expect(
      portfolioSummaryInCurrency({ ...summary, liabilities: null }, USD)
        .liabilities,
    ).toBeNull();
  });

  it("is the identity at rate 1 (EUR)", () => {
    expect(portfolioSummaryInCurrency(summary, 1)).toBe(summary);
  });
});
