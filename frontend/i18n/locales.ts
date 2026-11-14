/**
 * The app's locales. The supported language codes have one definition,
 * services/settings/userSettings.ts LANGUAGES (also validated by
 * convex/onboarding.ts); this module adds what the UI needs on top: the Intl
 * tag each code formats with, the planned (not yet enabled) locales, text
 * direction, the cookies and a pure locale resolver.
 *
 * App codes ("en", "de") are what is stored (userSettings.language), what the
 * locale cookie holds and how the catalogues under messages/ are named.
 * next-intl is given the Intl tag instead, so dates are day-first in English
 * (en-GB) and German formats as de-DE.
 *
 * Pure module (no Next.js imports): services/i18n/i18n.test.ts covers it.
 */
import {
  LANGUAGES,
  isLanguage,
  type Language,
} from "@/../services/settings/userSettings";

export { LANGUAGES, isLanguage, type Language };

export const DEFAULT_LANGUAGE: Language = "en";

/**
 * The languages the UI is rendered in, which can be narrower than LANGUAGES
 * (the languages a user can store). German has a catalogue and can be picked,
 * but until the feature batches translate the screens nearly every string is
 * English. Rendering that as <html lang="de">, with German Clerk screens and
 * German metadata, would make browsers offer to translate the page and screen
 * readers read English with German pronunciation. So the page language, Clerk
 * and the catalogue follow this list; "de" joins it once the app shell is
 * translated. NEXT_PUBLIC_I18N_PREVIEW=1 renders every language, for checking
 * the catalogues locally (inlined at build time on both server and client).
 */
export const RENDERED_LANGUAGES: readonly Language[] =
  process.env.NEXT_PUBLIC_I18N_PREVIEW === "1" ? LANGUAGES : [DEFAULT_LANGUAGE];

/** The language a stored or requested language is rendered in. */
export function renderedLanguage(
  language: Language,
  rendered: readonly Language[] = RENDERED_LANGUAGES,
): Language {
  return rendered.includes(language) ? language : DEFAULT_LANGUAGE;
}

/** Mirrors userSettings.language for the server render (i18n/request.ts). */
export const LOCALE_COOKIE = "fiscalis-locale";
/** The browser's IANA time zone, set client-side (providers/localeSync.tsx). */
export const TIME_ZONE_COOKIE = "fiscalis-tz";
/** Used until the browser has reported its time zone. */
export const DEFAULT_TIME_ZONE = "Europe/Zurich";
/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The BCP 47 tag each language is formatted with; next-intl's locale. */
export const INTL_TAGS = {
  en: "en-GB",
  de: "de-DE",
} as const satisfies Record<Language, string>;

export type IntlLocale = (typeof INTL_TAGS)[Language];

/** Each language's name in that language, for language pickers. */
export const LANGUAGE_ENDONYMS: Record<Language, string> = {
  en: "English",
  de: "Deutsch",
};

/**
 * Locales planned but not enabled: no catalogue exists yet. Adding one means
 * moving it into LANGUAGES, adding messages/<code>/ and an INTL_TAGS entry.
 */
export const PLANNED_LOCALES = [
  "es",
  "fr",
  "it",
  "pt-PT",
  "ru",
  "zh-Hans",
  "hi",
  "ar",
] as const;

const RTL_LOCALES: readonly string[] = ["ar"];

/** Text direction of a locale (app code or Intl tag), for <html dir>. */
export function localeDirection(locale: string): "ltr" | "rtl" {
  const primary = locale.split("-")[0].toLowerCase();
  return RTL_LOCALES.includes(primary) ? "rtl" : "ltr";
}

export function intlLocaleFor(language: Language): IntlLocale {
  return INTL_TAGS[language];
}

/** The app language an Intl tag belongs to (e.g. "de-DE" or "de-CH" → "de"). */
export function languageForLocale(locale: string): Language {
  const primary = locale.split("-")[0].toLowerCase();
  return isLanguage(primary) ? primary : DEFAULT_LANGUAGE;
}

/**
 * The language ranges of an Accept-Language header, most preferred first.
 * Ranges with q=0 and the wildcard are dropped; equal weights keep their
 * order.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [range, ...params] = part.trim().split(";");
      const qParam = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { range: range.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter(({ range, q }) => range && range !== "*" && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ range }) => range);
}

/**
 * The language to render in: the locale cookie if it holds a rendered
 * language, else the first rendered language in Accept-Language, else
 * English. `rendered` defaults to RENDERED_LANGUAGES.
 */
export function resolveLocale({
  cookie,
  acceptLanguage,
  rendered = RENDERED_LANGUAGES,
}: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  rendered?: readonly Language[];
}): Language {
  const isRendered = (code: string): code is Language =>
    isLanguage(code) && rendered.includes(code);
  if (cookie && isRendered(cookie)) return cookie;
  for (const range of parseAcceptLanguage(acceptLanguage)) {
    const primary = range.split("-")[0].toLowerCase();
    if (isRendered(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

/** A valid IANA time zone name, or undefined. */
export function validTimeZone(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}
