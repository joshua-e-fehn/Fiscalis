import { describe, it, expect } from "vitest";

import {
  aggregateNetWorth,
  buildSnapshotBreakdown,
  isFlowAdjustedCategory,
  liabilityCountsLabel,
  categoryFlowFromHoldings,
  collapseIntradaySnapshots,
  holdingNetFlow,
  snapshotCategoryFlow,
  providerSyncSnapshot,
  snapshotPartial,
  withoutSnapshotHoldings,
  HOLDING_CATEGORIES,
  placeHolding,
  positionOwed,
  toHoldingCategory,
  type NormalizedHolding,
  type SnapshotCategoryEntry,
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
  const b = buildSnapshotBreakdown(aggregateNetWorth(holdings), holdings);

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
    expect(commodities.sources!.map(({ source, value }) => ({ source, value }))).toEqual([
      { source: "brokerPosition", value: 200 },
      { source: "bitpanda", value: 800 },
      { source: "vault", value: 6_200 },
    ]);
    expect(commodities).not.toHaveProperty("netFlow");
    expect(commodities.value - snapshotCostLine(commodities)!).toBe(250);
    expect(b.categoryBreakdown.find((c) => c.category === "crypto")).not.toHaveProperty("costBasis");
  });

  it("records each source's cost and the value it covers", () => {
    const commodities = b.categoryBreakdown.find((c) => c.category === "commodities")!;
    expect(
      commodities.sources!.map(({ source, costBasis, coveredValue }) => ({
        source,
        costBasis,
        coveredValue,
      })),
    ).toEqual([
      { source: "brokerPosition", costBasis: 150, coveredValue: 200 },
      { source: "bitpanda", costBasis: undefined, coveredValue: 0 },
      { source: "vault", costBasis: 1_000, coveredValue: 1_200 },
    ]);
    // The sources add up to the category
    const sum = (k: "costBasis" | "coveredValue") =>
      commodities.sources!.reduce((t, s) => t + (s[k] ?? 0), 0);
    expect(sum("costBasis")).toBe(commodities.costBasis);
    expect(sum("coveredValue")).toBe(commodities.coveredValue);
  });

  it("keeps the holdings of flow-adjusted categories only, with their cost", () => {
    const by = (c: string) => b.categoryBreakdown.find((e) => e.category === c)!;
    const vault = by("commodities").sources!.find((s) => s.source === "vault")!;
    expect(vault.holdings!.map(({ value, cost }) => ({ value, cost }))).toEqual([
      { value: 1_200, cost: 1_000 },
      { value: 5_000, cost: undefined },
    ]);
    expect(by("cash").sources!.every((s) => s.holdings === undefined)).toBe(true);
    expect(by("unclassified").sources!.every((s) => s.holdings === undefined)).toBe(true);
  });

  it("strips the holdings for readers", () => {
    const stripped = withoutSnapshotHoldings(b.categoryBreakdown);
    expect(stripped.every((c) => c.sources!.every((s) => !("holdings" in s)))).toBe(true);
    expect(stripped.map((c) => c.value)).toEqual(b.categoryBreakdown.map((c) => c.value));
  });

  it("sums cost totals over the categories that have a cost basis", () => {
    expect(b.totalCostBasis).toBe(920 + 1_150 + 320);
    expect(b.totalCoveredValue).toBe(1_012 + 1_400 + 300);
  });

  it("keeps a worthless category that has a cost, drops an empty one", () => {
    const hs = [
      holding({ source: "brokerPosition", category: "equities", valueBase: 0, costBase: 8_000 }),
      holding({ source: "bitpanda", category: "crypto", valueBase: 0 }),
      holding({ source: "bank", category: "cash", valueBase: 100 }),
    ];
    const r = buildSnapshotBreakdown(aggregateNetWorth(hs), hs);
    expect(r.categoryBreakdown.map((c) => c.category)).toEqual(["cash", "equities"]);
    const equities = r.categoryBreakdown.find((c) => c.category === "equities")!;
    expect(equities).toMatchObject({ value: 0, costBasis: 8_000, coveredValue: 0 });
    expect(equities.value - snapshotCostLine(equities)!).toBe(-8_000);
    expect(r.totalCostBasis).toBe(8_000);
  });

  it("leaves the cost totals undefined when nothing has a cost basis", () => {
    expect(buildSnapshotBreakdown(aggregateNetWorth([]), [])).toEqual({
      categoryBreakdown: [],
      totalCostBasis: undefined,
      totalCoveredValue: undefined,
    });
  });
});

describe("holdingNetFlow", () => {
  const h = (value: number, cost?: number, native?: { amount: number; currency: string }) => ({
    key: "k",
    value,
    ...(cost !== undefined && { cost }),
    ...(native && { costNative: native.amount, currency: native.currency }),
  });

  it("counts a purchase at its cost and a price move as no flow", () => {
    // Bought 500 worth at cost 500, and the old holding rose by 100
    expect(holdingNetFlow(h(1_000, 800), h(1_600, 1_300))).toEqual({ amount: 500, estimated: false });
    expect(holdingNetFlow(h(1_000, 800), h(1_100, 800))).toEqual({ amount: 0, estimated: false });
  });

  it("estimates a sale's proceeds at the previous value of the share sold", () => {
    // Half of a holding worth 1 000 (cost 800) sold: cost falls by 400
    expect(holdingNetFlow(h(1_000, 800), h(500, 400)).amount).toBeCloseTo(-500);
  });

  it("treats a holding that appears or disappears as money in or out at value", () => {
    expect(holdingNetFlow(undefined, h(700, 300))).toEqual({ amount: 700, estimated: false });
    expect(holdingNetFlow(h(700), undefined)).toEqual({ amount: -700, estimated: false });
  });

  it("never takes an exchange rate move for a purchase or sale", () => {
    // $10k cost, $12k value; EURUSD 1.10 → 1.00: the EUR cost rises by 909
    const usd = { amount: 10_000, currency: "USD" };
    expect(holdingNetFlow(h(12_000 / 1.1, 10_000 / 1.1, usd), h(12_000, 10_000, usd)))
      .toEqual({ amount: 0, estimated: false });
    // $1k bought: converted at today's rate
    expect(
      holdingNetFlow(
        h(12_000 / 1.1, 10_000 / 1.1, usd),
        h(13_200, 11_000, { amount: 11_000, currency: "USD" }),
      ),
    ).toEqual({ amount: 1_000, estimated: false });
  });

  it("assumes no flow, flagged, when one end has no cost basis", () => {
    expect(holdingNetFlow(h(1_000), h(1_200))).toEqual({ amount: 0, estimated: true });
    // First costed (trades synced after the holdings): not a sale of the gain
    expect(holdingNetFlow(h(5_000), h(5_000, 3_000))).toEqual({ amount: 0, estimated: true });
  });
});

describe("snapshot flows", () => {
  const position = (
    key: string,
    valueBase: number,
    costBase: number | null,
    extra: Partial<NormalizedHolding> = {},
  ) =>
    holding({
      key,
      source: key.startsWith("bp") ? "bitpanda" : "brokerPosition",
      category: "equities",
      valueBase,
      costBase,
      ...extra,
    });
  const write = (hs: NormalizedHolding[], previous?: SnapshotCategoryEntry[]) =>
    buildSnapshotBreakdown(aggregateNetWorth(hs), hs, previous).categoryBreakdown;
  const equitiesOf = (breakdown: SnapshotCategoryEntry[]) =>
    breakdown.find((e) => e.category === "equities");

  it("records each entry's flow since the previous snapshot when writing", () => {
    const previous = write([position("aapl", 1_000, 900)]);
    const breakdown = write(
      [
        position("aapl", 1_550, 1_400),
        holding({ key: "btc", source: "bitpanda", category: "crypto", valueBase: 200 }),
      ],
      previous,
    );
    const by = (c: string) => breakdown.find((e) => e.category === c)!;
    expect(by("equities").netFlow).toBe(500);
    expect(by("crypto").netFlow).toBe(200);
    expect(by("equities")).not.toHaveProperty("netFlowEstimated");
    expect(by("equities").sources![0]).toMatchObject({ netFlow: 500 });
  });

  it("matches holdings across syncs by key, not by document id", () => {
    const previous = write([position("aapl", 1_000, 900)]);
    // The sync replaced the document: a new id, the same key
    const breakdown = write([position("aapl", 1_100, 900)], previous);
    expect(equitiesOf(breakdown)!.netFlow).toBe(0);
  });

  it("never compares a row written before flows existed with a new one", () => {
    // A production row: category cost, no per-source cost or holdings.
    // Equities = SnapTrade 5 000 (cost 4 000) + Bitpanda 10 000 (no cost)
    const now = [position("aapl", 5_000, 4_000), position("bp-tsla", 10_000, null)];
    for (const old of [
      { category: "equities", value: 15_000, costBasis: 4_000 },
      { category: "equities", value: 15_000, costBasis: 4_000, coveredValue: 5_000 },
      {
        category: "equities",
        value: 15_000,
        costBasis: 4_000,
        coveredValue: 5_000,
        sources: [
          { source: "brokerPosition", value: 5_000 },
          { source: "bitpanda", value: 10_000 },
        ],
      },
    ]) {
      const cur = equitiesOf(write(now, [old]))!;
      expect(cur).not.toHaveProperty("netFlow");
      expect(snapshotCategoryFlow(old, cur)).toEqual({ amount: 0, estimated: true });
    }
  });

  it("counts a newly costed holding as a reclassification, not a flow", () => {
    // Bitpanda's trades synced after its holdings: 5 000 first costed at 3 000
    const previous = write([position("aapl", 5_000, 4_000), position("bp-btc", 5_000, null)]);
    const cur = equitiesOf(
      write([position("aapl", 5_000, 4_000), position("bp-btc", 5_000, 3_000)], previous),
    )!;
    expect(cur.netFlow).toBe(0);
    expect(cur.netFlowEstimated).toBe(true);
  });

  it("flags the flow estimated when a holding without cost moves", () => {
    const previous = write([position("aapl", 5_000, 4_000), position("aapl-2", 1_000, null, { source: "brokerPosition" })]);
    const cur = equitiesOf(
      write([position("aapl", 5_000, 4_000), position("aapl-2", 1_300, null, { source: "brokerPosition" })], previous),
    )!;
    expect(cur.netFlow).toBe(0);
    expect(cur.netFlowEstimated).toBe(true);
  });

  it("derives a foreign-currency position's flow from its native cost", () => {
    const usd = (value: number, cost: number, native: number) =>
      position("msft", value, cost, { costNative: { amount: native, currency: "USD" } });
    const previous = write([usd(12_000 / 1.1, 10_000 / 1.1, 10_000)]);
    const cur = equitiesOf(write([usd(12_000, 10_000, 10_000)], previous))!;
    expect(cur.netFlow).toBe(0);
  });

  it("leaves excluded sources out of the stored flow", () => {
    const metal = (key: string, source: "vault" | "bitpanda", value: number, cost: number) =>
      holding({ key, source, category: "commodities", valueBase: value, costBase: cost });
    const previous = write([metal("coin", "vault", 1_000, 900), metal("xau", "bitpanda", 500, 400)]);
    const cur = write(
      [
        metal("coin", "vault", 1_050, 900),
        metal("bar", "vault", 1_000, 1_000),
        metal("xau", "bitpanda", 520, 400),
        holding({ key: "gld", source: "brokerPosition", category: "commodities", valueBase: 300 }),
      ],
      previous,
    );
    const p = previous.find((e) => e.category === "commodities");
    const c = cur.find((e) => e.category === "commodities");
    expect(snapshotCategoryFlow(p, c)).toEqual({ amount: 1_300, estimated: false });
    expect(snapshotCategoryFlow(p, c, new Set(["vault"]))).toEqual({ amount: 300, estimated: false });
    // An excluded source that disappeared: its last value went out
    const gone = write([metal("xau", "bitpanda", 520, 400)], cur);
    expect(
      snapshotCategoryFlow(c, gone.find((e) => e.category === "commodities"), new Set(["vault"])),
    ).toEqual({ amount: -300, estimated: false });
  });

  it("estimates rows without a stored flow from values alone", () => {
    const prev = { category: "crypto", value: 1_000, sources: [{ source: "bitpanda", value: 1_000 }] };
    const cur = {
      category: "crypto",
      value: 1_700,
      sources: [
        { source: "bitpanda", value: 1_200 },
        { source: "brokerPosition", value: 500 },
      ],
    };
    // The new account came in at its value; Bitpanda's move is assumed a gain
    expect(snapshotCategoryFlow(prev, cur)).toEqual({ amount: 500, estimated: true });
    expect(categoryFlowFromHoldings(prev, cur)).toBeNull();
  });

  describe("exact flows from trade logs", () => {
    const writeExact = (
      hs: NormalizedHolding[],
      previous: SnapshotCategoryEntry[],
      exact: Map<string, number>,
    ) => buildSnapshotBreakdown(aggregateNetWorth(hs), hs, previous, exact).categoryBreakdown;
    const coin = (value: number, cost: number) =>
      holding({ key: "coin", source: "vault", category: "commodities", valueBase: value, costBase: cost });
    const commodities = (b: SnapshotCategoryEntry[]) => b.find((e) => e.category === "commodities")!;

    it("takes a sale's actual proceeds instead of the previous value", () => {
      // Half of a coin holding worth 2 000 (cost 1 600) sold for 1 100
      const previous = write([coin(2_000, 1_600)]);
      expect(commodities(write([coin(1_050, 800)], previous)).netFlow).toBe(-1_000);
      const cur = commodities(writeExact([coin(1_050, 800)], previous, new Map([["coin", -1_100]])));
      expect(cur.netFlow).toBe(-1_100);
      expect(cur).not.toHaveProperty("netFlowEstimated");
      expect(cur.sources![0]).toMatchObject({ source: "vault", netFlow: -1_100 });
    });

    it("makes a traded holding without cost basis exact, others keep the proxy", () => {
      const previous = write([position("aapl", 5_000, 4_000), position("bp-btc", 1_000, null)]);
      const cur = equitiesOf(
        writeExact(
          [position("aapl", 5_600, 4_500), position("bp-btc", 1_450, null)],
          previous,
          new Map([["bp-btc", 400]]),
        ),
      )!;
      // aapl: cost +500 (proxy); bp-btc: 400 bought (exact), 50 gained
      expect(cur.netFlow).toBe(900);
      expect(cur).not.toHaveProperty("netFlowEstimated");
      // Without the trade log, bp-btc's flow is assumed 0 and flagged
      const proxy = equitiesOf(
        write([position("aapl", 5_600, 4_500), position("bp-btc", 1_450, null)], previous),
      )!;
      expect(proxy).toMatchObject({ netFlow: 500, netFlowEstimated: true });
    });

    it("counts a holding sold out at its proceeds and a new one at its value", () => {
      const previous = write([position("aapl", 5_000, 4_000)]);
      const cur = equitiesOf(
        writeExact(
          [position("msft", 3_050, 3_000)],
          previous,
          new Map([["aapl", -5_200], ["msft", 3_000]]),
        ),
      )!;
      // aapl: -5 200 (exact proceeds); msft: +3 050 (appeared, full value)
      expect(cur.netFlow).toBe(-2_150);
    });

    it("counts a new holding at its full value despite a smaller exact buy", () => {
      // A newly connected account: a BTC position worth 20 000 whose trade
      // log in the interval holds only a 50 savings-plan buy
      const previous = write([position("aapl", 5_000, 4_000)]);
      const cur = equitiesOf(
        writeExact(
          [position("aapl", 5_000, 4_000), position("btc", 20_000, null)],
          previous,
          new Map([["btc", 50]]),
        ),
      )!;
      expect(cur.netFlow).toBe(20_000);
      expect(cur).not.toHaveProperty("netFlowEstimated");
    });

    it("ignores flows of keys held in neither snapshot", () => {
      const previous = write([position("aapl", 5_000, 4_000)]);
      const cur = equitiesOf(
        writeExact([position("aapl", 5_100, 4_000)], previous, new Map([["gone", 700]])),
      )!;
      expect(cur.netFlow).toBe(0);
    });

    it("keeps the proxy for a holding that changed category", () => {
      const previous = write([position("aapl", 5_000, 4_000), position("msft", 1_000, 900)]);
      const breakdown = writeExact(
        [position("aapl", 5_500, 4_500, { category: "bonds" }), position("msft", 1_000, 900)],
        previous,
        new Map([["aapl", 500]]),
      );
      // Out of equities at its last value, into bonds at its value now
      expect(equitiesOf(breakdown)!.netFlow).toBe(-5_000);
      expect(breakdown.find((e) => e.category === "bonds")!.netFlow).toBe(5_500);
    });
  });

  it("flow-adjusts the investment categories only", () => {
    expect(["equities", "crypto", "commodities", "collectibles"].every(isFlowAdjustedCategory)).toBe(true);
    expect(["cash", "liabilities", "unclassified"].some(isFlowAdjustedCategory)).toBe(false);
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

describe("collapseIntradaySnapshots", () => {
  const row = (id: string, userId: string, date: string, timestamp: number) => ({
    id,
    userId,
    date,
    timestamp,
  });

  it("keeps the newest row per user per day and drops the rest", () => {
    const rows = [
      row("a1", "u1", "2026-11-10", 1_000),
      row("a2", "u1", "2026-11-10", 3_000),
      row("a3", "u1", "2026-11-10", 2_000),
      row("b1", "u1", "2026-11-11", 5_000),
      row("c1", "u2", "2026-11-10", 1_500),
      row("c2", "u2", "2026-11-10", 900),
    ];
    const { keep, drop } = collapseIntradaySnapshots(rows);
    expect(keep.map((r) => r.id)).toEqual(["a2", "b1", "c1"]);
    expect(drop.map((r) => r.id)).toEqual(["a1", "a3", "c2"]);
  });

  it("keeps the later row on a timestamp tie", () => {
    const { keep, drop } = collapseIntradaySnapshots([
      row("x", "u1", "2026-11-10", 1_000),
      row("y", "u1", "2026-11-10", 1_000),
    ]);
    expect(keep.map((r) => r.id)).toEqual(["y"]);
    expect(drop.map((r) => r.id)).toEqual(["x"]);
  });

  it("drops nothing when every day has one row", () => {
    const rows = [
      row("a", "u1", "2026-11-10", 1_000),
      row("b", "u1", "2026-11-11", 2_000),
    ];
    expect(collapseIntradaySnapshots(rows)).toEqual({ keep: rows, drop: [] });
  });
});

describe("providerSyncSnapshot", () => {
  it("takes an untagged snapshot when nothing failed", () => {
    expect(providerSyncSnapshot(3, 0)).toEqual({
      take: true,
      partial: undefined,
    });
    expect(providerSyncSnapshot(0, 0)).toEqual({
      take: true,
      partial: undefined,
    });
  });

  it("tags the snapshot partial when only some items failed", () => {
    expect(providerSyncSnapshot(2, 1)).toEqual({ take: true, partial: true });
  });

  it("takes no snapshot when every item failed", () => {
    expect(providerSyncSnapshot(0, 2)).toEqual({
      take: false,
      partial: undefined,
    });
  });
});

describe("snapshotPartial", () => {
  it("keeps a partial row partial on a manual or single-provider write", () => {
    expect(snapshotPartial(true, undefined)).toBe(true);
  });

  it("lets a full sync set or clear the flag", () => {
    expect(snapshotPartial(true, false)).toBeUndefined();
    expect(snapshotPartial(undefined, true)).toBe(true);
    expect(snapshotPartial(false, true)).toBe(true);
  });

  it("leaves a complete or new row unflagged on a manual write", () => {
    expect(snapshotPartial(undefined, undefined)).toBeUndefined();
    expect(snapshotPartial(false, undefined)).toBeUndefined();
  });
});

describe("liabilityCountsLabel", () => {
  it("shows loans when there are no liability accounts", () => {
    expect(liabilityCountsLabel(0, 2)).toBe("2 loans");
  });

  it("joins accounts and loans, each pluralised", () => {
    expect(liabilityCountsLabel(1, 1)).toBe("1 account · 1 loan");
    expect(liabilityCountsLabel(3, 0)).toBe("3 accounts");
  });

  it("is null when there is nothing to count", () => {
    expect(liabilityCountsLabel(0, 0)).toBeNull();
  });
});
