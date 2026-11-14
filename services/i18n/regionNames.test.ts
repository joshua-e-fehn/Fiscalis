import { describe, expect, it } from "vitest";

import { createRegionNamer } from "./regionNames";

describe("createRegionNamer", () => {
  it("names countries in the given locale", () => {
    expect(createRegionNamer("de-DE")("DE", "Germany")).toBe("Deutschland");
    expect(createRegionNamer("de-DE")("ch", "Switzerland")).toBe("Schweiz");
    expect(createRegionNamer("en-GB")("US", "United States of America")).toBe(
      "United States",
    );
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
