import { describe, expect, it } from "vitest";

import {
  DISPLAY_CURRENCIES,
  fromEur,
  isDisplayCurrency,
  rateOn,
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
