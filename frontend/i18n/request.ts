import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { formats } from "./formats";
import {
  DEFAULT_TIME_ZONE,
  LOCALE_COOKIE,
  TIME_ZONE_COOKIE,
  intlLocaleFor,
  resolveLocale,
  validTimeZone,
} from "./locales";
import { messagesFor } from "./messages";

/**
 * Per-request i18n config for next-intl (wired in next.config.mjs). There is
 * no locale routing: the language comes from the locale cookie (mirroring
 * userSettings.language, see providers/localeSync.tsx), else Accept-Language,
 * else English. Every page is already dynamic (<ClerkProvider dynamic>), so
 * reading cookies here costs nothing extra.
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const language = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });

  return {
    locale: intlLocaleFor(language),
    messages: messagesFor(language),
    timeZone:
      validTimeZone(cookieStore.get(TIME_ZONE_COOKIE)?.value) ??
      DEFAULT_TIME_ZONE,
    formats,
    onError(error) {
      // A missing key renders its path (getMessageFallback); say so in dev.
      if (process.env.NODE_ENV !== "production") console.error(error);
    },
    getMessageFallback({ namespace, key }) {
      return [namespace, key].filter(Boolean).join(".");
    },
  };
});
