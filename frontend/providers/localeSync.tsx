"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone } from "next-intl";

import { setLocaleCookie } from "@/i18n/actions";
import {
  LOCALE_COOKIE_MAX_AGE,
  TIME_ZONE_COOKIE,
  isLanguage,
  languageForLocale,
  renderedLanguage,
  type Language,
} from "@/i18n/locales";
import { useUserSettings } from "@/hooks/convex/onboarding";

/**
 * Switch the UI to `language`: write the locale cookie the server renders
 * from and re-render the server components. A language the UI is not
 * rendered in yet (RENDERED_LANGUAGES) renders as English, so it changes
 * nothing visible and causes no refresh.
 */
function useApplyLanguage() {
  const router = useRouter();
  const current = languageForLocale(useLocale());

  return useCallback(
    async (language: Language) => {
      const target = renderedLanguage(language);
      if (target === current) return;
      await setLocaleCookie(target);
      router.refresh();
    },
    [current, router],
  );
}

/**
 * Keeps the server render in step with the browser and the user's settings:
 * - the time zone cookie holds the browser's zone, so server-formatted dates
 *   match the viewer's clock from the next request on (no refresh);
 * - when the stored userSettings.language differs from the language the page
 *   was rendered in (saved in Settings > General or onboarding, or changed on
 *   another device), the locale cookie is updated and the page refreshed.
 *   This is the only path that applies a language; it never writes
 *   userSettings.
 *
 * Must sit under ConvexClientProvider and NextIntlClientProvider.
 */
export function LocaleSync() {
  const renderedTimeZone = useTimeZone();
  const settings = useUserSettings();
  const applyLanguage = useApplyLanguage();
  const stored = settings?.language;
  const attempted = useRef<string | null>(null);
  const zoneSent = useRef(false);

  useEffect(() => {
    // Once per page load. Takes effect on the next request: nothing formats
    // dates on the server yet, so a refresh would only cost a re-render.
    if (zoneSent.current) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || zone === renderedTimeZone) return;
    zoneSent.current = true;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  }, [renderedTimeZone]);

  useEffect(() => {
    // Try each stored value once, so a failing cookie write cannot loop.
    if (!stored || !isLanguage(stored) || attempted.current === stored) return;
    attempted.current = stored;
    applyLanguage(stored).catch((error: unknown) =>
      console.error("Failed to apply the stored language:", error),
    );
  }, [stored, applyLanguage]);

  return null;
}
