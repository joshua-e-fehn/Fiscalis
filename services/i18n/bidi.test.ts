import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRate,
  withCurrency,
} from "@/lib/utils/currency";
import { BIDI_MARKS, LRI, PDI, isolateLtr, stripBidiMarks } from "./bidi";
import { parseTypedAmount } from "./typedAmount";

/** Wrapped in exactly one left-to-right isolate, with `plain` inside. */
function expectIsolated(text: string, plain: string) {
  expect(text).toBe(`${LRI}${plain}${PDI}`);
  expect(stripBidiMarks(text)).toBe(plain);
}

describe("isolateLtr", () => {
  it("wraps text in LRI ... PDI", () => {
    expect(isolateLtr("-15'881.29€")).toBe("⁦-15'881.29€⁩");
  });

  it("does not wrap twice or wrap nothing", () => {
    expect(isolateLtr(isolateLtr("12%"))).toBe(`${LRI}12%${PDI}`);
    expect(isolateLtr("")).toBe("");
  });

  it("wraps two isolates joined together", () => {
    const joined = `${isolateLtr("1'000€")} + ${isolateLtr("2'000$")}`;
    expect(isolateLtr(joined)).toBe(`${LRI}${joined}${PDI}`);
  });

  it("wraps two isolated amounts joined by text as one unit", () => {
    const range = `${formatCurrency(1, "eur")} – ${formatCurrency(2, "eur")}`;
    expect(isolateLtr(range)).toBe(`${LRI}${range}${PDI}`);
  });

  it("strips every mark Intl or the isolate adds", () => {
    expect(stripBidiMarks("؜‎‏‪‮⁦⁧⁨⁩-1")).toBe("-1");
    expect("⁦".replace(BIDI_MARKS, "")).toBe("");
  });
});

describe("house formatters read left to right in an RTL page", () => {
  it("isolates amounts, signed or not, compact or not", () => {
    expectIsolated(formatCurrency(-15881.29, "eur"), "-15'881.29€");
    expectIsolated(formatCurrency(57975, "eur"), "57'975.00€");
    expectIsolated(formatCurrency(-47.73, "EUR"), "-47.73€");
    expectIsolated(formatCurrency(2386.55, "eur", { showSign: true }), "+2'386.55€");
    expectIsolated(formatCurrency(94669, "eur", { fractionDigits: 0 }), "94'669€");
    expectIsolated(formatCurrency(-1_460_000, "usd", { compact: true }), "-1.46M$");
    expectIsolated(formatCurrency(1234, "SEK"), "1'234.00 SEK");
    expectIsolated(formatCurrency(0, "eur", { showSign: true }), "0.00€");
  });

  it("isolates percentages and rates", () => {
    expectIsolated(formatPercent(20.93, true), "+20.93%");
    expectIsolated(formatPercent(-0.25), "-0.25%");
    expectIsolated(formatPercent(3.14159, true, 1, 1), "+3.1%");
    expectIsolated(formatPercent(1234.5, false, 1, 1), "1'234.5%");
    expectIsolated(formatRate(0.0718), "7.18%");
  });

  it("isolates plain and signed numbers", () => {
    expectIsolated(formatNumber(1234.5), "1'234.5");
    expectIsolated(formatNumber(-3, { fractionDigits: 2 }), "-3.00");
    expectIsolated(formatNumber(12, { showSign: true }), "+12");
    expectIsolated(formatNumber(0.123456, { maximumFractionDigits: 4 }), "0.1235");
  });

  it("isolates an amount given a suffix", () => {
    expectIsolated(withCurrency("1'234.56", "chf"), "1'234.56 CHF");
  });

  it("keeps the isolate inside a translated sentence", () => {
    const sentence = `${formatCurrency(2386.55, "eur", { showSign: true })} (${formatPercent(20.93, true)}) غير محققة`;
    expect(sentence.match(/⁦/g)).toHaveLength(2);
    expect(sentence.match(/⁩/g)).toHaveLength(2);
  });

  it("reads a displayed amount back as the same number", () => {
    for (const tag of ["ar", "de-CH", "en", "fr"]) {
      expect(parseTypedAmount(formatCurrency(-15881.29, "eur").replace("€", ""), tag)).toBe(-15881.29);
      expect(parseTypedAmount(formatNumber(1234.5), tag)).toBe(1234.5);
    }
  });
});
