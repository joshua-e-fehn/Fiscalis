import { describe, it, expect } from "vitest";

import {
  aggregateNetWorth,
  buildSnapshotBreakdown,
  HOLDING_CATEGORIES,
  placeHolding,
  positionOwed,
  toHoldingCategory,
  type NormalizedHolding,
} from "./aggregate";
import { loanMonthlyPaymentInBase } from "./categorySummary";
import { fxRatesFromDaily } from "../finance/currency";
import { snapshotCostLine } from "./unrealizedProfitLoss";

let seq = 0;
function holding(
  h: Partial<NormalizedHolding> &
    Pick<NormalizedHolding, "source" | "category" | "valueBase">,
): NormalizedHolding {
  seq += 1;
  return {
    id: `h${seq}`,
    provider:
      h.source === "bank"
        ? "plaid"
        : h.source === "bitpanda"
          ? "bitpanda"
          : h.source === "vault" || h.source === "loan"
            ? "manual"
            : "snaptrade",
    subcategory: "unknown",
    name: `Holding ${seq}`,
    costBase: null,
    pricedAt: null,
    ...h,
  };
}

const holdings: NormalizedHolding[] = [
  // Bank: a current account and a credit card
  holding({ source: "bank", category: "cash", subcategory: "checking-accounts", valueBase: 2_000, pricedAt: 1_000 }),
  holding({ source: "bank", category: "liabilities", subcategory: "credit-cards", valueBase: 500, pricedAt: 1_000 }),
  // A card with a credit balance: money owed to the user
  holding({ source: "bank", category: "liabilities", subcategory: "credit-cards", valueBase: -40, pricedAt: 1_000 }),
  // Broker positions, including commodities, real estate and unclassified
  holding({ source: "brokerPosition", category: "equities", subcategory: "stocks", valueBase: 1_012, costBase: 920, pricedAt: 900 }),
  holding({ source: "brokerPosition", category: "commodities", subcategory: "metals", valueBase: 200, costBase: 150, pricedAt: 900 }),
  holding({ source: "brokerPosition", category: "real-estate", subcategory: "reits", valueBase: 300, costBase: 320, pricedAt: 900 }),
  holding({ source: "brokerPosition", category: "unclassified", valueBase: 60, pricedAt: 900 }),
  holding({ source: "brokerAccount", category: "cash", subcategory: "broker-cash", valueBase: 100, pricedAt: 900 }),
  holding({ source: "brokerAccount", category: "liabilities", subcategory: "margin-loans", valueBase: 70, pricedAt: 900 }),
  // Bitpanda: crypto and metals, no cost basis
  holding({ source: "bitpanda", category: "crypto", subcategory: "coins", valueBase: 9_000, pricedAt: 1_100 }),
  holding({ source: "bitpanda", category: "commodities", subcategory: "metals", valueBase: 800, pricedAt: 1_100 }),
  // Vault: one item with, one without a purchase price
  holding({ source: "vault", category: "commodities", subcategory: "metals", valueBase: 1_200, costBase: 1_000, pricedAt: 1_050 }),
  holding({ source: "vault", category: "commodities", subcategory: "metals", valueBase: 5_000 }),
  // A loan: no pricedAt, a monthly payment
  holding({ source: "loan", category: "liabilities", subcategory: "loans", valueBase: 10_000, monthlyPaymentBase: 250 }),
];

describe("toHoldingCategory", () => {
  it("keeps known categories and files the rest as unclassified", () => {
    expect(toHoldingCategory("real-estate")).toBe("real-estate");
    expect(toHoldingCategory("liabilities")).toBe("liabilities");
    expect(toHoldingCategory(undefined)).toBe("unclassified");
    expect(toHoldingCategory("other")).toBe("unclassified");
  });
});

describe("placeHolding", () => {
  it("counts a negative amount owed as a cash asset", () => {
    expect(
      placeHolding(holding({ source: "bank", category: "liabilities", valueBase: -40 })),
    ).toEqual({ category: "cash", subcategory: "credit-balance", value: 40 });
    expect(
      placeHolding(holding({ source: "loan", category: "liabilities", subcategory: "loans", valueBase: 5 })),
    ).toEqual({ category: "liabilities", subcategory: "loans", value: 5 });
  });
});

describe("positionOwed", () => {
  it("counts a liability position as debt whatever its sign", () => {
    // Negative cash, and a positive position overridden to liabilities
    expect(positionOwed(-300)).toBe(300);
    expect(positionOwed(10_000)).toBe(10_000);
    const overridden = holding({
      source: "brokerPosition",
      category: "liabilities",
      valueBase: positionOwed(10_000),
    });
    expect(placeHolding(overridden)).toMatchObject({ category: "liabilities", value: 10_000 });
    const a = aggregateNetWorth([overridden]);
    expect(a.totalLiabilities).toBe(10_000);
    expect(a.netWorth).toBe(-10_000);
  });
});

describe("aggregateNetWorth", () => {
  const a = aggregateNetWorth(holdings);

  it("covers every category, including empty ones", () => {
    expect(Object.keys(a.byCategory).sort()).toEqual([...HOLDING_CATEGORIES].sort());
    expect(a.byCategory.collectibles).toMatchObject({ value: 0, count: 0, costBasis: null });
  });

  it("buckets broker commodities, real estate and unclassified rows by their own category", () => {
    expect(a.byCategory.equities.value).toBe(1_012);
    expect(a.byCategory["real-estate"]).toMatchObject({ value: 300, costBasis: 320, profitLoss: -20 });
    expect(a.byCategory.unclassified).toMatchObject({ value: 60, count: 1 });
  });

  it("keeps vault, Bitpanda and broker metals apart by source", () => {
    const c = a.byCategory.commodities;
    expect(c.value).toBe(200 + 800 + 1_200 + 5_000);
    expect(c.bySource).toEqual({ brokerPosition: 200, bitpanda: 800, vault: 6_200 });
    // Cost covers only the holdings with one
    expect(c.costBasis).toBe(1_150);
    expect(c.coveredValue).toBe(1_400);
    expect(c.profitLoss).toBe(250);
  });

  it("sums liabilities as amounts owed, a credit balance as cash", () => {
    expect(a.byCategory.liabilities.value).toBe(500 + 70 + 10_000);
    expect(a.byCategory.liabilities.costBasis).toBeNull();
    expect(a.byCategory.liabilities.bySubcategory["credit-cards"]).toMatchObject({ count: 1, value: 500 });
    expect(a.byCategory.cash.value).toBe(2_000 + 40 + 100);
    expect(a.byCategory.cash.bySubcategory["credit-balance"].value).toBe(40);
    expect(a.totalLiabilities).toBe(10_570);
  });

  it("totals assets over every asset category", () => {
    const assets = 2_140 + 1_012 + 300 + 60 + 9_000 + 7_200;
    expect(a.totalAssets).toBe(assets);
    expect(a.netWorth).toBe(assets - 10_570);
  });

  it("computes unrealised P/L over cost-covered holdings only", () => {
    expect(a.unrealized.costBasis).toBe(920 + 150 + 320 + 1_000);
    expect(a.unrealized.profitLoss).toBe(92 + 50 - 20 + 200);
  });

  it("reports loan payments and data freshness", () => {
    expect(a.monthlyLoanPayment).toBe(250);
    expect(a.loansCount).toBe(1);
    // The credit card and the margin debit; not the loan, not the credit balance
    expect(a.liabilityAccountsCount).toBe(2);
    // The oldest priced holding; the loan and the unpriced vault item have none
    expect(a.asOf).toBe(900);
    expect(aggregateNetWorth([]).asOf).toBeNull();
  });
});

describe("buildSnapshotBreakdown", () => {
  const b = buildSnapshotBreakdown(aggregateNetWorth(holdings));

  it("lists asset categories with value, cost, covered value and sources", () => {
    expect(b.categoryBreakdown.map((c) => c.category)).toEqual([
      "cash",
      "equities",
      "crypto",
      "commodities",
      "real-estate",
      "unclassified",
    ]);
    const commodities = b.categoryBreakdown.find((c) => c.category === "commodities")!;
    expect(commodities).toMatchObject({ value: 7_200, costBasis: 1_150, coveredValue: 1_400 });
    expect(commodities.sources).toEqual([
      { source: "brokerPosition", value: 200 },
      { source: "bitpanda", value: 800 },
      { source: "vault", value: 6_200 },
    ]);
    expect(commodities.value - snapshotCostLine(commodities)!).toBe(250);
    expect(b.categoryBreakdown.find((c) => c.category === "crypto")).not.toHaveProperty("costBasis");
  });

  it("sums cost totals over the categories that have a cost basis", () => {
    expect(b.totalCostBasis).toBe(920 + 1_150 + 320);
    expect(b.totalCoveredValue).toBe(1_012 + 1_400 + 300);
  });

  it("leaves the cost totals undefined when nothing has a cost basis", () => {
    expect(buildSnapshotBreakdown(aggregateNetWorth([]))).toEqual({
      categoryBreakdown: [],
      totalCostBasis: undefined,
      totalCoveredValue: undefined,
    });
  });
});

describe("loanMonthlyPaymentInBase", () => {
  const rates = fxRatesFromDaily([
    { date: "2026-11-10", currency: "CHF", unitsPerEur: 0.94 },
  ]);
  const loan = { scheduledPayment: 300, currency: "EUR", status: "active" };

  it("normalises the payment by its frequency", () => {
    expect(loanMonthlyPaymentInBase({ ...loan, paymentFrequency: "MONTHLY" }, rates)).toBe(300);
    expect(loanMonthlyPaymentInBase({ ...loan, paymentFrequency: "QUARTERLY" }, rates)).toBe(100);
    expect(loanMonthlyPaymentInBase({ ...loan, paymentFrequency: "SEMI_ANNUAL" }, rates)).toBe(50);
    expect(loanMonthlyPaymentInBase({ ...loan, paymentFrequency: "ANNUAL" }, rates)).toBe(25);
  });

  it("converts by the loan's currency and skips loans that do not count", () => {
    expect(
      loanMonthlyPaymentInBase({ ...loan, currency: "CHF", paymentFrequency: "MONTHLY", scheduledPayment: 94 }, rates),
    ).toBeCloseTo(100, 6);
    expect(
      loanMonthlyPaymentInBase({ ...loan, status: "paid_off", paymentFrequency: "MONTHLY" }, rates),
    ).toBe(0);
  });
});
