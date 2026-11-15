"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { setLocaleCookie } from "@/i18n/actions";
import {
  LANGUAGE_ENDONYMS,
  RENDERED_LANGUAGES,
  languageForLocale,
  type Language,
} from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * Language switch for signed-out visitors on the public pages. It only writes
 * the locale cookie (i18n/actions.ts) and re-renders: there is no account to
 * store the choice in. Signed-in users change language in the user menu,
 * which also saves it to their settings.
 *
 * Lists RENDERED_LANGUAGES, so it renders nothing while only one language is
 * rendered.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("landing.languageToggle");
  const router = useRouter();
  const current = languageForLocale(useLocale());
  const [isPending, startTransition] = useTransition();

  if (RENDERED_LANGUAGES.length < 2) return null;

  const choose = (language: Language) => {
    if (language === current) return;
    startTransition(async () => {
      await setLocaleCookie(language);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "flex items-center rounded-lg border border-white/[0.08] p-0.5",
        className,
      )}
    >
      {RENDERED_LANGUAGES.map((language) => {
        const selected = language === current;
        return (
          <button
            key={language}
            type="button"
            lang={language}
            aria-pressed={selected}
            aria-label={LANGUAGE_ENDONYMS[language]}
            disabled={isPending}
            onClick={() => choose(language)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium uppercase transition-colors disabled:opacity-60",
              selected
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white",
            )}
          >
            {/* Primary subtag only: "pt-PT" shows as "PT", not "PT-PT" */}
            {language.split("-")[0]}
          </button>
        );
      })}
    </div>
  );
}
