/**
 * Validation for the user's general settings (userSettings), shared by the
 * onboarding profile step and Settings > General (convex/onboarding.ts
 * saveUserSettings / updateSettings). The date of birth has its own validator
 * (frontend/lib/utils/date.ts validateBirthDate).
 */
import { isDisplayCurrency, type DisplayCurrency } from "../finance/displayCurrency";

export const LANGUAGES = ["en", "de", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const MAX_DISPLAY_NAME_LENGTH = 80;

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

/** Fields a settings form may send; undefined means "leave unchanged". */
export interface SettingsInput {
  displayName?: string;
  defaultCurrency?: string;
  language?: string;
  theme?: string;
}

/**
 * The validated patch. A key that is present with the value undefined clears
 * that field (an emptied display name); a missing key leaves it unchanged.
 */
export interface SettingsPatch {
  displayName?: string | undefined;
  defaultCurrency?: DisplayCurrency;
  language?: Language;
  theme?: Theme;
}

export type SettingsValidation =
  | { ok: true; value: SettingsPatch }
  | { ok: false; error: string };

/**
 * Validate and normalise the given settings fields: the display name is
 * trimmed (empty clears it) and at most MAX_DISPLAY_NAME_LENGTH characters,
 * the currency must be a display currency (case-insensitive), the language
 * en/de and the theme light/dark/system.
 */
export function validateSettings(input: SettingsInput): SettingsValidation {
  const value: SettingsPatch = {};

  if (input.displayName !== undefined) {
    const name = input.displayName.trim();
    if (name.length > MAX_DISPLAY_NAME_LENGTH) {
      return {
        ok: false,
        error: `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
      };
    }
    value.displayName = name || undefined;
  }

  if (input.defaultCurrency !== undefined) {
    const code = input.defaultCurrency.trim().toUpperCase();
    if (!isDisplayCurrency(code)) {
      return { ok: false, error: `Unsupported currency: ${input.defaultCurrency}` };
    }
    value.defaultCurrency = code;
  }

  if (input.language !== undefined) {
    if (!isLanguage(input.language)) {
      return { ok: false, error: `Unsupported language: ${input.language}` };
    }
    value.language = input.language;
  }

  if (input.theme !== undefined) {
    if (!isTheme(input.theme)) {
      return { ok: false, error: `Unsupported theme: ${input.theme}` };
    }
    value.theme = input.theme;
  }

  return { ok: true, value };
}
