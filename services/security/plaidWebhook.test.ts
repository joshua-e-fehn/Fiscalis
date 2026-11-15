import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  PENDING_DISCONNECT_WINDOW_MS,
  plaidWebhookEvent,
  plaidWebhookKeyId,
  plaidWebhookUrl,
  timingSafeEqual,
  verifyPlaidWebhook,
  type PlaidWebhookKey,
} from "./plaidWebhook";

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const BODY = JSON.stringify(
  { webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item-1" },
  null,
  2,
);

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return Buffer.from(raw).toString("base64url");
}

let keyPair: CryptoKeyPair;
let jwk: PlaidWebhookKey;

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const exported = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  jwk = {
    kty: exported.kty!,
    crv: exported.crv!,
    x: exported.x!,
    y: exported.y!,
    kid: "kid-1",
    expired_at: null,
  };
});

async function sign(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "ES256", kid: "kid-1", typ: "JWT" },
  key: CryptoKey = keyPair.privateKey,
): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(new Uint8Array(signature))}`;
}

const bodyHash = (body: string) => createHash("sha256").update(body).digest("hex");
const getKey = async (kid: string) => (kid === "kid-1" ? jwk : null);

describe("verifyPlaidWebhook", () => {
  it("accepts a genuine webhook", async () => {
    const token = await sign({ iat: NOW / 1000 - 10, request_body_sha256: bodyHash(BODY) });
    expect(await verifyPlaidWebhook({ token, body: BODY, nowMs: NOW, getKey })).toEqual({ ok: true });
  });

  it("rejects a missing or malformed header", async () => {
    expect(await verifyPlaidWebhook({ token: null, body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "missing_header",
    });
    expect(await verifyPlaidWebhook({ token: "a.b", body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "malformed_jwt",
    });
    expect(
      await verifyPlaidWebhook({ token: "!!.!!.!!", body: BODY, nowMs: NOW, getKey }),
    ).toEqual({ ok: false, reason: "malformed_jwt" });
  });

  it("rejects alg other than ES256 (including none)", async () => {
    const token = await sign(
      { iat: NOW / 1000, request_body_sha256: bodyHash(BODY) },
      { alg: "none", kid: "kid-1" },
    );
    expect(await verifyPlaidWebhook({ token, body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "unsupported_alg",
    });
  });

  it("rejects an unknown or expired key", async () => {
    const unknown = await sign(
      { iat: NOW / 1000, request_body_sha256: bodyHash(BODY) },
      { alg: "ES256", kid: "other" },
    );
    expect(await verifyPlaidWebhook({ token: unknown, body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "unknown_key",
    });
    const token = await sign({ iat: NOW / 1000, request_body_sha256: bodyHash(BODY) });
    expect(
      await verifyPlaidWebhook({
        token,
        body: BODY,
        nowMs: NOW,
        getKey: async () => ({ ...jwk, expired_at: 1 }),
      }),
    ).toEqual({ ok: false, reason: "expired_key" });
  });

  it("rejects a signature from another key", async () => {
    const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
    ]);
    const token = await sign(
      { iat: NOW / 1000, request_body_sha256: bodyHash(BODY) },
      undefined,
      other.privateKey,
    );
    expect(await verifyPlaidWebhook({ token, body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a tampered payload", async () => {
    const token = await sign({ iat: NOW / 1000, request_body_sha256: bodyHash(BODY) });
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64url(JSON.stringify({ iat: NOW / 1000, request_body_sha256: bodyHash("{}") }))}.${s}`;
    expect(await verifyPlaidWebhook({ token: forged, body: "{}", nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a replay older than five minutes or far in the future", async () => {
    const old = await sign({ iat: NOW / 1000 - 301, request_body_sha256: bodyHash(BODY) });
    expect(await verifyPlaidWebhook({ token: old, body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "stale",
    });
    const future = await sign({ iat: NOW / 1000 + 600, request_body_sha256: bodyHash(BODY) });
    expect(await verifyPlaidWebhook({ token: future, body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "stale",
    });
    const missing = await sign({ request_body_sha256: bodyHash(BODY) });
    expect(await verifyPlaidWebhook({ token: missing, body: BODY, nowMs: NOW, getKey })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects a body that does not match the signed hash, whitespace included", async () => {
    const token = await sign({ iat: NOW / 1000, request_body_sha256: bodyHash(BODY) });
    const reformatted = JSON.stringify(JSON.parse(BODY));
    expect(
      await verifyPlaidWebhook({ token, body: reformatted, nowMs: NOW, getKey }),
    ).toEqual({ ok: false, reason: "body_mismatch" });
  });
});

describe("plaidWebhookKeyId", () => {
  it("reads the kid from the JWT header", async () => {
    expect(plaidWebhookKeyId(await sign({}))).toBe("kid-1");
    expect(plaidWebhookKeyId("garbage")).toBeNull();
    expect(plaidWebhookKeyId(null)).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("compares strings of any length", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("plaidWebhookEvent", () => {
  const event = (body: Record<string, unknown>) =>
    plaidWebhookEvent({ item_id: "item-1", ...body }, NOW);

  it("maps ITEM_LOGIN_REQUIRED errors", () => {
    expect(
      event({
        webhook_type: "ITEM",
        webhook_code: "ERROR",
        error: { error_code: "ITEM_LOGIN_REQUIRED" },
      }),
    ).toEqual({ kind: "item_error", itemId: "item-1", errorCode: "ITEM_LOGIN_REQUIRED" });
  });

  it("maps revoked permission", () => {
    expect(
      event({
        webhook_type: "ITEM",
        webhook_code: "USER_PERMISSION_REVOKED",
        error: { error_code: "USER_PERMISSION_REVOKED" },
      }),
    ).toEqual({ kind: "item_error", itemId: "item-1", errorCode: "USER_PERMISSION_REVOKED" });
    expect(event({ webhook_type: "ITEM", webhook_code: "USER_ACCOUNT_REVOKED" })).toEqual({
      kind: "item_error",
      itemId: "item-1",
      errorCode: "USER_ACCOUNT_REVOKED",
    });
  });

  it("maps PENDING_EXPIRATION with its consent time", () => {
    expect(
      event({
        webhook_type: "ITEM",
        webhook_code: "PENDING_EXPIRATION",
        consent_expiration_time: "2026-12-01T00:00:00Z",
      }),
    ).toEqual({
      kind: "consent_expiring",
      itemId: "item-1",
      consentExpiresAt: Date.UTC(2026, 11, 1),
    });
    expect(event({ webhook_type: "ITEM", webhook_code: "PENDING_EXPIRATION" })).toEqual({
      kind: "consent_expiring",
      itemId: "item-1",
      consentExpiresAt: null,
    });
  });

  it("maps PENDING_DISCONNECT to a disconnect in seven days", () => {
    expect(event({ webhook_type: "ITEM", webhook_code: "PENDING_DISCONNECT" })).toEqual({
      kind: "pending_disconnect",
      itemId: "item-1",
      disconnectAt: NOW + PENDING_DISCONNECT_WINDOW_MS,
    });
  });

  it("maps LOGIN_REPAIRED and SYNC_UPDATES_AVAILABLE", () => {
    expect(event({ webhook_type: "ITEM", webhook_code: "LOGIN_REPAIRED" }).kind).toBe(
      "login_repaired",
    );
    expect(
      event({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE" }),
    ).toEqual({ kind: "sync_transactions", itemId: "item-1" });
  });

  it("ignores everything else", () => {
    expect(event({ webhook_type: "TRANSACTIONS", webhook_code: "DEFAULT_UPDATE" }).kind).toBe(
      "ignore",
    );
    expect(event({ webhook_type: "ITEM", webhook_code: "WEBHOOK_UPDATE_ACKNOWLEDGED" }).kind).toBe(
      "ignore",
    );
    expect(event({ webhook_type: "ITEM", webhook_code: "ERROR" }).kind).toBe("ignore");
    expect(plaidWebhookEvent({ webhook_type: "ITEM", webhook_code: "ERROR" }, NOW).kind).toBe(
      "ignore",
    );
    expect(plaidWebhookEvent(null, NOW).kind).toBe("ignore");
  });
});

describe("plaidWebhookUrl", () => {
  it("appends the route to the site URL", () => {
    expect(plaidWebhookUrl("https://handsome-gecko-941.convex.site")).toBe(
      "https://handsome-gecko-941.convex.site/plaid-webhook",
    );
    expect(plaidWebhookUrl("https://x.convex.site/")).toBe("https://x.convex.site/plaid-webhook");
    expect(plaidWebhookUrl(undefined)).toBeUndefined();
  });
});
