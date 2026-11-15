/**
 * The connection status a failed provider sync leaves behind, per provider
 * vocabulary. Only a rejected credential asks the user to reconnect; a
 * transient failure keeps the key and is retried by the next sync
 * (providerFailure.ts).
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import type { UserErrorCode } from "../i18n/userErrorCodes";
import { classifyProviderFailure } from "./providerFailure";

export type BitpandaFailureStatus = "needs_reauth" | "transient_error" | "error";

/*
 * The persisted errorMessage is a user error code (services/i18n/
 * userErrorCodes.ts), shown in the user's language; rows written before
 * codes keep their English text, which the UI shows as it is.
 */
export const BITPANDA_REAUTH_MESSAGE = "bitpandaReauthRequired" satisfies UserErrorCode;
export const BITPANDA_TRANSIENT_MESSAGE =
  "bitpandaTemporarilyUnavailable" satisfies UserErrorCode;
export const BITPANDA_SYNC_FAILED_MESSAGE = "bitpandaSyncFailed" satisfies UserErrorCode;

/** Status and error code for a Bitpanda connection whose sync threw `error`. */
export function bitpandaFailureStatus(error: unknown): {
  status: BitpandaFailureStatus;
  errorMessage: UserErrorCode;
} {
  switch (classifyProviderFailure(error)) {
    case "needs_reauth":
      return { status: "needs_reauth", errorMessage: BITPANDA_REAUTH_MESSAGE };
    case "transient":
      return { status: "transient_error", errorMessage: BITPANDA_TRANSIENT_MESSAGE };
    default:
      return { status: "error", errorMessage: BITPANDA_SYNC_FAILED_MESSAGE };
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
