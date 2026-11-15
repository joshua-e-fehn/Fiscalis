/**
 * Per-user throttles on user-triggered paid provider calls (ENG-226).
 *
 * The buckets are enforced by the @convex-dev/rate-limiter component in
 * frontend/convex/lib/rateLimit.ts. When one is empty the action throws a
 * ConvexError whose data is a RateLimitedError; the app turns that into a
 * "try again in N min" message (frontend/lib/actionError.ts).
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Token-bucket settings, in the component's config shape. */
export interface UserRateLimit {
  kind: "token bucket";
  /** Tokens refilled per `period` */
  rate: number;
  /** Refill period in milliseconds */
  period: number;
  /** Burst size: tokens a rested user can spend at once */
  capacity: number;
}

/**
 * - manualSync: "Sync all" (every provider at once). A burst of 3, then one
 *   every 10 minutes.
 * - providerRefresh: one provider's refresh (Plaid accounts/transactions,
 *   SnapTrade sync, Bitpanda sync). A burst of 5, then one every 6 minutes.
 * - providerLink: Plaid link / update-mode link tokens and SnapTrade Connect
 *   URLs (connect and reconnect). A burst of 5, then one every 6 minutes.
 * - quoteRefresh: the scheduled SnapTrade quote refresh (ENG-239,
 *   services/pricing/livePrices.ts), one token per user and run. Two an
 *   hour, so the hourly cron always passes and a re-run or a backlog of
 *   scheduled runs cannot call SnapTrade more often for one user.
 */
export const USER_RATE_LIMITS = {
  manualSync: { kind: "token bucket", rate: 6, period: HOUR_MS, capacity: 3 },
  providerRefresh: {
    kind: "token bucket",
    rate: 10,
    period: HOUR_MS,
    capacity: 5,
  },
  providerLink: {
    kind: "token bucket",
    rate: 10,
    period: HOUR_MS,
    capacity: 5,
  },
  quoteRefresh: {
    kind: "token bucket",
    rate: 2,
    period: HOUR_MS,
    capacity: 2,
  },
} as const satisfies Record<string, UserRateLimit>;

export type UserRateLimitName = keyof typeof USER_RATE_LIMITS;

/**
 * ConvexError data thrown when a bucket is empty. Same shape as the
 * component's own RateLimitError, so its isRateLimitError also matches. A
 * type alias (not an interface) so it is a ConvexError `Value`.
 */
export type RateLimitedError = {
  kind: "RateLimited";
  name: string;
  /** Milliseconds until the call would succeed */
  retryAfter: number;
};

export function rateLimitedError(
  name: string,
  retryAfter: number,
): RateLimitedError {
  return { kind: "RateLimited", name, retryAfter };
}

/** The RateLimitedError in a ConvexError's `data`, or null. */
export function parseRateLimitedError(data: unknown): RateLimitedError | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.kind !== "RateLimited") return null;
  const retryAfter =
    typeof d.retryAfter === "number" && Number.isFinite(d.retryAfter)
      ? Math.max(0, d.retryAfter)
      : 0;
  return {
    kind: "RateLimited",
    name: typeof d.name === "string" ? d.name : "",
    retryAfter,
  };
}

/** Whole minutes to wait, rounded up and at least 1. */
export function retryAfterMinutes(retryAfterMs: number): number {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return 1;
  return Math.max(1, Math.ceil(retryAfterMs / MINUTE_MS));
}

/** User-facing message for a throttled call. */
export function rateLimitMessage(retryAfterMs: number): string {
  const minutes = retryAfterMinutes(retryAfterMs);
  return `Too many requests. Please try again in ${minutes} min.`;
}
