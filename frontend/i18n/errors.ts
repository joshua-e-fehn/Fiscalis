"use client";

import { useCallback } from "react";
import { ConvexError } from "convex/values";
import { useTranslations } from "next-intl";

import type { Messages } from "./messages";

/** A code with a message under common.errors. */
export type ErrorCode = keyof Messages["common"]["errors"];

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
 * - ConvexError({ code, params }) with a known code → common.errors.<code>;
 * - ConvexError carrying a plain string (legacy) → that string;
 * - anything else → common.errors.generic (or `fallback`, when given).
 *
 * Internal and auth errors (plain Error) are never shown verbatim.
 */
export function useErrorMessage() {
  const t = useTranslations("common.errors");

  return useCallback(
    (error: unknown, fallback: ErrorCode = "generic"): string => {
      if (error instanceof ConvexError) {
        const data: unknown = error.data;
        if (isCodedErrorData(data)) {
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
