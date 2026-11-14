/**
 * Log-safe summaries of errors from provider SDKs (Plaid, SnapTrade,
 * Bitpanda). Those SDKs throw axios errors whose `config` and `request`
 * carry the request headers and body: PLAID-CLIENT-ID / PLAID-SECRET, Plaid
 * access tokens, the SnapTrade userSecret (a query parameter), signatures.
 * Logging the raw error writes all of that into the Convex logs, so every
 * console call in convex/ logs describeError(error) instead.
 *
 * Only whitelisted primitive fields are kept, and every string is passed
 * through redactSecrets in case a provider echoes a credential in a message.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

/** A provider error reduced to fields that are safe to log. */
export interface ErrorSummary {
  name?: string;
  message: string;
  /** HTTP status of the provider response */
  status?: number;
  /** axios / Node error code, e.g. ECONNRESET, ERR_BAD_REQUEST */
  code?: string;
  /** Provider error fields from the response body (Plaid, SnapTrade) */
  provider?: Record<string, string | number>;
}

/** Response-body fields providers use for a machine-readable error. */
const PROVIDER_FIELDS = [
  // Plaid
  "error_type",
  "error_code",
  "error_message",
  "display_message",
  "request_id",
  // SnapTrade and generic APIs
  "status",
  "code",
  "detail",
  "message",
  "error",
] as const;

const MAX_STRING = 500;

/** Masks credentials a string may contain; keeps the rest readable. */
export function redactSecrets(text: string): string {
  return (
    text
      // Plaid tokens: access-sandbox-…, public-production-…, link-…
      .replace(
        /\b(access|public|link|processor)-(sandbox|development|production)-[A-Za-z0-9-]+/g,
        "$1-$2-[redacted]",
      )
      // key=value pairs in URLs, query strings and bodies
      .replace(
        /\b(userSecret|user_secret|secret|client_secret|access_token|clientSecret|api[_-]?key|signature|password|token)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
        "$1$2[redacted]",
      )
      // Authorization headers
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, "$1 [redacted]")
      .slice(0, MAX_STRING)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeScalar(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return redactSecrets(value);
  return undefined;
}

/**
 * Reduces any thrown value to an ErrorSummary. Never includes an axios
 * error's config, request or headers, nor a non-error object as-is.
 */
export function describeError(error: unknown): ErrorSummary {
  if (typeof error === "string") return { message: redactSecrets(error) };
  if (!isRecord(error)) return { message: String(error) };

  const summary: ErrorSummary = {
    message:
      typeof error.message === "string"
        ? redactSecrets(error.message)
        : "[non-error value thrown]",
  };
  if (typeof error.name === "string") summary.name = error.name;
  if (typeof error.code === "string") summary.code = redactSecrets(error.code);

  const response = error.response;
  if (isRecord(response)) {
    if (typeof response.status === "number") summary.status = response.status;
    const data = response.data;
    if (isRecord(data)) {
      const provider: Record<string, string | number> = {};
      for (const field of PROVIDER_FIELDS) {
        const value = safeScalar(data[field]);
        if (value !== undefined) provider[field] = value;
      }
      if (Object.keys(provider).length > 0) summary.provider = provider;
    } else if (typeof data === "string") {
      summary.provider = { body: redactSecrets(data) };
    }
  }
  return summary;
}
