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

import { Snaptrade } from "snaptrade-typescript-sdk";

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
 * Normalize asset type from SnapTrade to our schema
 */
export function normalizeAssetType(
  snaptradeType: string | undefined | null,
): string {
  if (!snaptradeType) return "other";

  const typeMap: Record<string, string> = {
    equity: "equity",
    stock: "equity",
    etf: "etf",
    mutual_fund: "mutual_fund",
    bond: "bond",
    option: "option",
    cryptocurrency: "cryptocurrency",
    crypto: "cryptocurrency",
    forex: "forex",
    fx: "forex",
    future: "futures",
    futures: "futures",
  };

  const normalized = snaptradeType.toLowerCase().replace(/[^a-z_]/g, "_");
  return typeMap[normalized] || "other";
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
 * SnapTrade error codes and their meanings
 */
export const SNAPTRADE_ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: "Invalid SnapTrade credentials",
  USER_NOT_FOUND: "User not registered with SnapTrade",
  USER_SECRET_INVALID: "User secret is invalid or expired",

  // Connection errors
  CONNECTION_NOT_FOUND: "Broker connection not found",
  CONNECTION_EXPIRED:
    "Broker connection has expired - re-authentication required",
  CONNECTION_DISABLED: "Broker connection has been disabled",
  BROKERAGE_ERROR: "The brokerage reported an error",

  // Rate limiting
  RATE_LIMITED: "Too many requests - please try again in a moment",

  // General errors
  NETWORK_ERROR: "Network error - please check your connection",
  TIMEOUT: "Request timed out - please try again",
  UNKNOWN: "An unexpected error occurred",
} as const;

/**
 * Parsed SnapTrade error with user-friendly message
 */
export interface SnapTradeError {
  code: string;
  message: string;
  userMessage: string;
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
    userMessage: SNAPTRADE_ERROR_CODES.UNKNOWN,
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
  const errorCode =
    errorData?.error_code || errorData?.error || axiosError.code;
  const errorMessage =
    errorData?.detail || errorData?.message || axiosError.message || "";

  // Rate limiting (429)
  if (status === 429) {
    const retryAfter = axiosError.response?.headers?.["retry-after"];
    const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

    return {
      code: "RATE_LIMITED",
      message: errorMessage,
      userMessage: SNAPTRADE_ERROR_CODES.RATE_LIMITED,
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
      userMessage: isConnectionAuth
        ? SNAPTRADE_ERROR_CODES.CONNECTION_EXPIRED
        : SNAPTRADE_ERROR_CODES.USER_SECRET_INVALID,
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
      userMessage: isConnection
        ? SNAPTRADE_ERROR_CODES.CONNECTION_NOT_FOUND
        : SNAPTRADE_ERROR_CODES.USER_NOT_FOUND,
      isRetryable: false,
      requiresReauth: false,
    };
  }

  // Server errors (5xx) - usually retryable
  if (status && status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: errorMessage,
      userMessage: "SnapTrade is experiencing issues. Please try again later.",
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
      userMessage: SNAPTRADE_ERROR_CODES.TIMEOUT,
      isRetryable: true,
      requiresReauth: false,
      retryAfterMs: 2000,
    };
  }

  if (axiosError.code === "ENOTFOUND" || axiosError.code === "ECONNREFUSED") {
    return {
      code: "NETWORK_ERROR",
      message: errorMessage,
      userMessage: SNAPTRADE_ERROR_CODES.NETWORK_ERROR,
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
      userMessage: `${SNAPTRADE_ERROR_CODES.BROKERAGE_ERROR}: ${errorMessage}`,
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
 * Sleep utility for retry delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: SnapTradeError, attempt: number) => void;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: SnapTradeError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = parseSnapTradeError(error);

      // Don't retry if error is not retryable
      if (!lastError.isRetryable || attempt === maxRetries) {
        throw new Error(lastError.userMessage);
      }

      // Calculate delay with exponential backoff
      const baseDelay = lastError.retryAfterMs || initialDelayMs;
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelayMs);

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await sleep(delay);
    }
  }

  throw new Error(lastError?.userMessage || SNAPTRADE_ERROR_CODES.UNKNOWN);
}

/**
 * Format error for user display
 */
export function formatErrorForUser(error: unknown): string {
  const parsed = parseSnapTradeError(error);
  return parsed.userMessage;
}

/**
 * Check if error requires re-authentication
 */
export function requiresReauthentication(error: unknown): boolean {
  const parsed = parseSnapTradeError(error);
  return parsed.requiresReauth;
}
