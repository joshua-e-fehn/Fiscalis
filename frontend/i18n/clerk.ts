import { arSA, deDE, enGB, esES, frFR, hiIN, itIT, ptPT, ruRU, zhCN } from "@clerk/localizations";

import type { Language } from "./locales";

const CLERK_LOCALIZATIONS = {
  en: enGB,
  de: deDE,
  es: esES,
  fr: frFR,
  it: itIT,
  "pt-PT": ptPT,
  ru: ruRU,
  "zh-Hans": zhCN,
  hi: hiIN,
  ar: arSA,
} satisfies Record<
  Language,
  unknown
>;

/**
 * Clerk's UI strings for a language (<ClerkProvider localization>). Emails
 * Clerk sends (sign-in codes, links) are localised in the Clerk dashboard.
 */
export function clerkLocalization(language: Language) {
  return CLERK_LOCALIZATIONS[language];
}
