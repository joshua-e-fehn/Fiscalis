/**
 * Svix webhook signature verification (Clerk delivers its webhooks through
 * Svix), for POST /clerk-webhook in frontend/convex/http.ts.
 *
 * Scheme (https://docs.svix.com/receiving/verifying-payloads/how-manual):
 * the signed content is `${svix-id}.${svix-timestamp}.${raw body}`, signed
 * with HMAC-SHA256 under the base64 key after the `whsec_` prefix. The
 * `svix-signature` header holds space-separated `v1,<base64>` entries (more
 * than one while a secret is rotated); any match passes. A timestamp more
 * than five minutes from now is rejected against replays.
 *
 * Web Crypto only, so it runs in the Convex runtime and in vitest.
 */

/** Allowed clock difference between Svix and us. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type SvixVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "bad_secret" | "stale" | "mismatch" };

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Length-independent comparison that does not stop at the first mismatch. */
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** The base64 `v1` signature of a payload (exported for tests). */
export async function signSvixPayload(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const keyBytes = base64ToBytes(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return bytesToBase64(new Uint8Array(mac));
}

/** Verifies a Svix delivery against the endpoint's signing secret. */
export async function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  body: string,
  nowMs: number,
): Promise<SvixVerifyResult> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing_headers" };
  }

  const sentAt = Number(timestamp);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(nowMs / 1000 - sentAt) > SVIX_TOLERANCE_SECONDS
  ) {
    return { ok: false, reason: "stale" };
  }

  let expected: string;
  try {
    expected = await signSvixPayload(secret, id, timestamp, body);
  } catch {
    return { ok: false, reason: "bad_secret" };
  }

  const matches = signature
    .split(" ")
    .map((entry) => entry.split(","))
    .some(
      ([version, sig]) =>
        version === "v1" && sig !== undefined && constantTimeEqual(sig, expected),
    );
  return matches ? { ok: true } : { ok: false, reason: "mismatch" };
}
