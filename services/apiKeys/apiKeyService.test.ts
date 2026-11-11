import { describe, it, expect } from "vitest";

import {
  API_KEY_LENGTH,
  API_KEY_PREFIX,
  API_KEY_RANDOM_BYTES,
  apiKeyDisplayPrefix,
  computeApiKeyExpiry,
  consumeRateLimit,
  formatApiKey,
  generateApiKey,
  hashApiKey,
  isApiKeyUsable,
  isWellFormedApiKey,
  normalizeApiKeyName,
  parseBearerApiKey,
} from "./apiKeyService";

const bytes = (fill: number) => new Uint8Array(API_KEY_RANDOM_BYTES).fill(fill);

describe("formatApiKey / generateApiKey", () => {
  it("produces a prefixed base64url key of fixed length", () => {
    const key = formatApiKey(bytes(0xff));
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key).toHaveLength(API_KEY_LENGTH);
    expect(key).not.toMatch(/[+/=]/);
    expect(isWellFormedApiKey(key)).toBe(true);
  });

  it("rejects the wrong amount of randomness", () => {
    expect(() => formatApiKey(new Uint8Array(16))).toThrow();
  });

  it("generates distinct well-formed keys", () => {
    const keys = new Set(Array.from({ length: 200 }, generateApiKey));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(isWellFormedApiKey(k)).toBe(true);
  });
});

describe("isWellFormedApiKey", () => {
  const valid = formatApiKey(bytes(7));
  it.each([
    ["", false],
    ["fis_", false],
    [valid.slice(0, -1), false],
    [valid + "A", false],
    ["sk_" + valid.slice(4), false],
    [valid.slice(0, -1) + "=", false],
    [valid.slice(0, -1) + " ", false],
    [valid, true],
  ])("%j -> %s", (input, expected) => {
    expect(isWellFormedApiKey(input)).toBe(expected);
  });
});

describe("parseBearerApiKey", () => {
  const key = formatApiKey(bytes(42));
  it("extracts a valid bearer key, case-insensitive scheme", () => {
    expect(parseBearerApiKey(`Bearer ${key}`)).toBe(key);
    expect(parseBearerApiKey(`bearer ${key}`)).toBe(key);
  });
  it.each([
    null,
    "",
    key,
    `Basic ${key}`,
    `Bearer`,
    `Bearer ${key} extra`,
    `Bearer ${key.slice(0, 20)}`,
    `Bearer\t${key}`,
  ])("rejects %j", (header) => {
    expect(parseBearerApiKey(header)).toBeNull();
  });
});

describe("hashApiKey", () => {
  it("is a stable 64-char hex SHA-256 and differs per key", async () => {
    const a = formatApiKey(bytes(1));
    const b = formatApiKey(bytes(2));
    const ha = await hashApiKey(a);
    expect(ha).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashApiKey(a)).toBe(ha);
    expect(await hashApiKey(b)).not.toBe(ha);
  });

  it("matches a known SHA-256 vector", async () => {
    expect(await hashApiKey("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("apiKeyDisplayPrefix", () => {
  it("reveals only the prefix and a few body chars", () => {
    const key = formatApiKey(bytes(9));
    const shown = apiKeyDisplayPrefix(key);
    expect(shown).toHaveLength(API_KEY_PREFIX.length + 6);
    expect(key.startsWith(shown)).toBe(true);
  });
});

describe("normalizeApiKeyName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeApiKeyName("  my   script ")).toBe("my script");
  });
  it("rejects empty and overlong names", () => {
    expect(() => normalizeApiKeyName("   ")).toThrow();
    expect(() => normalizeApiKeyName("x".repeat(65))).toThrow();
  });
});

describe("computeApiKeyExpiry", () => {
  it("returns undefined for never and adds days otherwise", () => {
    expect(computeApiKeyExpiry(1000, null)).toBeUndefined();
    expect(computeApiKeyExpiry(1000, 30)).toBe(1000 + 30 * 86_400_000);
  });
  it("rejects unsupported lifetimes", () => {
    expect(() => computeApiKeyExpiry(0, 7)).toThrow();
    expect(() => computeApiKeyExpiry(0, -1)).toThrow();
  });
});

describe("isApiKeyUsable", () => {
  const base = { scopes: ["networth:read"] };
  it("accepts an active key with the scope", () => {
    expect(isApiKeyUsable(base, "networth:read", 10)).toBe(true);
    expect(isApiKeyUsable({ ...base, expiresAt: 11 }, "networth:read", 10)).toBe(true);
  });
  it("rejects revoked, expired and unscoped keys", () => {
    expect(isApiKeyUsable({ ...base, revokedAt: 5 }, "networth:read", 10)).toBe(false);
    expect(isApiKeyUsable({ ...base, expiresAt: 10 }, "networth:read", 10)).toBe(false);
    expect(isApiKeyUsable({ scopes: [] }, "networth:read", 10)).toBe(false);
  });
});

describe("consumeRateLimit", () => {
  const limit = { windowMs: 1000, maxRequests: 2 };
  it("allows up to the limit then blocks within the window", () => {
    const a = consumeRateLimit({}, 0, limit);
    expect(a).toMatchObject({ allowed: true, windowStart: 0, windowCount: 1 });
    const b = consumeRateLimit(a, 100, limit);
    expect(b).toMatchObject({ allowed: true, windowCount: 2 });
    const c = consumeRateLimit(b, 200, limit);
    expect(c.allowed).toBe(false);
    expect(c.retryAfterSeconds).toBe(1);
  });
  it("resets after the window", () => {
    const blocked = { windowStart: 0, windowCount: 2 };
    expect(consumeRateLimit(blocked, 1000, limit)).toMatchObject({
      allowed: true,
      windowStart: 1000,
      windowCount: 1,
    });
  });
});
