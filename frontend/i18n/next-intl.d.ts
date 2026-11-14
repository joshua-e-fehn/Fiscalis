import type { formats } from "./formats";
import type { IntlLocale } from "./locales";
import type { Messages } from "./messages";

// Types every t() key, its ICU arguments, format names and the locale.
declare module "next-intl" {
  interface AppConfig {
    Locale: IntlLocale;
    Messages: Messages;
    Formats: typeof formats;
  }
}
