"use node";

/**
 * SnapTrade client configuration and utilities
 *
 * SnapTrade is used for broker connections (stocks, ETFs, options, etc.)
 * Unlike Plaid which uses access tokens, SnapTrade requires:
 * 1. Registering users on their platform first
 * 2. Each user gets a userId and userSecret
 * 3. The userSecret is used to authenticate API calls for that user
 */

import { ConvexError } from "convex/values";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { PROVIDER_TIMEOUT_MS, withRetry } from "./retry";
import { userError, type UserErrorCode } from "./userError";

/**
 * Get a configured SnapTrade client instance
 */
export function getSnaptradeClient(): Snaptrade {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_SECRET;

  if (!clientId) {
    throw new Error("SNAPTRADE_CLIENT_ID environment variable is not set");
  }

  if (!consumerKey) {
    throw new Error("SNAPTRADE_SECRET environment variable is not set");
  }

  return new Snaptrade({
    clientId,
    consumerKey,
    // Passed to every axios request; a timeout surfaces as ECONNABORTED,
    // which parseSnapTradeError reads as retryable
    baseOptions: { timeout: PROVIDER_TIMEOUT_MS },
  });
}

/**
 * Get the encryption key for storing sensitive data
 */
export function getEncryptionKey(): string {
  const key = process.env.CONVEX_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CONVEX_ENCRYPTION_KEY environment variable is not set");
  }
  return key;
}

/**
 * Normalize account type from SnapTrade to our schema
 */
export function normalizeAccountType(
  snaptradeType: string | undefined | null,
): string {
  if (!snaptradeType) return "CASH";

  // SnapTrade account types vary by broker
  // Common types: MARGIN, CASH, TFSA, RRSP, 401K, IRA, etc.
  return snaptradeType.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Parsed SnapTrade error: `message` is the provider's text (for logs),
 * `userCode` the user-facing error code (services/i18n/userErrorCodes.ts),
 * which the actions throw (snaptradeUserError) and persist as a
 * connection's errorMessage.
 */
export interface SnapTradeError {
  code: string;
  message: string;
  userCode: UserErrorCode;
  isRetryable: boolean;
  requiresReauth: boolean;
  retryAfterMs?: number;
}

/**
 * Parse SnapTrade API error into a structured format
 */
export function parseSnapTradeError(error: unknown): SnapTradeError {
  // Default error
  const defaultError: SnapTradeError = {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : String(error),
    userCode: "snaptradeUnknown",
    isRetryable: false,
    requiresReauth: false,
  };

  if (!error) return defaultError;

  // Handle axios-style errors (SnapTrade SDK uses axios)
  const axiosError = error as {
    response?: {
      status?: number;
      data?: {
        error?: string;
        error_code?: string;
        detail?: string;
        message?: string;
      };
      headers?: {
        "retry-after"?: string;
        "x-ratelimit-reset"?: string;
      };
    };
    code?: string;
    message?: string;
  };

  const status = axiosError.response?.status;
  const errorData = axiosError.response?.data;
  const errorMessage =
    errorData?.detail || errorData?.message || axiosError.message || "";

  // Rate limiting (429)
  if (status === 429) {
    const retryAfter = axiosError.response?.headers?.["retry-after"];
    const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

    return {
      code: "RATE_LIMITED",
      message: errorMessage,
      userCode: "snaptradeRateLimited",
      isRetryable: true,
      requiresReauth: false,
      retryAfterMs,
    };
  }

  // Authentication errors (401, 403)
  if (status === 401 || status === 403) {
    // Check if it's a connection auth issue or user auth issue
    const isConnectionAuth =
      errorMessage.toLowerCase().includes("connection") ||
      errorMessage.toLowerCase().includes("authorization") ||
      errorMessage.toLowerCase().includes("brokerage");

    return {
      code: isConnectionAuth ? "CONNECTION_EXPIRED" : "USER_SECRET_INVALID",
      message: errorMessage,
      userCode: isConnectionAuth
        ? "snaptradeConnectionExpired"
        : "snaptradeSessionExpired",
      isRetryable: false,
      requiresReauth: true,
    };
  }

  // Not found (404)
  if (status === 404) {
    const isConnection =
      errorMessage.toLowerCase().includes("connection") ||
      errorMessage.toLowerCase().includes("authorization");

    return {
      code: isConnection ? "CONNECTION_NOT_FOUND" : "USER_NOT_FOUND",
      message: errorMessage,
      userCode: isConnection
        ? "snaptradeConnectionNotFound"
        : "snaptradeNotRegistered",
      isRetryable: false,
      requiresReauth: false,
    };
  }

  // Server errors (5xx) - usually retryable
  if (status && status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: errorMessage,
      userCode: "snaptradeUnavailable",
      isRetryable: true,
      requiresReauth: false,
      retryAfterMs: 5000,
    };
  }

  // Network/timeout errors
  if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
    return {
      code: "TIMEOUT",
      message: errorMessage,
      userCode: "snaptradeTimeout",
      isRetryable: true,
      requiresReauth: false,
      retryAfterMs: 2000,
    };
  }

  if (axiosError.code === "ENOTFOUND" || axiosError.code === "ECONNREFUSED") {
    return {
      code: "NETWORK_ERROR",
      message: errorMessage,
      userCode: "snaptradeNetworkError",
      isRetryable: true,
      requiresReauth: false,
      retryAfterMs: 5000,
    };
  }

  // Brokerage-specific errors
  if (
    errorMessage.toLowerCase().includes("brokerage") ||
    errorMessage.toLowerCase().includes("broker")
  ) {
    return {
      code: "BROKERAGE_ERROR",
      message: errorMessage,
      userCode: "snaptradeBrokerageError",
      isRetryable: false,
      requiresReauth: false,
    };
  }

  return {
    ...defaultError,
    message: errorMessage || defaultError.message,
  };
}

/**
 * Run a SnapTrade read with retries (convex/lib/retry.ts) on the errors
 * parseSnapTradeError marks retryable (429, 5xx, timeouts, network). The
 * last error is rethrown unchanged, so callers still parse it.
 */
export function withSnaptradeRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    shouldRetry: (error) => parseSnapTradeError(error).isRetryable,
    retryAfterMs: (error) => parseSnapTradeError(error).retryAfterMs,
  });
}

/**
 * Throws a SnapTrade failure as its coded user error (convex/lib/userError.ts);
 * an error that already is one (thrown inside the same try) passes unchanged.
 */
export function snaptradeUserError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  userError(parseSnapTradeError(error).userCode);
}

/**
 * Check if error requires re-authentication
 */
export function requiresReauthentication(error: unknown): boolean {
  const parsed = parseSnapTradeError(error);
  return parsed.requiresReauth;
}
