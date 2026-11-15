import { describe, expect, it } from "vitest";

import {
  FEATURE_FLAGS,
  filterByFeature,
  filterMenuByFeature,
  isFeatureFlag,
  parseFeatureFlags,
} from "./featureFlags";

describe("parseFeatureFlags", () => {
  it("turns every flag off by default", () => {
    const flags = parseFeatureFlags(undefined);
    expect(FEATURE_FLAGS.every((flag) => flags[flag] === false)).toBe(true);
    expect(parseFeatureFlags("")).toEqual(flags);
  });

  it("turns on the listed flags and ignores unknown names", () => {
    const flags = parseFeatureFlags(" plannedCategories , unknown");
    expect(flags.plannedCategories).toBe(true);
    expect(flags.teamSettings).toBe(false);
    expect("unknown" in flags).toBe(false);
  });

  it("turns everything on with 'all'", () => {
    const flags = parseFeatureFlags("all");
    expect(FEATURE_FLAGS.every((flag) => flags[flag])).toBe(true);
  });
});

describe("filterByFeature", () => {
  it("keeps unflagged items and flagged ones that are on", () => {
    const items = [{ id: 1 }, { id: 2, feature: "plannedCategories" as const }, { id: 3, feature: "teamSettings" as const }];
    expect(filterByFeature(items, parseFeatureFlags("teamSettings")).map((i) => i.id)).toEqual([1, 3]);
  });
});

describe("filterMenuByFeature", () => {
  const menu = [
    { title: "Dashboard", items: [] },
    { title: "Account", items: [{ title: "Team", feature: "teamSettings" as const }] },
    {
      title: "Settings",
      items: [{ title: "General" }, { title: "Team", feature: "teamSettings" as const }],
    },
    { title: "Planned", feature: "plannedCategories" as const, items: [{ title: "Soon" }] },
  ];

  it("drops hidden entries and parents left without children", () => {
    const visible = filterMenuByFeature(menu, parseFeatureFlags(undefined));
    expect(visible.map((i) => i.title)).toEqual(["Dashboard", "Settings"]);
    expect(visible[1].items?.map((i) => i.title)).toEqual(["General"]);
  });

  it("shows everything when all flags are on", () => {
    expect(filterMenuByFeature(menu, parseFeatureFlags("all"))).toEqual(menu);
  });

  it("does not mutate the input", () => {
    filterMenuByFeature(menu, parseFeatureFlags(undefined));
    expect(menu[2].items).toHaveLength(2);
  });
});

describe("isFeatureFlag", () => {
  it("recognises known flags only", () => {
    expect(isFeatureFlag("teamSettings")).toBe(true);
    expect(isFeatureFlag("nope")).toBe(false);
  });
});
