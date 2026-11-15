import { describe, it, expect } from "vitest";

import {
  localeNumberSymbols,
  parseTypedAmount,
  typedAmountText,
} from "./typedAmount";

/** The Intl tag the app formats each UI language with (i18n/locales.ts). */
const INTL_TAGS = [
  "en-GB",
  "de-DE",
  "es-ES",
  "fr-FR",
  "it-IT",
  "pt-PT",
  "ru-RU",
  "zh-CN",
  "hi-IN",
  "ar-u-nu-latn",
] as const;

describe("localeNumberSymbols", () => {
  it("reads the decimal and grouping marks from Intl", () => {
    expect(localeNumberSymbols("en")).toEqual({ decimal: ".", group: "," });
    expect(localeNumberSymbols("en-GB")).toEqual({ decimal: ".", group: "," });
    expect(localeNumberSymbols("de-DE")).toEqual({ decimal: ",", group: "." });
    expect(localeNumberSymbols("es-ES")).toEqual({ decimal: ",", group: "." });
    expect(localeNumberSymbols("it-IT")).toEqual({ decimal: ",", group: "." });
    expect(localeNumberSymbols("zh-CN")).toEqual({ decimal: ".", group: "," });
    expect(localeNumberSymbols("zh-Hans")).toEqual({ decimal: ".", group: "," });
    expect(localeNumberSymbols("hi-IN")).toEqual({ decimal: ".", group: "," });
    expect(localeNumberSymbols("ar-u-nu-latn")).toEqual({
      decimal: ".",
      group: ",",
    });
  });

  it("finds a space grouping mark in French, Portuguese and Russian", () => {
    for (const tag of ["fr-FR", "pt-PT", "ru-RU"]) {
      const { decimal, group } = localeNumberSymbols(tag);
      expect(decimal).toBe(",");
      expect(group).toMatch(/^\s$/);
    }
  });

  it("finds the Arabic marks with Arabic-Indic digits", () => {
    expect(localeNumberSymbols("ar-u-nu-arab")).toEqual({
      decimal: "٫",
      group: "٬",
    });
  });

  it("falls back to . and , for a tag Intl rejects", () => {
    expect(localeNumberSymbols("not a locale")).toEqual({
      decimal: ".",
      group: ",",
    });
  });
});

describe("typedAmountText", () => {
  it("uses the locale's decimal mark without grouping", () => {
    expect(typedAmountText(1250.5, "en-GB")).toBe("1250.5");
    expect(typedAmountText(1250.5, "de-DE")).toBe("1250,5");
    expect(typedAmountText(1250.5, "es-ES")).toBe("1250,5");
    expect(typedAmountText(1250.5, "fr-FR")).toBe("1250,5");
    expect(typedAmountText(1250.5, "it-IT")).toBe("1250,5");
    expect(typedAmountText(1250.5, "pt-PT")).toBe("1250,5");
    expect(typedAmountText(1250.5, "ru-RU")).toBe("1250,5");
    expect(typedAmountText(1250.5, "zh-CN")).toBe("1250.5");
    expect(typedAmountText(1250000.5, "hi-IN")).toBe("1250000.5");
    expect(typedAmountText(1250.5, "ar-u-nu-latn")).toBe("1250.5");
  });

  it("keeps micro prices, drops float noise and never uses an exponent", () => {
    expect(typedAmountText(0.00001234, "en-GB")).toBe("0.00001234");
    expect(typedAmountText(0.00001234, "de-DE")).toBe("0,00001234");
    expect(typedAmountText(0.1 + 0.2, "en-GB")).toBe("0.3");
    expect(typedAmountText(1e21, "en-GB")).toBe("1000000000000000000000");
  });

  it("drops Arabic direction marks from negative amounts", () => {
    expect(typedAmountText(-1.5, "ar-u-nu-latn")).toBe("-1.5");
  });

  it("writes Arabic-Indic digits where the locale uses them", () => {
    expect(typedAmountText(1250.5, "ar-u-nu-arab")).toBe("١٢٥٠٫٥");
  });

  it("is blank for a non-finite amount and survives a bad tag", () => {
    expect(typedAmountText(Number.NaN, "en-GB")).toBe("");
    expect(typedAmountText(1.5, "not a locale")).toBe("1.5");
  });

  it("round-trips through parseTypedAmount in every UI language", () => {
    for (const tag of [...INTL_TAGS, "ar-u-nu-arab"]) {
      for (const value of [0, 1.5, -1250.25, 250000, 0.00001234, 1234567.89]) {
        expect(parseTypedAmount(typedAmountText(value, tag), tag)).toBe(value);
      }
    }
  });
});

describe("parseTypedAmount", () => {
  it("is undefined when blank and NaN when not a number", () => {
    expect(parseTypedAmount("  ", "en")).toBeUndefined();
    expect(parseTypedAmount("12a", "en")).toBeNaN();
    expect(parseTypedAmount("1,2,3.4.5", "en")).toBeNaN();
    expect(parseTypedAmount(".", "en")).toBeNaN();
  });

  it("reads what Intl formats, with grouping, in every UI language", () => {
    for (const tag of INTL_TAGS) {
      const text = new Intl.NumberFormat(tag).format(-1234567.5);
      expect(parseTypedAmount(text, tag)).toBe(-1234567.5);
    }
  });

  it("reads German and Italian input", () => {
    expect(parseTypedAmount("250.000", "de")).toBe(250_000);
    expect(parseTypedAmount("1.250,50", "de")).toBe(1250.5);
    expect(parseTypedAmount("1250,5", "de")).toBe(1250.5);
    expect(parseTypedAmount("1500.50", "de")).toBe(1500.5);
    expect(parseTypedAmount("1.250.000", "de")).toBe(1_250_000);
    expect(parseTypedAmount("250.000", "it-IT")).toBe(250_000);
    expect(parseTypedAmount("1.250,50", "it-IT")).toBe(1250.5);
    expect(parseTypedAmount("1250,5", "it")).toBe(1250.5);
  });

  it("reads Swiss German input with apostrophes", () => {
    expect(parseTypedAmount("1’250.50", "de-CH")).toBe(1250.5);
    expect(parseTypedAmount("1'250.50", "de-CH")).toBe(1250.5);
  });

  it("reads Spanish input", () => {
    expect(parseTypedAmount("250.000", "es")).toBe(250_000);
    expect(parseTypedAmount("1.250,50", "es-ES")).toBe(1250.5);
    expect(parseTypedAmount("1250,5", "es")).toBe(1250.5);
  });

  it("reads French input", () => {
    expect(parseTypedAmount("250.000", "fr-FR")).toBe(250_000);
    expect(parseTypedAmount("1 250,50", "fr-FR")).toBe(1250.5);
    expect(parseTypedAmount("1 250,5", "fr")).toBe(1250.5);
    expect(parseTypedAmount("1,500", "fr")).toBe(1.5);
  });

  it("reads Portuguese input", () => {
    expect(parseTypedAmount("250.000", "pt-PT")).toBe(250_000);
    expect(parseTypedAmount("1 250,50", "pt-PT")).toBe(1250.5);
    expect(parseTypedAmount("1 250,50", "pt-PT")).toBe(1250.5);
    expect(parseTypedAmount("1,5", "pt-PT")).toBe(1.5);
  });

  it("reads Russian input with a comma decimal mark", () => {
    expect(parseTypedAmount("1,500", "ru-RU")).toBe(1.5);
    expect(parseTypedAmount("1 250,50", "ru-RU")).toBe(1250.5);
    expect(parseTypedAmount("250.000", "ru-RU")).toBe(250_000);
  });

  it("reads English input", () => {
    expect(parseTypedAmount("1,500", "en")).toBe(1500);
    expect(parseTypedAmount("1,250.50", "en")).toBe(1250.5);
    expect(parseTypedAmount("1.5", "en")).toBe(1.5);
    expect(parseTypedAmount("1,5", "en")).toBe(1.5);
    expect(parseTypedAmount("1 250 000", "en")).toBe(1_250_000);
  });

  it("reads Chinese input", () => {
    expect(parseTypedAmount("1,500", "zh-CN")).toBe(1500);
    expect(parseTypedAmount("1,250.50", "zh-Hans")).toBe(1250.5);
    expect(parseTypedAmount("1250.5", "zh-CN")).toBe(1250.5);
  });

  it("reads Hindi input with Indian grouping and Devanagari digits", () => {
    expect(parseTypedAmount("12,50,000.50", "hi-IN")).toBe(1_250_000.5);
    expect(parseTypedAmount("1,500", "hi-IN")).toBe(1500);
    expect(parseTypedAmount("1250.5", "hi-IN")).toBe(1250.5);
    expect(parseTypedAmount("१,२५०.५", "hi-IN")).toBe(1250.5);
  });

  it("reads Arabic input in Latin and Arabic-Indic digits", () => {
    const ar = "ar-u-nu-latn";
    expect(parseTypedAmount("1,250.5", ar)).toBe(1250.5);
    expect(parseTypedAmount("1,500", ar)).toBe(1500);
    expect(parseTypedAmount("‎-1.5", ar)).toBe(-1.5);
    expect(parseTypedAmount("١٢٥٠٫٥", ar)).toBe(1250.5);
    expect(parseTypedAmount("١٬٢٥٠٫٥٠", ar)).toBe(1250.5);
    expect(parseTypedAmount("١٬٢٥٠", ar)).toBe(1250);
    expect(parseTypedAmount("١٫٥", "ar")).toBe(1.5);
    expect(parseTypedAmount("١.٥", ar)).toBe(1.5);
    expect(parseTypedAmount("۱۲۵۰٫۵", ar)).toBe(1250.5);
    expect(parseTypedAmount("-١٫٥", ar)).toBe(-1.5);
    expect(parseTypedAmount("١٫٥٫٥", ar)).toBeNaN();
    expect(parseTypedAmount("١.٥٫٥", ar)).toBeNaN();
    expect(parseTypedAmount("٫", ar)).toBeNaN();
  });

  it("reads a typographic minus sign", () => {
    expect(parseTypedAmount("−1,5", "de-DE")).toBe(-1.5);
  });
});
