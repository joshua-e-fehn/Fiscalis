import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import {
  USER_RATE_LIMITS,
  rateLimitedError,
  type UserRateLimitName,
} from "../../../services/security/rateLimit";

/**
 * Per-user buckets on user-triggered paid provider calls (ENG-226). The
 * settings and the error payload live in services/security/rateLimit.ts.
 * Scheduled syncs call the internal actions and are not throttled.
 */
const rateLimiter = new RateLimiter(components.rateLimiter, USER_RATE_LIMITS);

/**
 * Spends one token from `name` for `userId`; throws a ConvexError with
 * RateLimitedError data (retryAfter in ms) when the bucket is empty. Call it
 * after authentication and before the provider request.
 */
export async function enforceUserRateLimit(
  ctx: ActionCtx,
  name: UserRateLimitName,
  userId: string,
): Promise<void> {
  const status = await rateLimiter.limit(ctx, name, { key: userId });
  if (!status.ok) {
    throw new ConvexError(rateLimitedError(name, status.retryAfter));
  }
}

/**
 * Drops every rate-limit bucket keyed by `userId` (account deletion,
 * convex/account.ts purgeUserData), so no state for the user is left in
 * the rate-limiter component.
 */
export async function resetUserRateLimits(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  for (const name of Object.keys(USER_RATE_LIMITS) as UserRateLimitName[]) {
    await rateLimiter.reset(ctx, name, { key: userId });
  }
}
