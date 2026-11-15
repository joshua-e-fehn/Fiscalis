import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canonicalSnaptradeJson,
  signSnaptradeWebhook,
  snaptradeWebhookEvent,
  verifySnaptradeWebhook,
} from "./snaptradeWebhook";

const CONSUMER_KEY = "test-consumer-key";
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

function payload(overrides: Record<string, unknown> = {}) {
  return {
    webhookId: "wh-1",
    clientId: "FISCALIS",
    eventTimestamp: new Date(NOW - 30_000).toISOString(),
    userId: "user_abc",
    eventType: "CONNECTION_BROKEN",
    webhookSecret: "deprecated",
    brokerageAuthorizationId: "auth-1",
    ...overrides,
  };
}

/** What SnapTrade's Python side sends: the body and its signature. */
function pythonSigned(body: string, canonical: string) {
  return {
    body,
    signature: createHmac("sha256", CONSUMER_KEY).update(canonical).digest("base64"),
  };
}

describe("canonicalSnaptradeJson", () => {
  it("matches Python json.dumps(sort_keys=True, separators=(',', ':'))", () => {
    // Expected output generated with CPython 3 json.dumps
    const body =
      '{"b": 1.0, "a": {"z": [1, 2.5, true, null], "y": "Zürich \\u20ac \\ud83d\\ude00 \\"q\\" /"}, "c": -100000.0}';
    expect(canonicalSnaptradeJson(body)).toBe(
      '{"a":{"y":"Z\\u00fcrich \\u20ac \\ud83d\\ude00 \\"q\\" /","z":[1,2.5,true,null]},"b":1.0,"c":-100000.0}',
    );
  });

  it("handles empty containers, escapes and nesting", () => {
    expect(canonicalSnaptradeJson(' { "x" : [ ] , "a" : { } , "n" : "a\\nb\\t" } ')).toBe(
      '{"a":{},"n":"a\\nb\\t","x":[]}',
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => canonicalSnaptradeJson("{")).toThrow();
    expect(() => canonicalSnaptradeJson('{"a":1} x')).toThrow();
    expect(() => canonicalSnaptradeJson("{'a':1}")).toThrow();
  });
});

describe("verifySnaptradeWebhook", () => {
  it("accepts a payload signed over its canonical form", async () => {
    const data = payload();
    const body = JSON.stringify(data, null, 2);
    const { signature } = pythonSigned(body, canonicalSnaptradeJson(body));
    const result = await verifySnaptradeWebhook({ signature, body, consumerKey: CONSUMER_KEY, nowMs: NOW });
    expect(result).toEqual({ ok: true, payload: data });
  });

  it("agrees with signSnaptradeWebhook", async () => {
    const body = JSON.stringify(payload());
    const signature = await signSnaptradeWebhook(body, CONSUMER_KEY);
    expect(
      (await verifySnaptradeWebhook({ signature, body, consumerKey: CONSUMER_KEY, nowMs: NOW })).ok,
    ).toBe(true);
  });

  it("accepts a signature over the raw body", async () => {
    const body = JSON.stringify(payload());
    const { signature } = pythonSigned(body, body);
    expect(
      (await verifySnaptradeWebhook({ signature, body, consumerKey: CONSUMER_KEY, nowMs: NOW })).ok,
    ).toBe(true);
  });

  it("rejects a missing or wrong signature", async () => {
    const body = JSON.stringify(payload());
    expect(
      await verifySnaptradeWebhook({ signature: null, body, consumerKey: CONSUMER_KEY, nowMs: NOW }),
    ).toEqual({ ok: false, reason: "missing_signature" });
    const signature = await signSnaptradeWebhook(body, "another-key");
    expect(
      await verifySnaptradeWebhook({ signature, body, consumerKey: CONSUMER_KEY, nowMs: NOW }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered body", async () => {
    const body = JSON.stringify(payload());
    const signature = await signSnaptradeWebhook(body, CONSUMER_KEY);
    const tampered = JSON.stringify(payload({ brokerageAuthorizationId: "auth-2" }));
    expect(
      await verifySnaptradeWebhook({ signature, body: tampered, consumerKey: CONSUMER_KEY, nowMs: NOW }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a malformed body", async () => {
    expect(
      await verifySnaptradeWebhook({ signature: "x", body: "not json", consumerKey: CONSUMER_KEY, nowMs: NOW }),
    ).toEqual({ ok: false, reason: "malformed_body" });
    expect(
      await verifySnaptradeWebhook({ signature: "x", body: "[1]", consumerKey: CONSUMER_KEY, nowMs: NOW }),
    ).toEqual({ ok: false, reason: "malformed_body" });
  });

  it("rejects replays older than five minutes and bad timestamps", async () => {
    for (const eventTimestamp of [new Date(NOW - 301_000).toISOString(), "yesterday", undefined]) {
      const body = JSON.stringify(payload({ eventTimestamp }));
      const signature = await signSnaptradeWebhook(body, CONSUMER_KEY);
      expect(
        await verifySnaptradeWebhook({ signature, body, consumerKey: CONSUMER_KEY, nowMs: NOW }),
      ).toEqual({ ok: false, reason: "stale" });
    }
  });
});

describe("snaptradeWebhookEvent", () => {
  it("maps broken and deleted connections", () => {
    expect(snaptradeWebhookEvent(payload())).toEqual({
      kind: "connection_broken",
      snaptradeUserId: "user_abc",
      authorizationId: "auth-1",
    });
    expect(snaptradeWebhookEvent(payload({ eventType: "CONNECTION_DELETED" })).kind).toBe(
      "connection_deleted",
    );
  });

  it("syncs on holdings updates, fixed connections and new accounts", () => {
    for (const eventType of ["ACCOUNT_HOLDINGS_UPDATED", "CONNECTION_FIXED", "NEW_ACCOUNT_AVAILABLE"]) {
      expect(snaptradeWebhookEvent(payload({ eventType })).kind).toBe("sync_connection");
    }
  });

  it("reads the OAuth schema's connectionId", () => {
    expect(
      snaptradeWebhookEvent(
        payload({ brokerageAuthorizationId: undefined, connectionId: "auth-9" }),
      ),
    ).toMatchObject({ authorizationId: "auth-9" });
  });

  it("ignores other events and payloads without a connection", () => {
    expect(snaptradeWebhookEvent(payload({ eventType: "USER_REGISTERED" })).kind).toBe("ignore");
    expect(
      snaptradeWebhookEvent(payload({ brokerageAuthorizationId: undefined })).kind,
    ).toBe("ignore");
  });
});
