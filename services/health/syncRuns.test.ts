import { describe, expect, it } from "vitest";
import {
  itemsOutcome,
  monitorSecretMatches,
  safeSyncCode,
  summarizeSyncRuns,
  syncErrorCode,
  SYNC_DIGEST_WINDOW_MS,
  SYNC_RUN_STUCK_MS,
  type SyncRunRow,
} from "./syncRuns";

describe("syncErrorCode", () => {
  it("prefers a user error's code", () => {
    expect(syncErrorCode({ data: { code: "snaptradeSyncFailed" }, message: "x" })).toBe(
      "snaptradeSyncFailed",
    );
  });

  it("reads Plaid's error_code from an axios error, never the message", () => {
    const error = {
      message: "Request failed access-sandbox-abc123",
      response: {
        status: 400,
        data: { error_code: "ITEM_LOGIN_REQUIRED", error_message: "secret=hunter2" },
      },
      config: { headers: { "PLAID-SECRET": "s3cr3t" } },
    };
    expect(syncErrorCode(error)).toBe("ITEM_LOGIN_REQUIRED");
  });

  it("falls back to the HTTP status", () => {
    expect(syncErrorCode({ status: 503, message: "down" })).toBe("http_503");
    expect(syncErrorCode({ response: { status: 429 } })).toBe("http_429");
  });

  it("reads transport codes, also on cause", () => {
    expect(syncErrorCode({ code: "ECONNRESET" })).toBe("ECONNRESET");
    const fetchFailed = new TypeError("fetch failed");
    (fetchFailed as { cause?: unknown }).cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
    expect(syncErrorCode(fetchFailed)).toBe("UND_ERR_CONNECT_TIMEOUT");
  });

  it("maps timeouts and unknowns", () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    expect(syncErrorCode(timeout)).toBe("timeout");
    expect(syncErrorCode(new Error("Something with token=abc"))).toBe("unknown");
    expect(syncErrorCode("a string")).toBe("unknown");
    expect(syncErrorCode(null)).toBe("unknown");
  });

  it("rejects a code that could carry free text", () => {
    expect(syncErrorCode({ data: { code: "has spaces in it" } })).toBe("unknown");
    expect(syncErrorCode({ response: { data: { error_code: "x".repeat(65) } } })).toBe(
      "unknown",
    );
    expect(safeSyncCode("Bearer abc def")).toBeUndefined();
    expect(safeSyncCode(42)).toBeUndefined();
  });
});

describe("itemsOutcome", () => {
  it("is a success without failures", () => {
    expect(itemsOutcome(3, 0)).toEqual({ status: "success" });
    expect(itemsOutcome(0, 0)).toEqual({ status: "success" });
  });
  it("is partial when some synced, failed when none did", () => {
    expect(itemsOutcome(2, 1, "http_500")).toEqual({ status: "partial", errorCode: "http_500" });
    expect(itemsOutcome(0, 2)).toEqual({ status: "failed", errorCode: "unknown" });
  });
});

describe("summarizeSyncRuns", () => {
  const now = Date.UTC(2026, 10, 15, 7, 30);
  const run = (over: Partial<SyncRunRow>): SyncRunRow => ({
    provider: "plaid",
    userId: "user-a",
    trigger: "scheduled",
    startedAt: now - 60 * 60 * 1000,
    endedAt: now - 59 * 60 * 1000,
    status: "success",
    ...over,
  });

  it("counts per provider and never returns user ids", () => {
    const digest = summarizeSyncRuns(
      [
        run({}),
        run({ userId: "user-b", status: "failed", errorCode: "ITEM_LOGIN_REQUIRED" }),
        run({ userId: "user-b", status: "failed", errorCode: "ITEM_LOGIN_REQUIRED", trigger: "manual" }),
        run({ userId: "user-c", status: "partial", errorCode: "http_500" }),
        run({ provider: "bitpanda", status: "success" }),
      ],
      now,
    );
    expect(digest.runs).toBe(5);
    expect(digest.problems).toBe(3);
    expect(digest.providers.map((p) => p.provider)).toEqual(["plaid", "bitpanda"]);
    const plaid = digest.providers[0];
    expect(plaid).toMatchObject({
      runs: 4,
      succeeded: 1,
      failed: 2,
      partial: 1,
      scheduledFailed: 1,
      usersAffected: 2,
      topErrorCodes: [
        { code: "ITEM_LOGIN_REQUIRED", count: 2 },
        { code: "http_500", count: 1 },
      ],
      lastSuccessAt: now - 59 * 60 * 1000,
    });
    expect(JSON.stringify(digest)).not.toContain("user-");
  });

  it("only reads the window", () => {
    const digest = summarizeSyncRuns(
      [run({ startedAt: now - SYNC_DIGEST_WINDOW_MS - 1, status: "failed" })],
      now,
    );
    expect(digest.runs).toBe(0);
    expect(digest.providers).toEqual([]);
  });

  it("counts a long-running run as stuck, a fresh one not at all", () => {
    const digest = summarizeSyncRuns(
      [
        run({ status: "running", endedAt: undefined, startedAt: now - SYNC_RUN_STUCK_MS - 1 }),
        run({ status: "running", endedAt: undefined, startedAt: now - 60_000 }),
      ],
      now,
    );
    expect(digest.problems).toBe(1);
    expect(digest.providers[0]).toMatchObject({
      stuck: 1,
      topErrorCodes: [{ code: "stuck", count: 1 }],
      lastSuccessAt: null,
    });
  });

  it("passes truncation through", () => {
    expect(summarizeSyncRuns([], now, { truncated: true }).truncated).toBe(true);
  });
});

describe("monitorSecretMatches", () => {
  const secret = "a".repeat(48);
  it("matches only the configured secret", async () => {
    expect(await monitorSecretMatches(secret, secret)).toBe(true);
    expect(await monitorSecretMatches(secret + "b", secret)).toBe(false);
    expect(await monitorSecretMatches("", secret)).toBe(false);
    expect(await monitorSecretMatches(null, secret)).toBe(false);
  });
  it("refuses when no strong secret is configured", async () => {
    expect(await monitorSecretMatches("", "")).toBe(false);
    expect(await monitorSecretMatches(undefined, undefined)).toBe(false);
    expect(await monitorSecretMatches("short", "short")).toBe(false);
  });
});
