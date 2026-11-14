import { describe, expect, it } from "vitest";

import { summarizeSyncResult, type SyncResultCounts } from "./syncOutcome";

function result(overrides: Partial<SyncResultCounts> = {}): SyncResultCounts {
  return {
    success: true,
    plaid: { success: true, itemsSynced: 0 },
    snaptrade: { success: true, positionsProcessed: 0 },
    bitpanda: { success: true, connectionsSynced: 0 },
    ...overrides,
  };
}

describe("summarizeSyncResult", () => {
  it("lists the providers that synced something, with their counts", () => {
    expect(
      summarizeSyncResult(
        result({
          plaid: { success: true, itemsSynced: 2 },
          bitpanda: { success: true, connectionsSynced: 1 },
        }),
      ),
    ).toEqual({
      status: "success",
      synced: [
        { provider: "plaid", count: 2 },
        { provider: "bitpanda", count: 1 },
      ],
    });
  });

  it("reports success with nothing synced when every provider was empty", () => {
    expect(summarizeSyncResult(result())).toEqual({
      status: "success",
      synced: [],
    });
  });

  it("is partial when some providers synced and others failed", () => {
    expect(
      summarizeSyncResult(
        result({
          success: false,
          plaid: { success: false, itemsSynced: 0, error: "boom" },
          snaptrade: { success: true, positionsProcessed: 12 },
        }),
      ),
    ).toEqual({
      status: "partial",
      synced: [{ provider: "snaptrade", count: 12 }],
      failed: ["plaid"],
    });
  });

  it("is an error when nothing synced", () => {
    expect(
      summarizeSyncResult(
        result({
          success: false,
          snaptrade: { success: false, positionsProcessed: 0, error: "x" },
          bitpanda: { success: false, connectionsSynced: 0, error: "y" },
        }),
      ),
    ).toEqual({ status: "error", failed: ["snaptrade", "bitpanda"] });
  });

  it("does not count a successful provider with nothing synced as failed", () => {
    expect(summarizeSyncResult(result({ success: false }))).toEqual({
      status: "error",
      failed: [],
    });
  });
});
