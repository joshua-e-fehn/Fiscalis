"use server";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLanguage } from "./locales";

/**
 * Store the UI language in the locale cookie, which i18n/request.ts reads on
 * the server. Callers persist userSettings.language first (the source of
 * truth for signed-in users) and then call router.refresh().
 */
export async function setLocaleCookie(language: string): Promise<void> {
  if (!isLanguage(language)) return;
  (await cookies()).set(LOCALE_COOKIE, language, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
