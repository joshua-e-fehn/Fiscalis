/**
 * The connection status a failed provider sync leaves behind, per provider
 * vocabulary. Only a rejected credential asks the user to reconnect; a
 * transient failure keeps the key and is retried by the next sync
 * (providerFailure.ts).
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import { classifyProviderFailure } from "./providerFailure";

export type BitpandaFailureStatus = "needs_reauth" | "transient_error" | "error";

export const BITPANDA_REAUTH_MESSAGE =
  "Your Bitpanda API key is no longer valid. Please reconnect with a new read-only key.";
export const BITPANDA_TRANSIENT_MESSAGE =
  "Bitpanda is temporarily unavailable. Your key is fine; the next sync will retry.";

/** Status and message for a Bitpanda connection whose sync threw `error`. */
export function bitpandaFailureStatus(error: unknown): {
  status: BitpandaFailureStatus;
  errorMessage: string;
} {
  switch (classifyProviderFailure(error)) {
    case "needs_reauth":
      return { status: "needs_reauth", errorMessage: BITPANDA_REAUTH_MESSAGE };
    case "transient":
      return { status: "transient_error", errorMessage: BITPANDA_TRANSIENT_MESSAGE };
    default:
      return {
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
  }
}

export type SnaptradeFailureStatus = "reauth_required" | "transient_error" | "error";

/**
 * Status for a SnapTrade connection from its parsed error
 * (convex/lib/snaptrade.ts parseSnapTradeError).
 */
export function snaptradeFailureStatus(parsed: {
  requiresReauth: boolean;
  isRetryable: boolean;
}): SnaptradeFailureStatus {
  if (parsed.requiresReauth) return "reauth_required";
  if (parsed.isRetryable) return "transient_error";
  return "error";
}
