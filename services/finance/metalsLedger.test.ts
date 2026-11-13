import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LedgerError,
  type LedgerTransaction,
  type ToBaseAmount,
  itemProjection,
  ledgerHoldings,
  ledgerOverCounts,
  missingOpeningTransaction,
  nextOpeningQuantity,
  replayLedger,
  retainedBasePrice,
  saleProfitLoss,
  sortLedger,
  sumSaleProfitLoss,
  transactionTotals,
  transactionUnitAmount,
  validateTransactionInput,
} from "./metalsLedger";
import { TROY_OUNCE_GRAMS, summarizeMetalItems } from "./metals";
import { ContinuousPerformanceStrategy } from "../performance/strategies/continuous";
import type { PricePoint } from "../performance/types";

const eurOnly: ToBaseAmount = (amount, currency) =>
  currency.toUpperCase() === "EUR" ? amount : null;
const withUsd: ToBaseAmount = (amount, currency) =>
  currency === "USD" ? amount * 0.5 : currency === "EUR" ? amount : null;

const buy = (
  quantity: number,
  pricePerUnit: number | null,
  transactionDate: string | null,
  currency = "EUR",
): LedgerTransaction => ({
  transactionType: "buy",
  quantity,
  pricePerUnit,
  currency,
  transactionDate,
});
const sell = (
  quantity: number,
  pricePerUnit: number,
  transactionDate: string,
  currency = "EUR",
): LedgerTransaction => ({
  transactionType: "sell",
  quantity,
  pricePerUnit,
  currency,
  transactionDate,
});

describe("replayLedger", () => {
  it("averages the cost of several buys and realizes a sale against it", () => {
    const ledger = replayLedger(
      [
        buy(10, 100, "2025-01-10"),
        buy(10, 200, "2025-03-10"),
        sell(5, 180, "2025-06-01"),
      ],
      eurOnly,
    );
    expect(ledger.quantity).toBe(15);
    expect(ledger.averageCost).toBe(150);
    expect(ledger.costBasis).toBe(2250);
    // 5 × (180 − 150)
    expect(ledger.realizedProfitLoss).toBe(150);
    expect(ledger.soldCost).toBe(750);
    expect(ledger.realizedComplete).toBe(true);
  });

  it("realizes per item in ledger order, not insertion order", () => {
    const ledger = replayLedger(
      [sell(5, 180, "2025-06-01"), buy(10, 100, "2025-01-10")],
      eurOnly,
    );
    expect(ledger.quantity).toBe(5);
    expect(ledger.realizedProfitLoss).toBe(400);
  });

  it("rejects a sale of more than is held at that date", () => {
    expect(() =>
      replayLedger([buy(2, 100, "2025-06-02"), sell(1, 100, "2025-06-01")], eurOnly),
    ).toThrow(LedgerError);
  });

  it("converts mixed currencies to EUR", () => {
    const ledger = replayLedger(
      [buy(2, 200, "2025-01-01", "USD"), sell(1, 150, "2025-02-01", "EUR")],
      withUsd,
    );
    // cost 2 × 100 EUR; sale 150 − 100
    expect(ledger.averageCost).toBe(100);
    expect(ledger.realizedProfitLoss).toBe(50);
  });

  it("uses the EUR price stored at write time, not today's rate", () => {
    // USD 2,000 bought at 1.10 USD/EUR: EUR 1,818.18 whatever the rate now
    const bought = { ...buy(1, 2000, "2025-01-01", "USD"), pricePerUnitBase: 2000 / 1.1 };
    const atParity: ToBaseAmount = (amount) => amount;
    const ledger = replayLedger([bought], atParity);
    expect(ledger.averageCost).toBeCloseTo(1818.18, 2);
    expect(transactionUnitAmount(bought, atParity)).toBeCloseTo(1818.18, 2);
    // Older rows without one fall back to the replay's conversion
    expect(transactionUnitAmount(buy(1, 2000, null, "USD"), withUsd)).toBe(1000);
  });

  it("keeps an unknown opening cost unknown until sold out", () => {
    const ledger = replayLedger(
      [buy(3, null, null), buy(1, 100, "2025-01-01"), sell(4, 120, "2025-02-01")],
      eurOnly,
    );
    expect(ledger.quantity).toBe(0);
    expect(ledger.realizedComplete).toBe(false);
    expect(ledger.costBasis).toBe(0);
    const again = replayLedger(
      [buy(3, null, null), sell(3, 120, "2025-02-01"), buy(1, 90, "2025-03-01")],
      eurOnly,
    );
    expect(again.averageCost).toBe(90);
  });

  it("removes average cost on a gift given without realizing", () => {
    const ledger = replayLedger(
      [
        buy(4, 100, "2025-01-01"),
        { transactionType: "gift_given", quantity: 1, pricePerUnit: 0, currency: "EUR", transactionDate: "2025-02-01" },
      ],
      eurOnly,
    );
    expect(ledger.quantity).toBe(3);
    expect(ledger.costBasis).toBe(300);
    expect(ledger.realizedProfitLoss).toBe(0);
    // A gift moves value, not money: its flow is its value that day
    expect(ledger.lots[1]).toEqual({
      timestamp: Date.parse("2025-02-01"),
      quantity: -1,
      flowPricePerUnit: null,
      costPerUnit: 100,
      costLine: { knownCost: -100, unknownQuantity: 0 },
    });
  });

  it("dates undated opening balances before everything else", () => {
    const sorted = sortLedger([buy(1, 1, "2020-01-01"), buy(2, 1, null)]);
    expect(sorted[0].quantity).toBe(2);
  });
});

describe("validateTransactionInput", () => {
  it("rejects non-positive quantities and negative prices", () => {
    expect(() => validateTransactionInput({ quantity: 0 })).toThrow(LedgerError);
    expect(() => validateTransactionInput({ quantity: -5 })).toThrow(LedgerError);
    expect(() => validateTransactionInput({ quantity: 1, pricePerUnit: -1 })).toThrow(
      LedgerError,
    );
    expect(() =>
      validateTransactionInput({ quantity: 1, transactionDate: "not a date" }),
    ).toThrow(LedgerError);
    expect(() =>
      validateTransactionInput({ quantity: 1, pricePerUnit: 0, transactionDate: null }),
    ).not.toThrow();
  });

  it("requires a date except on an opening balance, and none in the future", () => {
    const now = Date.UTC(2026, 10, 11, 12);
    expect(() =>
      validateTransactionInput({ quantity: 1, transactionDate: "" }, { requireDate: true }),
    ).toThrow("date is required");
    expect(() =>
      validateTransactionInput({ quantity: 1, transactionDate: "2026-11-20" }, { now }),
    ).toThrow("future");
    // Tomorrow in UTC is still today east of it
    expect(() =>
      validateTransactionInput(
        { quantity: 1, transactionDate: "2026-11-12" },
        { requireDate: true, now },
      ),
    ).not.toThrow();
    expect(() => validateTransactionInput({ quantity: 1 }, { now })).not.toThrow();
  });
});

describe("missingOpeningTransaction", () => {
  it("backfills the quantity the ledger does not account for", () => {
    const opening = missingOpeningTransaction(
      { quantity: 7, purchasePricePerUnit: 50, purchaseDate: "2024-05-01" },
      [sell(3, 60, "2025-06-01")],
    );
    expect(opening).toEqual({
      transactionType: "buy",
      quantity: 10,
      pricePerUnit: 50,
      currency: "EUR",
      transactionDate: "2024-05-01",
      isOpening: true,
    });
  });

  it("leaves the opening undated without a purchase date (D3)", () => {
    const opening = missingOpeningTransaction({ quantity: 2 }, []);
    expect(opening?.transactionDate).toBeNull();
    expect(opening?.pricePerUnit).toBeNull();
  });

  it("does not date the opening after a recorded transaction", () => {
    const opening = missingOpeningTransaction(
      { quantity: 1, purchaseDate: "2025-09-01" },
      [sell(1, 10, "2025-06-01")],
    );
    expect(opening?.transactionDate).toBeNull();
  });

  it("flags transactions that add up to more than the cached quantity", () => {
    expect(ledgerOverCounts({ quantity: 5 }, [buy(10, 1, "2025-01-01")])).toBe(true);
    expect(ledgerOverCounts({ quantity: 10 }, [buy(10, 1, "2025-01-01")])).toBe(false);
  });

  it("is null when the ledger already matches", () => {
    expect(
      missingOpeningTransaction({ quantity: 10 }, [buy(10, 1, "2025-01-01")]),
    ).toBeNull();
  });
});

describe("itemProjection", () => {
  it("caches quantity and average cost in EUR", () => {
    const ledger = replayLedger([buy(2, 10, null), buy(2, 20, null)], eurOnly);
    expect(itemProjection(ledger)).toEqual({
      quantity: 4,
      purchasePricePerUnit: 15,
      purchaseCurrency: "EUR",
    });
  });
});

describe("saleProfitLoss", () => {
  it("uses the average cost of the units sold", () => {
    expect(saleProfitLoss(150, 2, 180)).toEqual({
      proceeds: 360,
      costBasis: 300,
      profitLoss: 60,
      profitLossPercent: 20,
    });
    expect(saleProfitLoss(null, 2, 180).profitLoss).toBeNull();
  });

  it("sums several sales, unknown when any cost is", () => {
    const sum = sumSaleProfitLoss([saleProfitLoss(100, 1, 110), saleProfitLoss(50, 2, 40)]);
    expect(sum.profitLoss).toBe(-10);
    expect(sumSaleProfitLoss([saleProfitLoss(null, 1, 1)]).profitLoss).toBeNull();
  });
});

describe("summarizeMetalItems with realized P/L", () => {
  const item = (marketValue: number, totalCost: number | null, realized: number | null, soldCost = 0) => ({
    metalType: "gold",
    fineWeightGrams: 1,
    quantity: 1,
    marketValue,
    meltValue: marketValue,
    totalCost,
    realizedProfitLoss: realized,
    soldCost,
  });

  it("adds realized to unrealized for the total", () => {
    const s = summarizeMetalItems([item(150, 100, 30, 60)]);
    expect(s.unrealizedProfitLoss).toBe(50);
    expect(s.realizedProfitLoss).toBe(30);
    expect(s.totalProfitLoss).toBe(80);
    // 80 over 100 held + 60 sold
    expect(s.totalProfitLossPercent).toBe(50);
  });

  it("keeps the realized P/L of a sold-out vault", () => {
    const s = summarizeMetalItems([item(0, 0, 25, 100)]);
    expect(s.totalProfitLoss).toBe(25);
    expect(s.realizedProfitLoss).toBe(25);
    expect(s.unrealizedProfitLoss).toBe(0);
    expect(s.unrealizedProfitLossPercent).toBeNull();
  });

  it("is unknown when a sale's cost is unknown", () => {
    const s = summarizeMetalItems([item(150, 100, null)]);
    expect(s.realizedProfitLoss).toBeNull();
    expect(s.totalProfitLoss).toBeNull();
  });
});

describe("ledger lots in the continuous strategy", () => {
  const NOW = Date.UTC(2026, 5, 15, 12);
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  /** Flat price of 1 €/oz-unit: one ounce of fine metal is worth 100 €. */
  const flat = (): PricePoint[] => {
    const points: PricePoint[] = [];
    for (let t = Date.UTC(2025, 11, 1); t <= NOW; t += 86_400_000) {
      points.push({ timestamp: t, price: 100 });
    }
    return points;
  };
  const item = {
    id: "coin",
    metalType: "gold",
    fineWeightGrams: TROY_OUNCE_GRAMS,
    sellPremium: 0,
  };

  it("holds 10 since last year, sells 5 in March at a flat price: no gain", () => {
    const ledger = replayLedger(
      [buy(10, 100, "2025-06-01"), sell(5, 100, "2026-03-01")],
      eurOnly,
    );
    const result = new ContinuousPerformanceStrategy().calculate(
      { holdings: ledgerHoldings(item, ledger.lots), prices: { gold: flat() }, currency: "eur" },
      { timeRange: "YTD", includeDataPoints: true },
    );
    expect(result.metrics.startValue).toBeCloseTo(1000);
    expect(result.metrics.endValue).toBeCloseTo(500);
    expect(result.metrics.netFlows).toBeCloseTo(-500);
    expect(result.metrics.profitLoss).toBeCloseTo(0);
    // The cost line drops by the average cost of what was sold
    const last = result.dataPoints[result.dataPoints.length - 1];
    expect(last.costBasis).toBeCloseTo(500);
  });

  it("keeps a sold-out item's past value", () => {
    const ledger = replayLedger(
      [buy(2, 50, null), sell(2, 100, "2026-03-01")],
      eurOnly,
    );
    const result = new ContinuousPerformanceStrategy().calculate(
      { holdings: ledgerHoldings(item, ledger.lots), prices: { gold: flat() }, currency: "eur" },
      { timeRange: "YTD" },
    );
    expect(result.metrics.startValue).toBeCloseTo(200);
    expect(result.metrics.endValue).toBeCloseTo(0);
    expect(result.metrics.profitLoss).toBeCloseTo(0);
  });

  it("clears an unknown-cost pool from the cost line once sold out", () => {
    // Unknown-cost opening of 1, a buy of 1 at 100, both sold at 150 each
    const ledger = replayLedger(
      [buy(1, null, null), buy(1, 100, "2026-02-01"), sell(2, 150, "2026-04-01")],
      eurOnly,
    );
    expect(ledger.lots.map((l) => l.costLine)).toEqual([
      { knownCost: 0, unknownQuantity: 1 },
      { knownCost: 100, unknownQuantity: 0 },
      { knownCost: -100, unknownQuantity: -1 },
    ]);
    const result = new ContinuousPerformanceStrategy().calculate(
      { holdings: ledgerHoldings(item, ledger.lots), prices: { gold: flat() }, currency: "eur" },
      { timeRange: "YTD", includeDataPoints: true },
    );
    const at = (date: string) =>
      result.dataPoints.find((p) => p.timestamp >= Date.parse(date))!;
    // Held: the known 100 plus the unknown unit at its value (100)
    expect(at("2026-03-01").costBasis).toBeCloseTo(200);
    // Sold out: nothing is left on the cost line
    const last = result.dataPoints[result.dataPoints.length - 1];
    expect(last.value).toBeCloseTo(0);
    expect(last.costBasis).toBeCloseTo(0);
  });

  it("removes a partial sale's share of a mixed pool", () => {
    const ledger = replayLedger(
      [buy(2, null, null), buy(2, 50, "2026-02-01"), sell(1, 150, "2026-04-01")],
      eurOnly,
    );
    expect(ledger.lots[2].costLine).toEqual({ knownCost: -25, unknownQuantity: -0.5 });
    const result = new ContinuousPerformanceStrategy().calculate(
      { holdings: ledgerHoldings(item, ledger.lots), prices: { gold: flat() }, currency: "eur" },
      { timeRange: "YTD", includeDataPoints: true },
    );
    const last = result.dataPoints[result.dataPoints.length - 1];
    // 3 held: known 75 plus 1.5 unknown-cost units at 100
    expect(last.value).toBeCloseTo(300);
    expect(last.costBasis).toBeCloseTo(225);
  });

  it("treats an undated opening as held before the range (D3)", () => {
    const ledger = replayLedger([buy(3, null, null)], eurOnly);
    const result = new ContinuousPerformanceStrategy().calculate(
      { holdings: ledgerHoldings(item, ledger.lots), prices: { gold: flat() }, currency: "eur" },
      { timeRange: "YTD" },
    );
    expect(result.metrics.startValue).toBeCloseTo(300);
    expect(result.metrics.netFlows ?? 0).toBeCloseTo(0);
  });
});

describe("ledgerHoldings in another currency (PF-13)", () => {
  const item = { id: "coin", metalType: "gold", fineWeightGrams: TROY_OUNCE_GRAMS, sellPremium: 0 };
  const rates = { eurToUsd: 2, eurToChf: 0.5 };

  it("keeps EUR lots as they are", () => {
    const ledger = replayLedger([buy(2, 100, "2026-02-01")], eurOnly);
    const [lot] = ledgerHoldings(item, ledger.lots);
    expect(lot.purchaseCurrency).toBe("EUR");
    expect(lot.purchasePricePerUnit).toBe(100);
    expect(lot.costPerUnit).toBe(100);
    expect(lot.costLine).toEqual({ knownCost: 200, unknownQuantity: 0 });
  });

  it("converts each lot's price and cost into the series currency", () => {
    const ledger = replayLedger(
      [buy(1, null, null), buy(1, 100, "2026-02-01"), sell(1, 150, "2026-04-01")],
      eurOnly,
    );
    const lots = ledgerHoldings(item, ledger.lots, { currency: "usd", rates });
    expect(lots.map((l) => l.purchaseCurrency)).toEqual(["USD", "USD", "USD"]);
    expect(lots.map((l) => l.purchasePricePerUnit)).toEqual([undefined, 200, 300]);
    expect(lots.map((l) => l.costLine)).toEqual([
      { knownCost: 0, unknownQuantity: 1 },
      { knownCost: 200, unknownQuantity: 0 },
      // Half the pool (100 € known, 1 unit unknown) leaves
      { knownCost: -100, unknownQuantity: -0.5 },
    ]);
    const chf = ledgerHoldings(item, ledger.lots, { currency: "CHF", rates });
    expect(chf[1].costLine).toEqual({ knownCost: 50, unknownQuantity: 0 });
    expect(chf[1].costPerUnit).toBe(50);
  });

  it("leaves the cost unknown without a rate, never in EUR", () => {
    const ledger = replayLedger([buy(2, 100, "2026-02-01")], eurOnly);
    const [lot] = ledgerHoldings(item, ledger.lots, {
      currency: "USD",
      rates: { eurToUsd: null, eurToChf: 0.5 },
    });
    expect(lot.purchaseCurrency).toBe("USD");
    expect(lot.purchasePricePerUnit).toBeUndefined();
    expect(lot.costPerUnit).toBeNull();
    expect(lot.costLine).toBeUndefined();
  });
});

describe("transactionTotals (M-C5)", () => {
  const rates = { eurToUsd: 2, eurToChf: 0.5 };
  const txs = [
    // EUR buy: 2 × 100 €
    { ...buy(2, 100, "2026-01-05"), pricePerUnitBase: 100 },
    // USD buy stored at 50 € per unit on its date: 1 × 120 $
    { ...buy(1, 120, "2026-02-05", "USD"), pricePerUnitBase: 50 },
    // EUR sale: 1 × 150 €
    { ...sell(1, 150, "2026-03-05"), pricePerUnitBase: 150 },
    // Opening balance of unknown cost
    buy(3, null, null),
  ];

  it("sums EUR rows and converts the others' EUR price", () => {
    expect(transactionTotals(txs, "eur", rates)).toEqual({
      totalBought: 250,
      totalSold: 150,
      buyCount: 3,
      sellCount: 1,
      notConverted: 0,
      unknownCost: 1,
    });
  });

  it("takes a row in the display currency at its own price", () => {
    // 200 € × 2 + 120 $ (own price) ; sale 150 € × 2
    expect(transactionTotals(txs, "usd", rates)).toMatchObject({
      totalBought: 520,
      totalSold: 300,
      notConverted: 0,
    });
  });

  it("converts an older row without an EUR price from its own currency", () => {
    const older = [buy(1, 100, "2026-01-05", "USD")];
    expect(transactionTotals(older, "CHF", rates).totalBought).toBe(25);
  });

  it("counts rows without a rate instead of mixing currencies", () => {
    const noUsd = { eurToUsd: null, eurToChf: 0.5 };
    expect(transactionTotals(txs, "usd", noUsd)).toEqual({
      totalBought: 120,
      totalSold: 0,
      buyCount: 3,
      sellCount: 1,
      notConverted: 2,
      unknownCost: 1,
    });
  });
});

describe("retainedBasePrice", () => {
  const opening = {
    pricePerUnit: 200,
    currency: "USD",
    transactionDate: null,
    pricePerUnitBase: 180,
  };

  it("keeps the stored EUR price on a quantity-only edit", () => {
    expect(
      retainedBasePrice(opening, { pricePerUnit: 200, currency: "usd", transactionDate: undefined }),
    ).toBe(180);
  });

  it("converts again when the price, currency or date changes", () => {
    expect(retainedBasePrice(opening, { ...opening, pricePerUnit: 210 })).toBeUndefined();
    expect(retainedBasePrice(opening, { ...opening, currency: "CHF" })).toBeUndefined();
    expect(
      retainedBasePrice(opening, { ...opening, transactionDate: "2025-01-01" }),
    ).toBeUndefined();
  });

  it("converts when no EUR price was stored", () => {
    expect(
      retainedBasePrice({ ...opening, pricePerUnitBase: undefined }, opening),
    ).toBeUndefined();
  });
});

describe("nextOpeningQuantity", () => {
  it("sets the opening directly, independent of the total held", () => {
    // Opening 5 → 7 saved, held 10 → 12; a second edit to 9 stays 9
    expect(nextOpeningQuantity(7, { openingQuantity: 9, held: 12 })).toBe(9);
  });

  it("moves the opening by the change in total held", () => {
    expect(nextOpeningQuantity(5, { quantity: 12, held: 10 })).toBe(7);
  });

  it("keeps the opening when neither is given", () => {
    expect(nextOpeningQuantity(5, { held: 10 })).toBe(5);
  });

  it("rejects both at once", () => {
    expect(() =>
      nextOpeningQuantity(5, { openingQuantity: 6, quantity: 12, held: 10 }),
    ).toThrow(LedgerError);
  });
});
