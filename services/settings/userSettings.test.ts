import { describe, expect, it } from "vitest";

import { MAX_DISPLAY_NAME_LENGTH, validateSettings } from "./userSettings";

describe("validateSettings", () => {
  it("returns an empty patch when nothing is given", () => {
    expect(validateSettings({})).toEqual({ ok: true, value: {} });
  });

  it("trims the display name", () => {
    const result = validateSettings({ displayName: "  Ada Lovelace " });
    expect(result).toEqual({ ok: true, value: { displayName: "Ada Lovelace" } });
  });

  it("clears an emptied display name with an explicit undefined", () => {
    const result = validateSettings({ displayName: "   " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.value, "displayName")).toBe(true);
    expect(result.value.displayName).toBeUndefined();
  });

  it("leaves fields that were not given out of the patch", () => {
    const result = validateSettings({ theme: "dark" });
    expect(result.ok && Object.keys(result.value)).toEqual(["theme"]);
  });

  it("rejects a display name over the limit", () => {
    const result = validateSettings({
      displayName: "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a display name at the limit", () => {
    const name = "x".repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(validateSettings({ displayName: name })).toEqual({
      ok: true,
      value: { displayName: name },
    });
  });

  it("normalises the currency to an upper-case display currency", () => {
    expect(validateSettings({ defaultCurrency: "chf" })).toEqual({
      ok: true,
      value: { defaultCurrency: "CHF" },
    });
  });

  it("rejects a currency outside the display currencies", () => {
    expect(validateSettings({ defaultCurrency: "JPY" }).ok).toBe(false);
  });

  it("validates language and theme", () => {
    expect(validateSettings({ language: "de", theme: "system" })).toEqual({
      ok: true,
      value: { language: "de", theme: "system" },
    });
    expect(validateSettings({ language: "xx" }).ok).toBe(false);
    expect(validateSettings({ theme: "sepia" }).ok).toBe(false);
  });
});
