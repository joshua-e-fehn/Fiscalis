/**
 * Shared retry and timeout settings for provider reads (Bitpanda,
 * SnapTrade). The retry loop and the transient / needs-reauth split are
 * pure and tested in services/security/providerFailure.ts.
 */

export {
  withRetry,
  classifyProviderFailure,
  parseRetryAfter,
  type RetryOptions,
  type ProviderFailureKind,
} from "../../../services/security/providerFailure";

/**
 * Per-attempt timeout of one provider HTTP request. Retries come on top,
 * so a sync action stays well inside Convex's action limit.
 */
export const PROVIDER_TIMEOUT_MS = 20_000;
