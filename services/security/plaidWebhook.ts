/**
 * Plaid webhook verification and event mapping (ENG-240).
 *
 * Plaid signs every webhook with an ES256 JWT in the `Plaid-Verification`
 * header. The JWT header names the signing key (`kid`), which comes from
 * /webhook_verification_key/get. The payload carries `iat` and
 * `request_body_sha256`. A webhook is genuine when:
 *   1. the JWT header's alg is ES256,
 *   2. the key exists and has no `expired_at`,
 *   3. the signature verifies against the key,
 *   4. `iat` is at most 5 minutes old (so it cannot be replayed),
 *   5. the SHA-256 of the raw body equals `request_body_sha256`.
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 *
 * Framework-free: WebCrypto only (Node 20+, the Convex runtimes, vitest).
 */

/** The verification key as /webhook_verification_key/get returns it. */
export interface PlaidWebhookKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
  expired_at?: number | null;
}

export type PlaidVerificationFailure =
  | "missing_header"
  | "malformed_jwt"
  | "unsupported_alg"
  | "unknown_key"
  | "expired_key"
  | "bad_signature"
  | "stale"
  | "body_mismatch";

export type PlaidVerificationResult =
  | { ok: true }
  | { ok: false; reason: PlaidVerificationFailure };

/** How old a webhook's `iat` may be. */
export const PLAID_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
/** Clock skew tolerated for an `iat` in the future. */
const CLOCK_SKEW_SECONDS = 60;

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The `kid` of a Plaid-Verification JWT, or null when it is not a JWT. */
export function plaidWebhookKeyId(token: string | null | undefined): string | null {
  const header = token ? decodeJsonSegment(token.split(".")[0] ?? "") : null;
  return typeof header?.kid === "string" && header.kid ? header.kid : null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Verify a Plaid webhook. `getKey` returns the verification key for a kid
 * (cached by the caller), or null when Plaid does not know it.
 */
export async function verifyPlaidWebhook(input: {
  token: string | null | undefined;
  body: string;
  nowMs: number;
  getKey: (kid: string) => Promise<PlaidWebhookKey | null>;
}): Promise<PlaidVerificationResult> {
  const { token, body, nowMs, getKey } = input;
  if (!token) return { ok: false, reason: "missing_header" };

  const segments = token.split(".");
  if (segments.length !== 3) return { ok: false, reason: "malformed_jwt" };
  const header = decodeJsonSegment(segments[0]);
  const payload = decodeJsonSegment(segments[1]);
  if (!header || !payload) return { ok: false, reason: "malformed_jwt" };
  if (header.alg !== "ES256") return { ok: false, reason: "unsupported_alg" };
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!kid) return { ok: false, reason: "malformed_jwt" };

  const key = await getKey(kid);
  if (!key) return { ok: false, reason: "unknown_key" };
  if (key.expired_at != null) return { ok: false, reason: "expired_key" };

  let signatureValid = false;
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      { kty: key.kty, crv: key.crv, x: key.x, y: key.y },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    // A JWS ES256 signature is r || s, the encoding WebCrypto expects
    signatureValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      base64UrlToBytes(segments[2]),
      new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return { ok: false, reason: "bad_signature" };

  const iat = typeof payload.iat === "number" ? payload.iat : Number.NaN;
  const ageSeconds = nowMs / 1000 - iat;
  if (
    !Number.isFinite(ageSeconds) ||
    ageSeconds > PLAID_WEBHOOK_MAX_AGE_SECONDS ||
    ageSeconds < -CLOCK_SKEW_SECONDS
  ) {
    return { ok: false, reason: "stale" };
  }

  const claimed = typeof payload.request_body_sha256 === "string" ? payload.request_body_sha256 : "";
  if (!timingSafeEqual(await sha256Hex(body), claimed)) {
    return { ok: false, reason: "body_mismatch" };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════

/** How long Plaid gives an item after PENDING_DISCONNECT. */
export const PENDING_DISCONNECT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** What a verified Plaid webhook asks the app to do. */
export type PlaidWebhookEvent =
  /** The item is broken until the user reconnects (or removes it). */
  | { kind: "item_error"; itemId: string; errorCode: string }
  /** Consent ends at `consentExpiresAt` (ms) unless the user renews it. */
  | { kind: "consent_expiring"; itemId: string; consentExpiresAt: number | null }
  /** The item will be disconnected around `disconnectAt` (ms). */
  | { kind: "pending_disconnect"; itemId: string; disconnectAt: number }
  /** The user fixed the login outside the app: sync to clear the error. */
  | { kind: "login_repaired"; itemId: string }
  /** New transactions: run the incremental /transactions/sync. */
  | { kind: "sync_transactions"; itemId: string }
  | { kind: "ignore"; reason: string };

function isoToMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Map a verified webhook body to the action it calls for. */
export function plaidWebhookEvent(body: unknown, nowMs: number): PlaidWebhookEvent {
  if (!body || typeof body !== "object") return { kind: "ignore", reason: "not an object" };
  const payload = body as Record<string, unknown>;
  const type = payload.webhook_type;
  const code = payload.webhook_code;
  const itemId = typeof payload.item_id === "string" ? payload.item_id : "";
  if (!itemId) return { kind: "ignore", reason: "no item_id" };

  if (type === "ITEM") {
    switch (code) {
      case "ERROR": {
        const error = payload.error as { error_code?: unknown } | null | undefined;
        const errorCode = typeof error?.error_code === "string" ? error.error_code : "";
        return errorCode
          ? { kind: "item_error", itemId, errorCode }
          : { kind: "ignore", reason: "ERROR without error_code" };
      }
      case "USER_PERMISSION_REVOKED":
      case "USER_ACCOUNT_REVOKED": {
        const error = payload.error as { error_code?: unknown } | null | undefined;
        return {
          kind: "item_error",
          itemId,
          errorCode:
            typeof error?.error_code === "string" ? error.error_code : String(code),
        };
      }
      case "PENDING_EXPIRATION":
        return {
          kind: "consent_expiring",
          itemId,
          consentExpiresAt: isoToMs(payload.consent_expiration_time),
        };
      case "PENDING_DISCONNECT":
        return {
          kind: "pending_disconnect",
          itemId,
          disconnectAt: nowMs + PENDING_DISCONNECT_WINDOW_MS,
        };
      case "LOGIN_REPAIRED":
        return { kind: "login_repaired", itemId };
      default:
        return { kind: "ignore", reason: `ITEM ${String(code)}` };
    }
  }

  if (type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") {
    return { kind: "sync_transactions", itemId };
  }
  return { kind: "ignore", reason: `${String(type)} ${String(code)}` };
}

/** The webhook URL Plaid should call, from the deployment's CONVEX_SITE_URL. */
export function plaidWebhookUrl(siteUrl: string | undefined): string | undefined {
  if (!siteUrl) return undefined;
  return `${siteUrl.replace(/\/+$/, "")}/plaid-webhook`;
}
