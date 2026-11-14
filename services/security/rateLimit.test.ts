import { describe, expect, it } from "vitest";
import {
  USER_RATE_LIMITS,
  parseRateLimitedError,
  rateLimitMessage,
  rateLimitedError,
  retryAfterMinutes,
} from "./rateLimit";

describe("retryAfterMinutes", () => {
  it("rounds up to whole minutes", () => {
    expect(retryAfterMinutes(60_000)).toBe(1);
    expect(retryAfterMinutes(60_001)).toBe(2);
    expect(retryAfterMinutes(9.5 * 60_000)).toBe(10);
  });

  it("never says 0 minutes", () => {
    expect(retryAfterMinutes(1)).toBe(1);
    expect(retryAfterMinutes(0)).toBe(1);
    expect(retryAfterMinutes(-5)).toBe(1);
    expect(retryAfterMinutes(Number.NaN)).toBe(1);
  });
});

describe("rateLimitMessage", () => {
  it("names the wait in minutes", () => {
    expect(rateLimitMessage(4 * 60_000 + 1)).toBe(
      "Too many requests. Please try again in 5 min.",
    );
  });
});

describe("parseRateLimitedError", () => {
  it("round-trips the thrown payload", () => {
    const data = rateLimitedError("manualSync", 120_000);
    expect(parseRateLimitedError(data)).toEqual(data);
  });

  it("accepts the component's own RateLimitError shape", () => {
    expect(
      parseRateLimitedError({
        kind: "RateLimited",
        name: "providerLink",
        retryAfter: 3_000,
      }),
    ).toEqual({ kind: "RateLimited", name: "providerLink", retryAfter: 3_000 });
  });

  it("ignores other error data", () => {
    expect(parseRateLimitedError(undefined)).toBeNull();
    expect(parseRateLimitedError("RateLimited")).toBeNull();
    expect(parseRateLimitedError({ kind: "Other" })).toBeNull();
  });

  it("tolerates a missing or bad retryAfter", () => {
    expect(parseRateLimitedError({ kind: "RateLimited" })).toEqual({
      kind: "RateLimited",
      name: "",
      retryAfter: 0,
    });
  });
});

describe("USER_RATE_LIMITS", () => {
  it("lets every bucket burst at least once and refill within an hour", () => {
    for (const limit of Object.values(USER_RATE_LIMITS)) {
      expect(limit.capacity).toBeGreaterThanOrEqual(1);
      expect(limit.rate).toBeGreaterThanOrEqual(1);
      expect(limit.period / limit.rate).toBeLessThanOrEqual(60 * 60_000);
    }
  });
});
