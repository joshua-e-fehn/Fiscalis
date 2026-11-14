"use client";

import { ConvexError } from "convex/values";
import { toast } from "sonner";
import {
  parseRateLimitedError,
  rateLimitMessage,
  retryAfterMinutes,
} from "@/../services/security/rateLimit";

/**
 * Normalises an error thrown by a Convex action call for the UI. A
 * rate-limited provider call (ConvexError with RateLimitedError data,
 * convex/lib/rateLimit.ts) becomes a friendly "try again in N min" Error and
 * is shown as a toast, since most call sites only log their errors. Any
 * other error is returned as an Error unchanged.
 *
 * `rateLimitText` words the throttle message in the viewer's language
 * (common.errors.rateLimited); without it the message is English.
 */
export function toActionError(
  err: unknown,
  rateLimitText?: (minutes: number) => string,
): Error {
  if (err instanceof ConvexError) {
    const limited = parseRateLimitedError(err.data);
    if (limited) {
      const message = rateLimitText
        ? rateLimitText(retryAfterMinutes(limited.retryAfter))
        : rateLimitMessage(limited.retryAfter);
      toast.error(message, { id: `rate-limit-${limited.name}` });
      return new Error(message);
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}
