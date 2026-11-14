/**
 * What a failed provider call (Bitpanda, SnapTrade) means for its
 * connection, and a retry loop for the calls worth repeating.
 *
 * - needs_reauth: the provider rejected the credential (HTTP 401/403). Only
 *   this asks the user to reconnect.
 * - transient: the provider or the network failed and the same call may
 *   succeed later (timeouts, connection resets, 408/425/429, 5xx). The
 *   connection keeps its key and the next sync retries.
 * - permanent: anything else (a 400, a 404, a parsing bug). Shown as an
 *   error, without blaming the key.
 *
 * Reads the shapes the providers actually throw: a `status` on the error
 * (BitpandaApiError), an axios `response.status` (SnapTrade SDK), Node and
 * undici error codes (also on `cause`, as fetch wraps them in "fetch
 * failed"), and the TimeoutError / AbortError of AbortSignal.timeout.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

export type ProviderFailureKind = "needs_reauth" | "transient" | "permanent";

/** Node / undici / axios codes of a failure in transit, worth retrying. */
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "ERR_NETWORK",
]);

/** HTTP statuses after which the same request may succeed. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The HTTP status a thrown provider error carries, if any. */
export function providerErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  if (typeof error.status === "number") return error.status;
  const response = error.response;
  if (isRecord(response) && typeof response.status === "number") {
    return response.status;
  }
  return undefined;
}

function hasTransientTransportFailure(error: unknown, depth = 0): boolean {
  if (!isRecord(error) || depth > 3) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  if (typeof error.code === "string" && TRANSIENT_CODES.has(error.code)) {
    return true;
  }
  return hasTransientTransportFailure(error.cause, depth + 1);
}

/** Classifies a thrown provider error (see the module comment). */
export function classifyProviderFailure(error: unknown): ProviderFailureKind {
  const status = providerErrorStatus(error);
  if (status === 401 || status === 403) return "needs_reauth";
  if (status !== undefined) {
    return isTransientStatus(status) ? "transient" : "permanent";
  }
  return hasTransientTransportFailure(error) ? "transient" : "permanent";
}

/**
 * Milliseconds a Retry-After header value asks to wait: delta-seconds or an
 * HTTP date. Undefined when absent or unreadable.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export interface RetryOptions {
  /** Retries after the first attempt (default 2, so 3 attempts in all) */
  maxRetries?: number;
  /** Delay before the first retry, doubled each time (default 500 ms) */
  initialDelayMs?: number;
  /** Ceiling on any one delay, Retry-After included (default 8 s) */
  maxDelayMs?: number;
  /** Whether this error is worth another attempt (default: transient) */
  shouldRetry?: (error: unknown) => boolean;
  /** A provider-requested delay for this error (e.g. from Retry-After) */
  retryAfterMs?: (error: unknown) => number | undefined;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Injected in tests */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The delay before retry number `attempt` (1-based). */
export function retryDelayMs(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  requestedMs?: number,
): number {
  const backoff = initialDelayMs * 2 ** (attempt - 1);
  return Math.min(Math.max(backoff, requestedMs ?? 0), maxDelayMs);
}

/**
 * Runs `fn`, retrying with exponential backoff while `shouldRetry` holds.
 * The last error is rethrown unchanged, so callers can still classify it.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 2,
    initialDelayMs = 500,
    maxDelayMs = 8000,
    shouldRetry = (error) => classifyProviderFailure(error) === "transient",
    retryAfterMs,
    onRetry,
    sleep = defaultSleep,
  } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) throw error;
      const delay = retryDelayMs(
        attempt + 1,
        initialDelayMs,
        maxDelayMs,
        retryAfterMs?.(error),
      );
      onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
}
