import { ConvexError } from "convex/values";
import type {
  UserErrorCode,
  UserErrorParams,
} from "../../../services/i18n/userErrorCodes";

export type { UserErrorCode } from "../../../services/i18n/userErrorCodes";

/**
 * Throws an error the user can act on, as ConvexError({ code, params }):
 * ConvexError data survives production error redaction, and the client
 * shows common.errors.<code> in the user's language (i18n/errors.ts
 * useErrorMessage). Codes are listed in services/i18n/userErrorCodes.ts.
 *
 * Auth and internal failures ("Not authenticated", missing env vars) stay
 * plain English Errors: they are not the user's to fix.
 */
export function userError(code: UserErrorCode, params?: UserErrorParams): never {
  throw userErrorOf(code, params);
}

/** The error {@link userError} throws, for a caller that rethrows it later. */
export function userErrorOf(
  code: UserErrorCode,
  params?: UserErrorParams,
): ConvexError<{ code: UserErrorCode; params?: UserErrorParams }> {
  return new ConvexError(params ? { code, params } : { code });
}
