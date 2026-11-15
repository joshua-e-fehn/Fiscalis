/**
 * Guards for the UI translations (frontend/messages/<language>/<ns>.json)
 * and the locale resolver (frontend/i18n/locales.ts). A missing German key
 * already fails `tsc` (frontend/i18n/messages.ts); this also catches extra
 * keys, mismatched ICU arguments, empty strings and catalogue folders that
 * are not registered as languages.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  INTL_TAGS,
  LANGUAGES,
  PLANNED_LOCALES,
  languageForLocale,
  localeDirection,
  matchLanguage,
  RENDERED_LANGUAGES,
  parseAcceptLanguage,
  renderedLanguage,
  resolveLocale,
  validTimeZone,
} from "@/i18n/locales";
import { USER_ERROR_CODES, isUserErrorCode } from "./userErrorCodes";

const MESSAGES_DIR = path.resolve(__dirname, "../../frontend/messages");
const SOURCE = "en";

type Catalogue = Record<string, string>;

/** { a: { b: "x" } } → { "a.b": "x" }; non-string leaves are reported. */
export function flatten(value: unknown, prefix = ""): Catalogue {
  if (typeof value === "string") return { [prefix]: value };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${prefix || "(root)"}: expected a string or an object`);
  }
  return Object.entries(value).reduce<Catalogue>(
    (acc, [key, child]) => ({
      ...acc,
      ...flatten(child, prefix ? `${prefix}.${key}` : key),
    }),
    {},
  );
}

/**
 * The argument names an ICU message uses, including those nested in
 * plural/select branches: "{count, plural, one {# item} other {{name}}}" →
 * ["count", "name"]. Rich-text tags (<b>…</b>) count as arguments too.
 */
export function icuArguments(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*[,}]/g)) {
    names.add(match[1]);
  }
  for (const match of message.matchAll(/<([A-Za-z_][\w]*)>/g)) {
    names.add(`<${match[1]}>`);
  }
  return [...names].sort();
}

function loadLanguage(language: string): Record<string, Catalogue> {
  const dir = path.join(MESSAGES_DIR, language);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => [
        name.replace(/\.json$/, ""),
        flatten(JSON.parse(readFileSync(path.join(dir, name), "utf8"))),
      ]),
  );
}

const languageDirs = readdirSync(MESSAGES_DIR).filter((name) =>
  statSync(path.join(MESSAGES_DIR, name)).isDirectory(),
);

describe("message catalogues", () => {
  it("has a folder for exactly the supported languages", () => {
    expect([...languageDirs].sort()).toEqual([...LANGUAGES].sort());
  });

  const source = loadLanguage(SOURCE);

  it("has no empty messages in any language", () => {
    for (const language of languageDirs) {
      for (const [ns, messages] of Object.entries(loadLanguage(language))) {
        const empty = Object.entries(messages)
          .filter(([, text]) => !text.trim())
          .map(([key]) => `${language}/${ns}:${key}`);
        expect(empty).toEqual([]);
      }
    }
  });

  for (const language of languageDirs.filter((l) => l !== SOURCE)) {
    describe(language, () => {
      const target = loadLanguage(language);

      it("has the same namespaces as en", () => {
        expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
      });

      it("has the same keys as en in every namespace", () => {
        for (const ns of Object.keys(source)) {
          expect(Object.keys(target[ns] ?? {}).sort(), ns).toEqual(
            Object.keys(source[ns]).sort(),
          );
        }
      });

      it("uses the same ICU arguments as en", () => {
        const mismatches: string[] = [];
        for (const [ns, messages] of Object.entries(source)) {
          for (const [key, text] of Object.entries(messages)) {
            const translated = target[ns]?.[key];
            if (translated === undefined) continue;
            const want = icuArguments(text).join(",");
            const got = icuArguments(translated).join(",");
            if (want !== got) {
              mismatches.push(`${ns}:${key} en {${want}} ${language} {${got}}`);
            }
          }
        }
        expect(mismatches).toEqual([]);
      });
    });
  }
});

describe("user error codes", () => {
  it("are unique", () => {
    expect(new Set(USER_ERROR_CODES).size).toBe(USER_ERROR_CODES.length);
  });

  for (const language of languageDirs) {
    it(`each have a message under common.errors in ${language}`, () => {
      const common = loadLanguage(language).common ?? {};
      const missing = USER_ERROR_CODES.filter(
        (code) => !common[`errors.${code}`]?.trim(),
      );
      expect(missing).toEqual([]);
    });
  }

  it("recognises codes and rejects stored English text", () => {
    expect(isUserErrorCode("bitpandaReauthRequired")).toBe(true);
    expect(isUserErrorCode("birthDate.future")).toBe(true);
    expect(isUserErrorCode("Bitpanda API error 400")).toBe(false);
    expect(isUserErrorCode(undefined)).toBe(false);
  });
});

describe("icuArguments", () => {
  it("finds simple, plural-nested and rich-text arguments", () => {
    expect(icuArguments("Hello {name}")).toEqual(["name"]);
    expect(
      icuArguments("{count, plural, one {# account} other {# accounts for {name}}}"),
    ).toEqual(["count", "name"]);
    expect(icuArguments("Read the <link>guide</link>")).toEqual(["<link>"]);
    expect(icuArguments("No arguments")).toEqual([]);
  });
});

describe("parseAcceptLanguage", () => {
  it("orders ranges by quality and drops q=0 and the wildcard", () => {
    expect(parseAcceptLanguage("de-CH,de;q=0.9,en;q=0.8,*;q=0.5")).toEqual([
      "de-CH",
      "de",
      "en",
    ]);
    expect(parseAcceptLanguage("en;q=0.5, fr, de;q=0")).toEqual(["fr", "en"]);
  });

  it("keeps the header order for equal weights", () => {
    expect(parseAcceptLanguage("fr, en, de")).toEqual(["fr", "en", "de"]);
  });

  it("returns nothing for a missing header", () => {
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });
});

describe("matchLanguage", () => {
  const candidates = ["en", "de", "pt", "pt-PT", "zh-Hans"] as const;

  it("matches the longest prefix on subtag boundaries", () => {
    expect(matchLanguage("de-CH", candidates)).toBe("de");
    expect(matchLanguage("pt-PT", candidates)).toBe("pt-PT");
    expect(matchLanguage("pt-BR", candidates)).toBe("pt");
    expect(matchLanguage("zh-Hans-CN", candidates)).toBe("zh-Hans");
    expect(matchLanguage("ZH-hans", candidates)).toBe("zh-Hans");
  });

  it("serves Simplified Chinese for region-only Chinese tags", () => {
    expect(matchLanguage("zh", candidates)).toBe("zh-Hans");
    expect(matchLanguage("zh-CN", candidates)).toBe("zh-Hans");
    expect(matchLanguage("zh_SG", candidates)).toBe("zh-Hans");
    expect(matchLanguage("zh-TW", candidates)).toBe("zh-Hans");
  });

  it("returns undefined when nothing matches", () => {
    expect(matchLanguage("fr-FR", candidates)).toBeUndefined();
    expect(matchLanguage("zh-CN", ["en", "de"])).toBeUndefined();
    expect(matchLanguage("", candidates)).toBeUndefined();
  });

  it("ignores ranges named like Object.prototype members", () => {
    expect(matchLanguage("constructor", candidates)).toBeUndefined();
    expect(matchLanguage("__proto__", candidates)).toBeUndefined();
    expect(
      resolveLocale({ acceptLanguage: "constructor, de", rendered: LANGUAGES }),
    ).toBe("de");
  });
});

describe("resolveLocale", () => {
  // Every supported language rendered, as once the UI is translated.
  const rendered = LANGUAGES;

  it("prefers a supported cookie", () => {
    expect(
      resolveLocale({ cookie: "de", acceptLanguage: "en-US", rendered }),
    ).toBe("de");
  });

  it("ignores an unsupported cookie", () => {
    expect(
      resolveLocale({ cookie: "xx", acceptLanguage: "de-AT", rendered }),
    ).toBe("de");
  });

  it("takes the first supported browser language", () => {
    expect(
      resolveLocale({
        acceptLanguage: "nl-NL,nl;q=0.9,de;q=0.8,en;q=0.7",
        rendered,
      }),
    ).toBe("de");
  });

  it("falls back to English", () => {
    expect(resolveLocale({ rendered })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "nl, sv", rendered })).toBe("en");
  });
});

// The defaults assume NEXT_PUBLIC_I18N_PREVIEW is unset.
describe.skipIf(process.env.NEXT_PUBLIC_I18N_PREVIEW === "1")("rendered languages", () => {
  it("renders English and German, and only supported languages", () => {
    expect(RENDERED_LANGUAGES).toEqual(expect.arrayContaining(["en", "de"]));
    const supported: readonly string[] = LANGUAGES;
    expect(RENDERED_LANGUAGES.filter((l) => !supported.includes(l))).toEqual([]);
  });

  it("renders Italian for Italian visitors", () => {
    expect(resolveLocale({ acceptLanguage: "it-IT,it;q=0.9" })).toBe("it");
    expect(renderedLanguage("it")).toBe("it");
  });

  it("renders German for German visitors and users by default", () => {
    expect(resolveLocale({ cookie: "de", acceptLanguage: "en-GB" })).toBe("de");
    expect(resolveLocale({ acceptLanguage: "de-CH,de;q=0.9" })).toBe("de");
    expect(resolveLocale({ acceptLanguage: "fr-FR" })).toBe("fr");
    expect(resolveLocale({ acceptLanguage: "nl-NL" })).toBe("en");
  });

  it("maps a stored language to the one it renders in", () => {
    expect(renderedLanguage("de")).toBe("de");
    expect(renderedLanguage("en")).toBe("en");
    expect(renderedLanguage("de", ["en"])).toBe("en");
  });
});

describe("locale helpers", () => {
  it("formats English day-first, German as de-DE, Spanish as es-ES, French as fr-FR and Italian as it-IT", () => {
    expect(INTL_TAGS).toMatchObject({ en: "en-GB", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT" });
    expect(Object.keys(INTL_TAGS).sort()).toEqual([...LANGUAGES].sort());
  });

  it("maps Italian Intl tags to Italian", () => {
    expect(languageForLocale("it-CH")).toBe("it");
  });

  it("matches tags exactly first, then by primary subtag", () => {
    const codes = ["en", "de", "pt-PT"];
    expect(matchLanguage("pt-PT", codes)).toBe("pt-PT");
    expect(matchLanguage("pt-pt", codes)).toBe("pt-PT");
    expect(matchLanguage("pt-BR", codes)).toBe("pt-PT");
    expect(matchLanguage("pt", codes)).toBe("pt-PT");
    expect(matchLanguage("de-CH", codes)).toBe("de");
    expect(matchLanguage("fr-FR", codes)).toBeUndefined();
  });

  it("maps Intl tags back to app languages", () => {
    expect(languageForLocale("de-DE")).toBe("de");
    expect(languageForLocale("de-CH")).toBe("de");
    expect(languageForLocale("en-GB")).toBe("en");
    expect(languageForLocale("fr-CA")).toBe("fr");
    expect(languageForLocale("nl-NL")).toBe("en");
  });

  it("is right-to-left only for Arabic", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("de-DE")).toBe("ltr");
    expect(localeDirection("zh-Hans")).toBe("ltr");
  });

  it("does not list a supported language as planned", () => {
    const planned: readonly string[] = PLANNED_LOCALES;
    expect(LANGUAGES.filter((l) => planned.includes(l))).toEqual([]);
  });

  it("accepts only real time zones", () => {
    expect(validTimeZone("Europe/Zurich")).toBe("Europe/Zurich");
    expect(validTimeZone("Mars/Olympus")).toBeUndefined();
    expect(validTimeZone(undefined)).toBeUndefined();
  });
});
