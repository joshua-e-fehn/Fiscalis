/**
 * Feature flags for UI that is planned but not built yet. Every flag
 * defaults to off, so unfinished entries stay in the code (ready to be built)
 * without showing users links that go nowhere (ENG-227).
 *
 * Turn flags on per environment with a comma-separated list, e.g.
 * NEXT_PUBLIC_FEATURES="teamSettings,plannedCategories", or "all" for every flag.
 */
export const FEATURE_FLAGS = [
  /** Settings > Team */
  "teamSettings",
  /** Drill-down cards for categories that are not built yet ("Coming soon") */
  "plannedCategories",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type FeatureFlags = Readonly<Record<FeatureFlag, boolean>>;

export function isFeatureFlag(value: string): value is FeatureFlag {
  return (FEATURE_FLAGS as readonly string[]).includes(value);
}

/** Parses the env list; unknown names are ignored, everything else is off. */
export function parseFeatureFlags(raw: string | undefined): FeatureFlags {
  const names = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const all = names.includes("all");
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag, all || names.includes(flag)]),
  ) as Record<FeatureFlag, boolean>;
}

/** Items without a flag are always shown; flagged items only when it is on. */
export function filterByFeature<T extends { feature?: FeatureFlag }>(
  items: readonly T[],
  flags: FeatureFlags,
): T[] {
  return items.filter((item) => !item.feature || flags[item.feature]);
}

/**
 * Filters a two-level menu: drops flagged entries and sub-entries, and drops
 * a parent whose sub-entries were all hidden (a group with nothing to open).
 */
export function filterMenuByFeature<
  T extends { feature?: FeatureFlag; items?: readonly { feature?: FeatureFlag }[] },
>(items: readonly T[], flags: FeatureFlags): T[] {
  return filterByFeature(items, flags).flatMap((item) => {
    if (!item.items?.length) return [item];
    const children = filterByFeature(item.items, flags);
    return children.length ? [{ ...item, items: children }] : [];
  });
}

