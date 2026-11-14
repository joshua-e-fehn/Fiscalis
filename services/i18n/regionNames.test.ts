import { describe, expect, it } from "vitest";

import { createRegionNamer } from "./regionNames";

describe("createRegionNamer", () => {
  it("names countries in the given locale", () => {
    expect(createRegionNamer("de-DE")("DE", "Germany")).toBe("Deutschland");
    expect(createRegionNamer("de-DE")("ch", "Switzerland")).toBe("Schweiz");
    expect(createRegionNamer("fr-FR")("DE", "Germany")).toBe("Allemagne");
  });

  it("keeps the English source names for English locales", () => {
    for (const locale of ["en", "en-GB", "en-US"]) {
      const name = createRegionNamer(locale);
      expect(name("CD", "Congo, Dem. Rep.")).toBe("Congo, Dem. Rep.");
      expect(name("CG", "Congo, Rep.")).toBe("Congo, Rep.");
      expect(name("HK", "Hong Kong SAR, China")).toBe("Hong Kong SAR, China");
      expect(name("MM", "Myanmar")).toBe("Myanmar");
      expect(name("PS", "West Bank and Gaza")).toBe("West Bank and Gaza");
      expect(name("US", "United States of America")).toBe(
        "United States of America",
      );
    }
  });

  it("keeps the fallback for codes Intl does not know", () => {
    const name = createRegionNamer("de-DE");
    expect(name("1W", "World")).toBe("World");
    expect(name("XC", "Euro area")).toBe("Euro area");
    expect(name("-99", "Somaliland")).toBe("Somaliland");
    expect(name("USA", "United States")).toBe("United States");
    expect(name(undefined, "Unknown")).toBe("Unknown");
  });

  it("falls back for an invalid locale", () => {
    expect(createRegionNamer("not a locale!")("DE", "Germany")).toBe("Germany");
  });
});
