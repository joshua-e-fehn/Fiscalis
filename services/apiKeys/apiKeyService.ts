/**
 * API key primitives for the public, user-scoped REST API.
 *
 * Framework-free so it can be unit-tested here and imported by the Convex
 * functions (`frontend/convex/apiKeys.ts`, `frontend/convex/http.ts`).
 *
 * Security model:
 *  - A key is `fis_` + 32 bytes (256 bits) of CSPRNG output, base64url-encoded.
 *  - Only the SHA-256 hash of the full key is ever stored. With 256 bits of
 *    entropy a fast hash is sufficient: brute-forcing the pre-image is
 *    infeasible, so a slow KDF would only add latency to every request.
 *  - A short, non-secret display prefix is stored so users can tell keys apart.
 *  - The plaintext key is returned to the user exactly once, at creation.
 */

/** Prefix that marks a string as a Fiscalis API key (helps secret scanners). */
export const API_KEY_PREFIX = "fis_";

/** Bytes of randomness in a key. 32 bytes = 256 bits. */
export const API_KEY_RANDOM_BYTES = 32;

/** base64url length of API_KEY_RANDOM_BYTES without padding. */
const API_KEY_BODY_LENGTH = Math.ceil((API_KEY_RANDOM_BYTES * 4) / 3); // 43

/** Total length of a well-formed key. */
export const API_KEY_LENGTH = API_KEY_PREFIX.length + API_KEY_BODY_LENGTH;

/** Characters of the random body shown in the UI to identify a key. */
const DISPLAY_BODY_CHARS = 6;

/** Scopes a key can carry. Only read access to net worth exists today. */
export const API_KEY_SCOPES = ["networth:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Upper bound on simultaneously active keys per user. */
export const MAX_ACTIVE_API_KEYS_PER_USER = 10;

/** Upper bound on a key's user-chosen name. */
export const MAX_API_KEY_NAME_LENGTH = 64;

/** Allowed lifetimes in days; `null` means the key never expires. */
export const API_KEY_EXPIRY_OPTIONS_DAYS = [30, 90, 365, null] as const;
export type ApiKeyExpiryDays = (typeof API_KEY_EXPIRY_OPTIONS_DAYS)[number];

/** Per-key fixed-window rate limit. */
export const API_KEY_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

const KEY_PATTERN = new RegExp(
  `^${API_KEY_PREFIX}[A-Za-z0-9_-]{${API_KEY_BODY_LENGTH}}$`,
);

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build an API key from caller-supplied random bytes.
 *
 * The bytes MUST come from a CSPRNG (`crypto.getRandomValues`). Taking them as
 * an argument keeps this function deterministic and testable.
 */
export function formatApiKey(randomBytes: Uint8Array): string {
  if (randomBytes.length !== API_KEY_RANDOM_BYTES) {
    throw new Error(`API key requires exactly ${API_KEY_RANDOM_BYTES} random bytes`);
  }
  return API_KEY_PREFIX + toBase64Url(randomBytes);
}

/** Generate a new API key using the platform CSPRNG. */
export function generateApiKey(): string {
  const bytes = new Uint8Array(API_KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  return formatApiKey(bytes);
}

/** True when `value` has the exact shape of a Fiscalis API key. */
export function isWellFormedApiKey(value: string): boolean {
  return value.length === API_KEY_LENGTH && KEY_PATTERN.test(value);
}

/** Non-secret identifier shown in the UI, e.g. `fis_AbC123…`. */
export function apiKeyDisplayPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + DISPLAY_BODY_CHARS);
}

/** Hex-encoded SHA-256 of the full key. This is the only form that is stored. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Extract the key from an `Authorization: Bearer <key>` header.
 *
 * Returns null for a missing header, another scheme, or a value that is not a
 * well-formed key — so malformed input is rejected before touching the DB.
 */
export function parseBearerApiKey(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ ]+(\S+)[ ]*$/i.exec(header);
  if (!match) return null;
  const token = match[1];
  return isWellFormedApiKey(token) ? token : null;
}

/** Normalise and validate a user-supplied key name. Throws on invalid input. */
export function normalizeApiKeyName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) throw new Error("API key name is required");
  if (trimmed.length > MAX_API_KEY_NAME_LENGTH) {
    throw new Error(
      `API key name must be at most ${MAX_API_KEY_NAME_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** Expiry timestamp for a lifetime choice, or undefined for "never". */
export function computeApiKeyExpiry(
  now: number,
  expiresInDays: number | null,
): number | undefined {
  if (expiresInDays === null) return undefined;
  if (!(API_KEY_EXPIRY_OPTIONS_DAYS as readonly (number | null)[]).includes(expiresInDays)) {
    throw new Error("Unsupported API key lifetime");
  }
  return now + expiresInDays * 86_400_000;
}

/** Stored state of a key, as far as authorization is concerned. */
export interface ApiKeyAuthState {
  revokedAt?: number;
  expiresAt?: number;
  scopes: readonly string[];
}

/** True when the key may be used for `scope` at time `now`. */
export function isApiKeyUsable(
  key: ApiKeyAuthState,
  scope: ApiKeyScope,
  now: number,
): boolean {
  if (key.revokedAt !== undefined) return false;
  if (key.expiresAt !== undefined && key.expiresAt <= now) return false;
  return key.scopes.includes(scope);
}

/** Fixed-window rate limiter state stored on the key document. */
export interface RateLimitWindow {
  windowStart?: number;
  windowCount?: number;
}

/**
 * Apply one request to a fixed rate-limit window.
 * Returns whether the request is allowed and the window state to persist.
 */
export function consumeRateLimit(
  state: RateLimitWindow,
  now: number,
  limit: { windowMs: number; maxRequests: number } = API_KEY_RATE_LIMIT,
): {
  allowed: boolean;
  windowStart: number;
  windowCount: number;
  retryAfterSeconds: number;
} {
  const inWindow =
    state.windowStart !== undefined && now - state.windowStart < limit.windowMs;
  const windowStart = inWindow ? state.windowStart! : now;
  const used = inWindow ? (state.windowCount ?? 0) : 0;

  if (used >= limit.maxRequests) {
    return {
      allowed: false,
      windowStart,
      windowCount: used,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowStart + limit.windowMs - now) / 1000),
      ),
    };
  }
  return {
    allowed: true,
    windowStart,
    windowCount: used + 1,
    retryAfterSeconds: 0,
  };
}
