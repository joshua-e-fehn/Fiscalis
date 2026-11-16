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
 * Fixes for the "join waitlist" line under <SignIn>, as of
 * @clerk/localizations 3.35.2: de and it repeat the link text as the question
 * ("Warteliste beitreten Warteliste beitreten"), fr, es and pt-PT say it twice
 * in other words, and ar-SA and zh-CN (our zh-Hans) leave both strings out, so
 * they fall back to English.
 */
const WAITLIST_PROMPT: Partial<Record<Language, { actionText: string; actionLink: string }>> = {
  de: { actionText: "Noch kein Zugang?", actionLink: "Warteliste beitreten" },
  it: { actionText: "Vuoi accedere in anteprima?", actionLink: "Unisciti alla lista d'attesa" },
  fr: { actionText: "Envie d'un accès anticipé ?", actionLink: "Rejoindre la liste d'attente" },
  es: { actionText: "¿Quieres acceso anticipado?", actionLink: "Únete a la lista de espera" },
  "pt-PT": { actionText: "Quer acesso antecipado?", actionLink: "Entrar na lista de espera" },
  ar: { actionText: "هل تريد الوصول المبكر؟", actionLink: "انضم إلى قائمة الانتظار" },
  "zh-Hans": { actionText: "想抢先体验？", actionLink: "加入候补名单" },
};

/**
 * Clerk's UI strings for a language (<ClerkProvider localization>). Emails
 * Clerk sends (sign-in codes, links) are localised in the Clerk dashboard.
 */
export function clerkLocalization(language: Language) {
  const base = CLERK_LOCALIZATIONS[language];
  const fix = WAITLIST_PROMPT[language];
  if (!fix) return base;
  return {
    ...base,
    signIn: {
      ...base.signIn,
      start: {
        ...base.signIn?.start,
        actionText__join_waitlist: fix.actionText,
        actionLink__join_waitlist: fix.actionLink,
      },
    },
  };
}
