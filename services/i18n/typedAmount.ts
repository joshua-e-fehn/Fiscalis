/**
 * Amounts typed into form fields, in any UI language: the separators come
 * from Intl.NumberFormat(locale).formatToParts, never from a check on the
 * language code, so en, de, es, fr, it, pt-PT, ru, zh-Hans, hi and ar (and
 * any other tag) each read and show their own convention.
 *
 * Arabic: the app formats Arabic with Latin digits ("ar-u-nu-latn"), but an
 * Arabic keyboard types Arabic-Indic digits, so input accepts both, along
 * with the Arabic decimal and thousands marks ("١٬٢٥٠٫٥"). Extended
 * (Persian) Arabic-Indic and Devanagari digits are accepted the same way.
 */

import { stripBidiMarks } from "./bidi";

export interface LocaleNumberSymbols {
  /** The decimal mark: "." (en), "," (de, fr), "٫" (ar with Arabic digits) */
  decimal: string;
  /** The grouping mark: "," (en), "." (de), a narrow no-break space (fr) */
  group: string;
}

const FALLBACK_SYMBOLS: LocaleNumberSymbols = { decimal: ".", group: "," };

/**
 * The decimal and grouping marks a locale writes, from Intl. Falls back to
 * "." and "," for a tag Intl rejects.
 */
export function localeNumberSymbols(locale: string): LocaleNumberSymbols {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
    return {
      decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
      group: parts.find((p) => p.type === "group")?.value ?? ",",
    };
  } catch {
    return FALLBACK_SYMBOLS;
  }
}

const ARABIC_DECIMAL = "٫";
const ARABIC_GROUP = "٬";

/** Arabic-Indic, extended Arabic-Indic and Devanagari digits as 0-9. */
function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९]/g, (d) => {
    const code = d.charCodeAt(0);
    const zero = code >= 0x0966 ? 0x0966 : code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - zero);
  });
}

/**
 * A stored amount as a form shows it: the locale's decimal mark and digits,
 * no grouping, never an exponent, up to 15 significant digits (so a
 * micro-priced token keeps 0.00001234 and float noise such as
 * 0.30000000000000004 is dropped). parseTypedAmount reads it back.
 */
export function typedAmountText(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "";
  // Intl writes negative zero as "-0"; a form field shows it as "0".
  if (value === 0) value = 0;
  const options = { useGrouping: false, maximumSignificantDigits: 15 };
  let text: string;
  try {
    text = new Intl.NumberFormat(locale, options).format(value);
  } catch {
    text = new Intl.NumberFormat("en-US", options).format(value);
  }
  return stripBidiMarks(text);
}

/**
 * An amount as typed in the form, as a number: undefined when blank, NaN
 * when it is not a number.
 *
 * Spaces, apostrophes and the locale's own grouping mark group digits.
 * The Arabic decimal mark "٫" is always the decimal mark. Otherwise, with
 * both "." and "," in it, the last one is the decimal mark ("1.250,50",
 * "1,250.50"). With one of them only, repeated it groups ("1.250.000",
 * Hindi "1,25,000"), and once it is the decimal mark, except the locale's
 * grouping mark before exactly three digits: in German, Spanish, French,
 * Italian, Portuguese or Russian "250.000" is 250000, in English, Chinese,
 * Hindi or Arabic "1,500" is 1500. So a typed "250.000" is never read as
 * 250. Where the locale groups with a space (fr, pt-PT, ru), "." stands in
 * as the ambiguous grouping mark, since people type it there too.
 */
export function parseTypedAmount(
  text: string,
  locale: string,
): number | undefined {
  const symbols = localeNumberSymbols(locale);
  let compact = latinDigits(stripBidiMarks(text))
    .replace(/−/g, "-")
    .replace(/[\s'’]/g, "")
    .split(ARABIC_GROUP)
    .join("");
  if (symbols.group !== "." && symbols.group !== ",") {
    compact = compact.split(symbols.group).join("");
  }
  if (!compact) return undefined;

  if (compact.includes(ARABIC_DECIMAL)) {
    if (!/^-?[\d,]*٫\d*$/.test(compact) || !/\d/.test(compact)) {
      return Number.NaN;
    }
    return Number(compact.replace(/,/g, "").replace(ARABIC_DECIMAL, "."));
  }

  if (!/^-?[\d.,]+$/.test(compact)) return Number.NaN;
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  let decimalMark: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalMark = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? "." : ",";
    const groupingMark =
      symbols.group === "." || symbols.group === ","
        ? symbols.group
        : symbols.decimal === ","
          ? "."
          : ",";
    const count = compact.split(mark).length - 1;
    const digitsAfter = compact.length - compact.lastIndexOf(mark) - 1;
    const groups = count > 1 || (mark === groupingMark && digitsAfter === 3);
    decimalMark = groups ? null : mark;
  }
  const groupingMarks =
    decimalMark === "," ? /\./g : decimalMark === "." ? /,/g : /[.,]/g;
  const normalized = compact
    .replace(groupingMarks, "")
    .replace(decimalMark ?? "", decimalMark ? "." : "");
  if (decimalMark && normalized.split(".").length > 2) return Number.NaN;
  return Number(normalized);
}

/**
 * A percent typed in the form as a decimal fraction ("2,5" in German or
 * "2.5" in English → 0.025): undefined when blank, NaN when it is not a
 * number. Rates and premiums are stored as fractions.
 */
export function parseTypedPercent(
  text: string,
  locale: string,
): number | undefined {
  const percent = parseTypedAmount(text, locale);
  return percent === undefined ? undefined : percent / 100;
}

/**
 * A stored fraction as a percent field shows it (0.0375 → "3,75" in
 * German); parseTypedPercent reads it back.
 */
export function typedPercentText(fraction: number, locale: string): string {
  return typedAmountText(fraction * 100, locale);
}
