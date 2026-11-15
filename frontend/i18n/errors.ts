"use client";

import { useCallback } from "react";
import { ConvexError } from "convex/values";
import { useTranslations } from "next-intl";

import { isUserErrorCode } from "@/../services/i18n/userErrorCodes";

import type { Messages } from "./messages";

/** Dotted paths to the messages of a catalogue object: { a: { b } } → "a.b". */
type MessagePaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : MessagePaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** A code with a message under common.errors (birthDate.format is nested). */
export type ErrorCode = MessagePaths<Messages["common"]["errors"]>;

interface CodedErrorData {
  code: string;
  params?: Record<string, string | number>;
}

function isCodedErrorData(data: unknown): data is CodedErrorData {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { code?: unknown }).code === "string"
  );
}

/**
 * Turns a caught error into a message for the user, in their language:
 * - ConvexError({ code, params }) whose code is in `overrides` → that message
 *   (a caller's own wording for codes not yet in common.errors);
 * - ConvexError({ code, params }) with a known code → common.errors.<code>
 *   (thrown by convex/lib/userError.ts; codes in services/i18n/userErrorCodes.ts);
 * - ConvexError carrying a plain string (legacy) → that string;
 * - anything else → common.errors.generic (or `fallback`, when given).
 *
 * Internal and auth errors (plain Error) are never shown verbatim.
 */
export function useErrorMessage() {
  const t = useTranslations("common.errors");

  return useCallback(
    (
      error: unknown,
      fallback: ErrorCode = "generic",
      overrides?: Readonly<Partial<Record<string, string>>>,
    ): string => {
      if (error instanceof ConvexError) {
        const data: unknown = error.data;
        if (isCodedErrorData(data)) {
          const override = overrides?.[data.code];
          if (override) return override;
          const key = `${data.code}` as ErrorCode;
          if (t.has(key)) return t(key, data.params);
        } else if (typeof data === "string" && data) {
          return data;
        }
      }
      return t(fallback);
    },
    [t],
  );
}

/**
 * Renders an error a connection row stores (errorMessage): a user error code
 * → common.errors.<code>; text stored before codes (English) → as it is;
 * nothing → undefined.
 */
export function useStoredErrorMessage() {
  const t = useTranslations("common.errors");

  return useCallback(
    (stored: string | undefined): string | undefined => {
      if (!stored) return undefined;
      return isUserErrorCode(stored) ? t(stored as ErrorCode) : stored;
    },
    [t],
  );
}
