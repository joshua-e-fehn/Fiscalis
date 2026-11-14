import { describe, expect, it, vi } from "vitest";
import {
  bitpandaSyncCutoff,
  chunk,
  collectSyncPages,
  mergeSyncPages,
  newestDate,
  pageReachesCutoff,
  toPlaidTransactionRecord,
  type FetchedSyncPage,
} from "./transactionSync";

type Txn = { plaidTransactionId: string; amount: number };
const txn = (id: string, amount = 1): Txn => ({
  plaidTransactionId: id,
  amount,
});

describe("toPlaidTransactionRecord", () => {
  it("maps currency, legacy category and merchant", () => {
    expect(
      toPlaidTransactionRecord("item-1", {
        transaction_id: "t1",
        account_id: "a1",
        amount: 12.5,
        iso_currency_code: "EUR",
        date: "2026-11-01",
        name: "REWE 123",
        merchant_name: "REWE",
        category: ["Shops", "Supermarkets"],
        pending: false,
      }),
    ).toEqual({
      itemId: "item-1",
      accountId: "a1",
      plaidTransactionId: "t1",
      amount: 12.5,
      currency: "EUR",
      date: "2026-11-01",
      name: "REWE 123",
      merchantName: "REWE",
      category: "Shops, Supermarkets",
      pending: false,
    });
  });

  it("falls back to the unofficial currency and the personal finance category", () => {
    const record = toPlaidTransactionRecord("i", {
      transaction_id: "t",
      account_id: "a",
      amount: -3,
      iso_currency_code: null,
      unofficial_currency_code: "BTC",
      date: "2026-11-02",
      name: null,
      merchant_name: null,
      category: null,
      personal_finance_category: { primary: "INCOME" },
      pending: true,
    });
    expect(record.currency).toBe("BTC");
    expect(record.category).toBe("INCOME");
    expect(record.name).toBe("");
    expect(record.merchantName).toBeUndefined();
  });

  it("leaves currency unset when Plaid sends neither code", () => {
    const record = toPlaidTransactionRecord("i", {
      transaction_id: "t",
      account_id: "a",
      amount: 1,
      date: "2026-11-02",
      name: "x",
      pending: false,
    });
    expect(record.currency).toBeUndefined();
  });
});

describe("mergeSyncPages", () => {
  it("lets a later page win for the same id", () => {
    const result = mergeSyncPages<Txn>([
      { added: [txn("a", 1), txn("b")], modified: [], removed: [] },
      { added: [], modified: [txn("a", 2)], removed: ["b"] },
    ]);
    expect(result.upserts).toEqual([txn("a", 2)]);
    expect(result.removed).toEqual(["b"]);
  });

  it("un-removes a transaction added again later", () => {
    const result = mergeSyncPages<Txn>([
      { added: [], modified: [], removed: ["a"] },
      { added: [txn("a")], modified: [], removed: [] },
    ]);
    expect(result.upserts).toEqual([txn("a")]);
    expect(result.removed).toEqual([]);
  });
});

describe("chunk", () => {
  it("splits into bounded batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it("rejects a non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("collectSyncPages", () => {
  const page = (
    nextCursor: string,
    hasMore: boolean,
    extra: Partial<FetchedSyncPage<Txn>> = {},
  ): FetchedSyncPage<Txn> => ({
    added: [],
    modified: [],
    removed: [],
    nextCursor,
    hasMore,
    accountIds: [],
    ...extra,
  });

  it("follows has_more and returns the last cursor", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page("c1", true, { accountIds: ["a"] }))
      .mockResolvedValueOnce(
        page("c2", false, { accountIds: ["a", "b"], updateStatus: "DONE" }),
      );
    const result = await collectSyncPages<Txn>(fetchPage, undefined, {
      isRestartError: () => false,
    });
    expect(fetchPage.mock.calls).toEqual([[undefined], ["c1"]]);
    expect(result.nextCursor).toBe("c2");
    expect(result.updateStatus).toBe("DONE");
    expect(result.accountIds).toEqual(["a", "b"]);
    expect(result.pages).toHaveLength(2);
  });

  it("restarts from the start cursor on a mid-pagination mutation", async () => {
    const restart = new Error("mutation");
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page("c1", true, { added: [txn("x")] }))
      .mockRejectedValueOnce(restart)
      .mockResolvedValueOnce(page("c9", false, { added: [txn("y")] }));
    const result = await collectSyncPages<Txn>(fetchPage, "start", {
      isRestartError: (e) => e === restart,
    });
    expect(fetchPage.mock.calls).toEqual([["start"], ["c1"], ["start"]]);
    expect(result.pages.map((p) => p.added)).toEqual([[txn("y")]]);
    expect(result.nextCursor).toBe("c9");
  });

  it("rethrows other errors and gives up after maxRestarts", async () => {
    const other = new Error("boom");
    await expect(
      collectSyncPages<Txn>(() => Promise.reject(other), undefined, {
        isRestartError: () => false,
      }),
    ).rejects.toBe(other);

    const fetchPage = vi.fn(() => Promise.reject(other));
    await expect(
      collectSyncPages<Txn>(fetchPage, undefined, {
        isRestartError: () => true,
        maxRestarts: 2,
      }),
    ).rejects.toBe(other);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});

describe("bitpandaSyncCutoff", () => {
  it("is undefined without a stored date", () => {
    expect(bitpandaSyncCutoff(undefined)).toBeUndefined();
    expect(bitpandaSyncCutoff("not a date")).toBeUndefined();
  });

  it("starts the overlap window before the newest stored date", () => {
    expect(bitpandaSyncCutoff("2026-11-15T10:00:00.000Z", 14)).toBe(
      "2026-11-01T10:00:00.000Z",
    );
  });
});

describe("pageReachesCutoff", () => {
  const cutoff = "2026-11-01T00:00:00.000Z";

  it("ends on a newest-first page entirely before the cutoff", () => {
    expect(
      pageReachesCutoff(["2026-10-30T00:00:00Z", "2026-10-01T00:00:00Z"], cutoff),
    ).toBe(true);
  });

  it("keeps going while a page reaches into the window", () => {
    expect(
      pageReachesCutoff(["2026-11-02T00:00:00Z", "2026-10-01T00:00:00Z"], cutoff),
    ).toBe(false);
  });

  it("never ends on an oldest-first page, an empty page or bad dates", () => {
    expect(
      pageReachesCutoff(["2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"], cutoff),
    ).toBe(false);
    expect(pageReachesCutoff([], cutoff)).toBe(false);
    expect(pageReachesCutoff(["?"], cutoff)).toBe(false);
  });
});

describe("newestDate", () => {
  it("returns the newest parseable date as given", () => {
    expect(
      newestDate(["2026-01-01T00:00:00Z", "x", "2026-03-01T00:00:00+01:00"]),
    ).toBe("2026-03-01T00:00:00+01:00");
    expect(newestDate([])).toBeUndefined();
  });
});
