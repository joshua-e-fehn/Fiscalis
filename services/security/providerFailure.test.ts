import { describe, expect, it, vi } from "vitest";

import {
  classifyProviderFailure,
  parseRetryAfter,
  retryDelayMs,
  withRetry,
} from "./providerFailure";
import {
  BITPANDA_REAUTH_MESSAGE,
  BITPANDA_TRANSIENT_MESSAGE,
  bitpandaFailureStatus,
  snaptradeFailureStatus,
} from "./connectionStatus";

/** A Bitpanda client error: the HTTP status sits on the error. */
function statusError(status: number) {
  return Object.assign(new Error(`Bitpanda API error ${status}`), { status });
}

/** An axios error as the SnapTrade SDK throws it. */
function axiosError(status?: number, code?: string) {
  return Object.assign(new Error("Request failed"), {
    name: "AxiosError",
    code,
    response: status === undefined ? undefined : { status },
  });
}

describe("classifyProviderFailure", () => {
  it("treats only 401 and 403 as a rejected credential", () => {
    expect(classifyProviderFailure(statusError(401))).toBe("needs_reauth");
    expect(classifyProviderFailure(statusError(403))).toBe("needs_reauth");
    expect(classifyProviderFailure(axiosError(401))).toBe("needs_reauth");
  });

  it("treats rate limits, timeouts and 5xx as transient", () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(classifyProviderFailure(statusError(status))).toBe("transient");
    }
    expect(classifyProviderFailure(axiosError(503))).toBe("transient");
  });

  it("treats other 4xx as permanent", () => {
    expect(classifyProviderFailure(statusError(400))).toBe("permanent");
    expect(classifyProviderFailure(statusError(404))).toBe("permanent");
    expect(classifyProviderFailure(statusError(422))).toBe("permanent");
  });

  it("treats AbortSignal.timeout and network failures as transient", () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    expect(classifyProviderFailure(timeout)).toBe("transient");
    expect(classifyProviderFailure(axiosError(undefined, "ECONNABORTED"))).toBe("transient");
    expect(classifyProviderFailure(axiosError(undefined, "ETIMEDOUT"))).toBe("transient");
    // undici: TypeError("fetch failed") with the socket error as cause
    const fetchFailed = new TypeError("fetch failed", {
      cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
    });
    expect(classifyProviderFailure(fetchFailed)).toBe("transient");
  });

  it("treats code bugs and unknown values as permanent", () => {
    expect(classifyProviderFailure(new TypeError("x is undefined"))).toBe("permanent");
    expect(classifyProviderFailure("boom")).toBe("permanent");
    expect(classifyProviderFailure(null)).toBe("permanent");
  });
});

describe("bitpandaFailureStatus", () => {
  it("asks for a new key only on 401/403", () => {
    expect(bitpandaFailureStatus(statusError(401))).toEqual({
      status: "needs_reauth",
      errorMessage: BITPANDA_REAUTH_MESSAGE,
    });
  });

  it("keeps the key on a transient failure", () => {
    expect(bitpandaFailureStatus(statusError(503))).toEqual({
      status: "transient_error",
      errorMessage: BITPANDA_TRANSIENT_MESSAGE,
    });
    expect(
      bitpandaFailureStatus(Object.assign(new Error("timeout"), { name: "TimeoutError" })).status,
    ).toBe("transient_error");
  });

  it("reports anything else as an error with its message", () => {
    expect(bitpandaFailureStatus(statusError(400))).toEqual({
      status: "error",
      errorMessage: "Bitpanda API error 400",
    });
  });
});

describe("snaptradeFailureStatus", () => {
  it("maps a parsed SnapTrade error to a connection status", () => {
    expect(snaptradeFailureStatus({ requiresReauth: true, isRetryable: false })).toBe(
      "reauth_required",
    );
    expect(snaptradeFailureStatus({ requiresReauth: false, isRetryable: true })).toBe(
      "transient_error",
    );
    expect(snaptradeFailureStatus({ requiresReauth: false, isRetryable: false })).toBe("error");
  });
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(parseRetryAfter("Sat, 14 Nov 2026 12:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("Sat, 14 Nov 2026 11:59:00 GMT", now)).toBe(0);
  });

  it("ignores missing or unreadable values", () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});

describe("retryDelayMs", () => {
  it("doubles from the initial delay, honours Retry-After, and caps", () => {
    expect(retryDelayMs(1, 500, 8000)).toBe(500);
    expect(retryDelayMs(3, 500, 8000)).toBe(2000);
    expect(retryDelayMs(1, 500, 8000, 3000)).toBe(3000);
    expect(retryDelayMs(1, 500, 8000, 60000)).toBe(8000);
    expect(retryDelayMs(10, 500, 8000)).toBe(8000);
  });
});

describe("withRetry", () => {
  const noSleep = () => Promise.resolve();

  it("retries transient failures, then succeeds", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(statusError(503))
      .mockRejectedValueOnce(statusError(429))
      .mockResolvedValue("ok");
    const sleep = vi.fn(noSleep);
    await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  it("does not retry a rejected credential and rethrows it unchanged", async () => {
    const error = statusError(401);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(error);
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries with the last error", async () => {
    const last = statusError(502);
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(statusError(503))
      .mockRejectedValue(last);
    await expect(withRetry(fn, { maxRetries: 1, sleep: noSleep })).rejects.toBe(last);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("uses a custom retry predicate and requested delay", async () => {
    const fn = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("retry me"))
      .mockResolvedValue(1);
    const sleep = vi.fn(noSleep);
    const onRetry = vi.fn();
    await withRetry(fn, {
      shouldRetry: () => true,
      retryAfterMs: () => 4000,
      onRetry,
      sleep,
    });
    expect(sleep).toHaveBeenCalledWith(4000);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 4000);
  });
});
