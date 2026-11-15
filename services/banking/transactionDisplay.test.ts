import { describe, expect, it } from "vitest";
import {
  normalizeDateRange,
  signedTransactionAmount,
  transactionCurrency,
  transactionDirection,
} from "./transactionDisplay";

describe("transactionDirection / signedTransactionAmount", () => {
  it("reads a positive Plaid amount as money out", () => {
    expect(transactionDirection(12.5)).toBe("debit");
    expect(signedTransactionAmount(12.5)).toBe(-12.5);
  });

  it("reads a negative Plaid amount as money in", () => {
    expect(transactionDirection(-2000)).toBe("credit");
    expect(signedTransactionAmount(-2000)).toBe(2000);
  });

  it("keeps zero unsigned", () => {
    expect(Object.is(signedTransactionAmount(0), 0)).toBe(true);
  });
});

describe("transactionCurrency", () => {
  it("prefers the transaction, then the account, then XXX", () => {
    expect(transactionCurrency("USD", "EUR")).toBe("USD");
    expect(transactionCurrency(undefined, "EUR")).toBe("EUR");
    expect(transactionCurrency(undefined, undefined)).toBe("XXX");
  });
});

describe("normalizeDateRange", () => {
  it("drops empty or malformed bounds", () => {
    expect(normalizeDateRange("", "2026-13")).toEqual({
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("swaps a reversed range", () => {
    expect(normalizeDateRange("2026-11-10", "2026-11-01")).toEqual({
      startDate: "2026-11-01",
      endDate: "2026-11-10",
    });
  });
});
