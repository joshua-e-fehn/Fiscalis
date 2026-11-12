import { describe, it, expect } from "vitest";

import {
  bitpandaHoldingKey,
  bitpandaTradeFlow,
  bitpandaTradeKeys,
  brokerPositionKey,
  snaptradeActivityFlow,
  tradeFlowsBetween,
  tradeTimeSpan,
  vaultLedgerFlows,
  vaultTradeFlow,
  type ToBaseOn,
} from "./flows";

const NOV_10 = Date.parse("2026-11-10T06:00:00Z");
const NOV_11 = Date.parse("2026-11-11T06:00:00Z");

/** EUR at par, USD at 0.9 EUR before Nov 11 and 0.8 from it, CHF unknown. */
const toBaseOn: ToBaseOn = (amount, currency, date) => {
  if (currency === "EUR") return amount;
  if (currency === "USD") return amount * (date < "2026-11-11" ? 0.9 : 0.8);
  return null;
};

describe("tradeFlowsBetween", () => {
  it("sums each key's trades dated after `from`, up to and including `to`", () => {
    const flows = tradeFlowsBetween(
      [
        { key: "a", date: "2026-11-10T07:00:00Z", amount: 500 },
        { key: "a", date: "2026-11-10T09:00:00Z", amount: -200 },
        { key: "b", date: "2026-11-11T06:00:00Z", amount: 50 },
        // Before the interval, and after it
        { key: "a", date: "2026-11-10T06:00:00Z", amount: 1_000 },
        { key: "c", date: "2026-11-11T06:00:01Z", amount: 70 },
      ],
      NOV_10,
      NOV_11,
    );
    expect(flows).toEqual(new Map([["a", 300], ["b", 50]]));
  });

  it("counts a date-only trade only when its whole UTC day lies in the interval", () => {
    const from = Date.parse("2026-11-10T00:00:00Z");
    const to = Date.parse("2026-11-12T00:00:00Z");
    const flows = tradeFlowsBetween(
      [
        { key: "a", date: "2026-11-10", amount: 10 },
        { key: "a", date: "2026-11-11T00:00:00Z", amount: 5 },
        { key: "b", date: "2026-11-11T00:00:00.000Z", amount: 20 },
        // The day ending at `from`, and the day starting at `to`: outside
        { key: "c", date: "2026-11-09", amount: 30 },
        { key: "c", date: "2026-11-12", amount: 40 },
      ],
      from,
      to,
    );
    expect(flows).toEqual(new Map([["a", 15], ["b", 20]]));
  });

  it("leaves out a key with a date-only trade on a snapshot's day, never a partial sum", () => {
    // Snapshots at 18:00 on consecutive days
    const from = Date.parse("2026-11-10T18:00:00Z");
    const to = Date.parse("2026-11-11T18:00:00Z");
    const flows = tradeFlowsBetween(
      [
        // Bought after the first snapshot, or before it: the date cannot say
        { key: "a", date: "2026-11-10", amount: 500 },
        { key: "a", date: "2026-11-11T09:00:00Z", amount: 200 },
        // Bought before the second snapshot, or after it
        { key: "b", date: "2026-11-11", amount: 300 },
        // A timed trade in the interval, and a date-only one long before it
        { key: "c", date: "2026-11-11T09:00:00Z", amount: 70 },
        { key: "c", date: "2026-11-09", amount: 1_000 },
      ],
      from,
      to,
    );
    expect(flows).toEqual(new Map([["c", 70]]));
  });

  it("keeps a trade that moved no money as an exact zero", () => {
    expect(
      tradeFlowsBetween([{ key: "a", date: "2026-11-10T12:00:00Z", amount: 0 }], NOV_10, NOV_11),
    ).toEqual(new Map([["a", 0]]));
  });

  it("leaves out a key with a trade of unknown amount, and unparseable dates", () => {
    const flows = tradeFlowsBetween(
      [
        { key: "a", date: "2026-11-10T12:00:00Z", amount: 500 },
        { key: "a", date: "2026-11-10T12:00:00Z", amount: null },
        { key: "b", date: "not a date", amount: 30 },
        { key: "c", date: "2026-11-10T12:00:00Z", amount: 40 },
      ],
      NOV_10,
      NOV_11,
    );
    expect(flows).toEqual(new Map([["c", 40]]));
  });
});

describe("holding keys", () => {
  it("builds the keys the net-worth loader gives broker and Bitpanda holdings", () => {
    expect(brokerPositionKey("acc1", "AAPL")).toBe("brokerPosition:acc1:AAPL");
    expect(bitpandaHoldingKey("con1", "metal", "xau")).toBe("bitpanda:con1:metal:XAU");
  });

  it("resolves a Bitpanda (connection, symbol) to the one holding key, held now or before", () => {
    const keys = bitpandaTradeKeys([
      "bitpanda:con1:crypto:BTC",
      "bitpanda:con1:metal:XAU",
      "bitpanda:con1:crypto:BTC", // the same key in both snapshots
      "bitpanda:con2:crypto:ETH",
      "bitpanda:con2:stock:ETH", // ambiguous
      "brokerPosition:acc1:AAPL",
    ]);
    expect(keys).toEqual(
      new Map([
        ["con1:BTC", "bitpanda:con1:crypto:BTC"],
        ["con1:XAU", "bitpanda:con1:metal:XAU"],
      ]),
    );
  });
});

describe("bitpandaTradeFlow", () => {
  const keys = new Map([["con1:BTC", "bitpanda:con1:crypto:BTC"]]);
  const tx = (type: string, amount: number, currency = "EUR", symbol = "btc") => ({
    connectionId: "con1",
    type,
    symbol,
    amount,
    currency,
    transactionDate: "2026-11-11T08:00:00Z",
  });

  it("counts a buy or deposit as money in and a sale or withdrawal as money out", () => {
    const at = (amount: number | null) => ({
      key: "bitpanda:con1:crypto:BTC",
      date: "2026-11-11T08:00:00Z",
      amount,
    });
    expect(bitpandaTradeFlow(tx("buy", 1_000), keys, toBaseOn)).toEqual(at(1_000));
    expect(bitpandaTradeFlow(tx("deposit", -250), keys, toBaseOn)).toEqual(at(250));
    expect(bitpandaTradeFlow(tx("sell", 600), keys, toBaseOn)).toEqual(at(-600));
    expect(bitpandaTradeFlow(tx("withdrawal", 100), keys, toBaseOn)).toEqual(at(-100));
    expect(bitpandaTradeFlow(tx("reward", 30), keys, toBaseOn)).toEqual(at(0));
  });

  it("converts at the rate of the transaction date, unknown without one", () => {
    expect(bitpandaTradeFlow(tx("buy", 1_000, "USD"), keys, toBaseOn)!.amount).toBe(800);
    expect(bitpandaTradeFlow(tx("buy", 1_000, "CHF"), keys, toBaseOn)!.amount).toBeNull();
    // No fiat amount recorded
    expect(bitpandaTradeFlow(tx("sell", 0), keys, toBaseOn)!.amount).toBeNull();
  });

  it("gives transfers and unknown types an unknown amount", () => {
    const unknown = { key: "bitpanda:con1:crypto:BTC", date: "2026-11-11T08:00:00Z", amount: null };
    expect(bitpandaTradeFlow(tx("transfer", 100), keys, toBaseOn)).toEqual(unknown);
    expect(bitpandaTradeFlow(tx("other", 100), keys, toBaseOn)).toEqual(unknown);
    expect(bitpandaTradeFlow(tx("refund", 100), keys, toBaseOn)).toEqual(unknown);
  });

  it("drops a key traded and transferred in one interval", () => {
    const flows = [
      bitpandaTradeFlow(tx("buy", 1_000), keys, toBaseOn)!,
      bitpandaTradeFlow(tx("transfer", 0), keys, toBaseOn)!,
    ];
    expect(
      tradeFlowsBetween(flows, Date.parse("2026-11-10T00:00:00Z"), Date.parse("2026-11-12T00:00:00Z")),
    ).toEqual(new Map());
  });

  it("ignores trades of a symbol without a matching holding", () => {
    expect(bitpandaTradeFlow(tx("buy", 100, "EUR", "ETH"), keys, toBaseOn)).toBeNull();
  });
});

describe("vaultTradeFlow", () => {
  const row = (
    transactionType: "buy" | "sell" | "gift_received" | "gift_given",
    pricePerUnitBase?: number,
    transactionDate: string | null = "2026-11-11",
  ) => ({ vaultItemId: "item1", transactionType, quantity: 2, pricePerUnitBase, transactionDate });

  it("counts a sale at its actual proceeds and a purchase at its price", () => {
    expect(vaultTradeFlow(row("sell", 2_450))).toEqual({
      key: "item1",
      date: "2026-11-11",
      amount: -4_900,
    });
    expect(vaultTradeFlow(row("buy", 2_500))!.amount).toBe(5_000);
    expect(vaultTradeFlow(row("gift_received", 100))!.amount).toBe(200);
    expect(vaultTradeFlow(row("gift_given", 100))!.amount).toBe(-200);
  });

  it("has no amount without a price, and no flow without a date", () => {
    expect(vaultTradeFlow(row("sell"))!.amount).toBeNull();
    expect(vaultTradeFlow(row("buy", 2_500, null))).toBeNull();
  });
});

describe("vaultLedgerFlows", () => {
  const from = Date.parse("2026-11-11T02:00:00Z");
  const to = Date.parse("2026-11-12T02:00:00Z");
  const row = (
    vaultItemId: string,
    transactionType: "buy" | "sell",
    transactionDate: string | null,
    createdAt: number,
  ) => ({ vaultItemId, transactionType, quantity: 2, pricePerUnitBase: 1_000, transactionDate, createdAt });

  it("drops an item with a backdated row written in the interval", () => {
    const rows = [
      // A sale dated today and a missed buy from 2023, both recorded today
      row("item1", "sell", "2026-11-11T10:00:00Z", Date.parse("2026-11-11T10:00:00Z")),
      row("item1", "buy", "2023-04-01", Date.parse("2026-11-11T10:05:00Z")),
      // Another item sold today, nothing backdated
      row("item2", "sell", "2026-11-11T12:00:00Z", Date.parse("2026-11-11T12:00:00Z")),
    ];
    expect(vaultLedgerFlows(rows, from, to)).toContainEqual({
      key: "item1",
      date: "2026-11-12T01:59:59.999Z",
      amount: null,
    });
    expect(tradeFlowsBetween(vaultLedgerFlows(rows, from, to), from, to)).toEqual(
      new Map([["item2", -2_000]]),
    );
  });

  it("keeps backdated rows written before the interval, and undated rows written in it unknown", () => {
    const old = row("item1", "buy", "2023-04-01", Date.parse("2026-01-01T00:00:00Z"));
    const sale = row("item1", "sell", "2026-11-11T10:00:00Z", Date.parse("2026-11-11T10:00:00Z"));
    expect(tradeFlowsBetween(vaultLedgerFlows([old, sale], from, to), from, to)).toEqual(
      new Map([["item1", -2_000]]),
    );
    const opening = row("item1", "buy", null, Date.parse("2026-11-11T09:00:00Z"));
    expect(tradeFlowsBetween(vaultLedgerFlows([opening, sale], from, to), from, to)).toEqual(
      new Map(),
    );
  });
});

describe("snaptradeActivityFlow", () => {
  const activity = (type: string, extra: Record<string, unknown> = {}) => ({
    accountId: "acc1",
    type,
    symbol: "AAPL",
    amount: -1_000,
    currency: "USD",
    tradeDate: "2026-11-10T00:00:00Z",
    ...extra,
  });

  it("counts a BUY as money in and a SELL as money out at the trade date's rate", () => {
    expect(snaptradeActivityFlow(activity("BUY"), toBaseOn)).toEqual({
      key: "brokerPosition:acc1:AAPL",
      date: "2026-11-10T00:00:00Z",
      amount: 900,
    });
    expect(
      snaptradeActivityFlow(activity("SELL", { amount: 1_200, tradeDate: "2026-11-11" }), toBaseOn)!
        .amount,
    ).toBe(-960);
  });

  it("falls back to units × price when the broker reports no amount", () => {
    expect(
      snaptradeActivityFlow(activity("BUY", { amount: 0, quantity: 3, price: 100 }), toBaseOn)!
        .amount,
    ).toBeCloseTo(270);
    expect(snaptradeActivityFlow(activity("BUY", { amount: 0 }), toBaseOn)!.amount).toBeNull();
  });

  it("treats reinvestments and splits as no flow and transfers of units as unknown", () => {
    expect(snaptradeActivityFlow(activity("REI"), toBaseOn)!.amount).toBe(0);
    expect(snaptradeActivityFlow(activity("SPLIT"), toBaseOn)!.amount).toBe(0);
    expect(
      snaptradeActivityFlow(activity("EXTERNAL_ASSET_TRANSFER_IN"), toBaseOn)!.amount,
    ).toBeNull();
  });

  it("gives option assignments, exercises, expirations and unknown types an unknown amount", () => {
    for (const type of ["OPTIONASSIGNMENT", "OPTIONEXERCISE", "OPTIONEXPIRATION", "SOMETHING_NEW"]) {
      expect(snaptradeActivityFlow(activity(type), toBaseOn)).toEqual({
        key: "brokerPosition:acc1:AAPL",
        date: "2026-11-10T00:00:00Z",
        amount: null,
      });
    }
  });

  it("ignores cash activities and activities without a symbol", () => {
    for (const type of ["DIVIDEND", "INTEREST", "FEE", "TAX", "CONTRIBUTION", "WITHDRAWAL"]) {
      expect(snaptradeActivityFlow(activity(type), toBaseOn)).toBeNull();
    }
    expect(
      snaptradeActivityFlow(activity("CONTRIBUTION", { symbol: undefined }), toBaseOn),
    ).toBeNull();
  });
});

describe("tradeTimeSpan", () => {
  it("reads a date only as its whole UTC day, a date-time as an instant", () => {
    const day = Date.parse("2026-11-11T00:00:00Z");
    for (const date of ["2026-11-11", "2026-11-11T00:00:00Z", "2026-11-11T00:00:00.000Z", "2026-11-11T00:00:00+00:00"]) {
      expect(tradeTimeSpan(date)).toEqual({ start: day, end: day + 86_400_000, dateOnly: true });
    }
    const t = Date.parse("2026-11-11T09:30:00Z");
    expect(tradeTimeSpan("2026-11-11T09:30:00Z")).toEqual({ start: t, end: t + 1, dateOnly: false });
    // Midnight in another zone is a time of day in UTC
    expect(tradeTimeSpan("2026-11-11T00:00:00+01:00")!.dateOnly).toBe(false);
    expect(tradeTimeSpan("not a date")).toBeNull();
  });
});
