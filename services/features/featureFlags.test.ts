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
    const flags = parseFeatureFlags(" notifications , billing,unknown");
    expect(flags.notifications).toBe(true);
    expect(flags.billing).toBe(true);
    expect(flags.upgrade).toBe(false);
    expect("unknown" in flags).toBe(false);
  });

  it("turns everything on with 'all'", () => {
    const flags = parseFeatureFlags("all");
    expect(FEATURE_FLAGS.every((flag) => flags[flag])).toBe(true);
  });
});

describe("filterByFeature", () => {
  it("keeps unflagged items and flagged ones that are on", () => {
    const items = [{ id: 1 }, { id: 2, feature: "notifications" as const }, { id: 3, feature: "billing" as const }];
    expect(filterByFeature(items, parseFeatureFlags("billing")).map((i) => i.id)).toEqual([1, 3]);
  });
});

describe("filterMenuByFeature", () => {
  const menu = [
    { title: "Dashboard", items: [] },
    { title: "Account", items: [{ title: "Notifications", feature: "notifications" as const }] },
    {
      title: "Settings",
      items: [{ title: "General" }, { title: "Team", feature: "teamSettings" as const }],
    },
    { title: "Billing", feature: "billing" as const, items: [{ title: "Plans" }] },
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
    expect(isFeatureFlag("billing")).toBe(true);
    expect(isFeatureFlag("nope")).toBe(false);
  });
});
