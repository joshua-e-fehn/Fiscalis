/**
 * SnapTrade webhook verification and event mapping (ENG-240).
 *
 * SnapTrade signs each webhook with a `Signature` header: base64 of
 * HMAC-SHA256, keyed with the client's consumer key (SNAPTRADE_SECRET),
 * over the payload re-serialised as Python's
 * `json.dumps(payload, separators=(",", ":"), sort_keys=True)`. That means
 * compact output with keys sorted at every level and non-ASCII characters
 * escaped as \uXXXX. Payloads whose `eventTimestamp` is more than 5 minutes
 * old are rejected as replays. https://docs.snaptrade.com/docs/webhooks
 *
 * The body is re-serialised from its own text, keeping number literals as
 * sent, so a value such as 1.0 is signed as it was written. A signature
 * over the raw body is accepted as well.
 *
 * Framework-free: WebCrypto only.
 */

import { timingSafeEqual } from "./plaidWebhook";

export const SNAPTRADE_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 60;

// ═══════════════════════════════════════════════════════════════
// CANONICAL JSON (Python json.dumps, sort_keys, compact, ensure_ascii)
// ═══════════════════════════════════════════════════════════════

/** Python's ensure_ascii escaping of a JSON string. */
function pythonString(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * Re-serialise JSON text as Python's
 * json.dumps(..., separators=(",", ":"), sort_keys=True) would. Numbers
 * keep their literal text. Throws on invalid JSON.
 */
export function canonicalSnaptradeJson(text: string): string {
  let i = 0;
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const fail = (): never => {
    throw new SyntaxError(`Invalid JSON at ${i}`);
  };

  const readString = (): string => {
    const start = i;
    if (text[i] !== '"') fail();
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") i++;
      i++;
    }
    if (i >= text.length) fail();
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };

  const value = (): string => {
    ws();
    const ch = text[i];
    if (ch === "{") {
      i++;
      const entries: [string, string][] = [];
      ws();
      if (text[i] === "}") {
        i++;
        return "{}";
      }
      for (;;) {
        ws();
        const key = readString();
        ws();
        if (text[i] !== ":") fail();
        i++;
        entries.push([key, value()]);
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          break;
        }
        fail();
      }
      // A duplicate key keeps its last value, as in Python
      const byKey = new Map(entries);
      const keys = [...byKey.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${keys.map((k) => `${pythonString(k)}:${byKey.get(k)}`).join(",")}}`;
    }
    if (ch === "[") {
      i++;
      const items: string[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return "[]";
      }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          break;
        }
        fail();
      }
      return `[${items.join(",")}]`;
    }
    if (ch === '"') return pythonString(readString());
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        return literal;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!number) fail();
    i += number![0].length;
    return number![0];
  };

  const result = value();
  ws();
  if (i !== text.length) fail();
  return result;
}

// ═══════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════

async function hmacSha256Base64(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The signature SnapTrade sends for `body` (exported for tests and tooling). */
export function signSnaptradeWebhook(body: string, consumerKey: string): Promise<string> {
  return hmacSha256Base64(canonicalSnaptradeJson(body), consumerKey);
}

export type SnaptradeVerificationFailure =
  | "missing_signature"
  | "malformed_body"
  | "bad_signature"
  | "stale";

export type SnaptradeVerificationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: SnaptradeVerificationFailure };

export async function verifySnaptradeWebhook(input: {
  signature: string | null | undefined;
  body: string;
  consumerKey: string;
  nowMs: number;
}): Promise<SnaptradeVerificationResult> {
  const { signature, body, consumerKey, nowMs } = input;
  if (!signature) return { ok: false, reason: "missing_signature" };

  let payload: unknown;
  let canonical: string;
  try {
    payload = JSON.parse(body);
    canonical = canonicalSnaptradeJson(body);
  } catch {
    return { ok: false, reason: "malformed_body" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "malformed_body" };
  }

  const expected = await hmacSha256Base64(canonical, consumerKey);
  const raw = await hmacSha256Base64(body, consumerKey);
  // Both comparisons always run, so timing does not reveal which matched
  const matchesCanonical = timingSafeEqual(expected, signature.trim());
  const matchesRaw = timingSafeEqual(raw, signature.trim());
  if (!matchesCanonical && !matchesRaw) return { ok: false, reason: "bad_signature" };

  const record = payload as Record<string, unknown>;
  const sentAt =
    typeof record.eventTimestamp === "string" ? Date.parse(record.eventTimestamp) : Number.NaN;
  const ageSeconds = (nowMs - sentAt) / 1000;
  if (
    !Number.isFinite(ageSeconds) ||
    ageSeconds > SNAPTRADE_WEBHOOK_MAX_AGE_SECONDS ||
    ageSeconds < -CLOCK_SKEW_SECONDS
  ) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true, payload: record };
}

// ═══════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════

/** What a verified SnapTrade webhook asks the app to do. */
export type SnaptradeWebhookEvent =
  /** The brokerage connection needs the user to reconnect. */
  | { kind: "connection_broken"; snaptradeUserId: string; authorizationId: string }
  /** The connection was removed at SnapTrade: delete it locally. */
  | { kind: "connection_deleted"; snaptradeUserId: string; authorizationId: string }
  /** Holdings (or the connection) changed: sync the connection. */
  | { kind: "sync_connection"; snaptradeUserId: string; authorizationId: string }
  | { kind: "ignore"; reason: string };

export function snaptradeWebhookEvent(payload: Record<string, unknown>): SnaptradeWebhookEvent {
  const eventType = typeof payload.eventType === "string" ? payload.eventType : "";
  const snaptradeUserId = typeof payload.userId === "string" ? payload.userId : "";
  // The OAuth webhook schema calls it connectionId
  const authorizationId =
    typeof payload.brokerageAuthorizationId === "string"
      ? payload.brokerageAuthorizationId
      : typeof payload.connectionId === "string"
        ? payload.connectionId
        : "";
  if (!snaptradeUserId || !authorizationId) {
    return { kind: "ignore", reason: `${eventType || "unknown"} without user or connection` };
  }

  switch (eventType) {
    case "CONNECTION_BROKEN":
      return { kind: "connection_broken", snaptradeUserId, authorizationId };
    case "CONNECTION_DELETED":
      return { kind: "connection_deleted", snaptradeUserId, authorizationId };
    case "ACCOUNT_HOLDINGS_UPDATED":
    case "CONNECTION_FIXED":
    case "NEW_ACCOUNT_AVAILABLE":
      return { kind: "sync_connection", snaptradeUserId, authorizationId };
    default:
      return { kind: "ignore", reason: eventType || "unknown" };
  }
}
