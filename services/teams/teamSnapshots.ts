/**
 * A team's net-worth history (ENG-197, docs/adr/0002-teams.md): the sum of
 * its sharing members' snapshot series. Members write snapshots at
 * different times, so each day of the team series takes every member's
 * latest snapshot on or before that day (carried forward). A carried
 * snapshot adds its values but no flow: nothing moved that day.
 *
 * Framework-free: imported by frontend/convex/teamViews.ts and vitest.
 */

export interface SnapshotSourceLike {
  source: string;
  value: number;
  costBasis?: number;
  coveredValue?: number;
  netFlow?: number;
  netFlowEstimated?: boolean;
}

export interface SnapshotCategoryLike {
  category: string;
  value: number;
  costBasis?: number;
  coveredValue?: number;
  sources?: SnapshotSourceLike[];
  netFlow?: number;
  netFlowEstimated?: boolean;
}

export interface SnapshotLike {
  timestamp: number;
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalCostBasis?: number;
  totalCoveredValue?: number;
  categoryBreakdown?: SnapshotCategoryLike[];
  partial?: boolean;
  asOf?: number;
}

export interface TeamSnapshot extends SnapshotLike {
  source: "team";
  /** Members counted on this day (some may have no history yet) */
  memberCount: number;
}

/** a + b where either may be absent; absent only when both are. */
function addOptional(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

function mergeSources(
  into: Map<string, SnapshotSourceLike>,
  sources: readonly SnapshotSourceLike[],
  carried: boolean,
) {
  for (const s of sources) {
    const prev = into.get(s.source);
    const flow = carried ? 0 : s.netFlow;
    into.set(s.source, {
      source: s.source,
      value: (prev?.value ?? 0) + s.value,
      costBasis: addOptional(prev?.costBasis, s.costBasis),
      coveredValue: addOptional(prev?.coveredValue, s.coveredValue),
      netFlow: addOptional(prev?.netFlow, flow),
      netFlowEstimated: (prev?.netFlowEstimated ?? false) || (!carried && (s.netFlowEstimated ?? false)) || undefined,
    });
  }
}

/** Drops undefined fields, so results compare and serialise cleanly. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** The categories of the snapshots counted on one day, summed. */
function mergeCategories(
  counted: readonly { snapshot: SnapshotLike; carried: boolean }[],
): SnapshotCategoryLike[] | undefined {
  if (!counted.some((c) => c.snapshot.categoryBreakdown)) return undefined;
  type Entry = {
    row: SnapshotCategoryLike;
    sources: Map<string, SnapshotSourceLike>;
    hasSources: boolean;
  };
  const byCategory = new Map<string, Entry>();
  for (const { snapshot, carried } of counted) {
    for (const c of snapshot.categoryBreakdown ?? []) {
      const entry: Entry = byCategory.get(c.category) ?? {
        row: { category: c.category, value: 0 },
        sources: new Map(),
        hasSources: false,
      };
      const row = entry.row;
      row.value += c.value;
      row.costBasis = addOptional(row.costBasis, c.costBasis);
      // Old rows have no coveredValue: their readers fall back to value
      if (c.costBasis !== undefined) {
        row.coveredValue = (row.coveredValue ?? 0) + (c.coveredValue ?? c.value);
      }
      row.netFlow = addOptional(row.netFlow, carried ? 0 : c.netFlow);
      if (!carried && c.netFlowEstimated) row.netFlowEstimated = true;
      if (c.sources) {
        entry.hasSources = true;
        mergeSources(entry.sources, c.sources, carried);
      }
      byCategory.set(c.category, entry);
    }
  }
  return [...byCategory.values()].map(({ row, sources, hasSources }) =>
    compact({
      ...row,
      sources: hasSources ? [...sources.values()].map((s) => compact(s)) : undefined,
    }),
  );
}

/**
 * One series per member (each oldest first) → the team series, one row per
 * day that any member has a snapshot, oldest first.
 */
export function combineSnapshotSeries(
  series: readonly (readonly SnapshotLike[])[],
): TeamSnapshot[] {
  // Each member's last snapshot per day
  const perMember = series.map((rows) => {
    const byDate = new Map<string, SnapshotLike>();
    for (const row of rows) {
      const prev = byDate.get(row.date);
      if (!prev || row.timestamp >= prev.timestamp) byDate.set(row.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  });
  const dates = [...new Set(perMember.flatMap((rows) => rows.map((r) => r.date)))].sort();

  const cursors = perMember.map(() => -1);
  return dates.map((date) => {
    const counted: { snapshot: SnapshotLike; carried: boolean }[] = [];
    perMember.forEach((rows, m) => {
      while (cursors[m] + 1 < rows.length && rows[cursors[m] + 1].date <= date) cursors[m]++;
      const snapshot = rows[cursors[m]];
      if (snapshot) counted.push({ snapshot, carried: snapshot.date !== date });
    });

    let totalCostBasis: number | undefined;
    let totalCoveredValue: number | undefined;
    for (const { snapshot: s } of counted) {
      if (s.totalCostBasis === undefined) continue;
      totalCostBasis = (totalCostBasis ?? 0) + s.totalCostBasis;
      totalCoveredValue = (totalCoveredValue ?? 0) + (s.totalCoveredValue ?? s.totalAssets);
    }
    const asOfs = counted.flatMap(({ snapshot: s }) => (s.asOf === undefined ? [] : [s.asOf]));

    return compact<TeamSnapshot>({
      timestamp: Math.max(...counted.map((c) => c.snapshot.timestamp)),
      date,
      totalAssets: counted.reduce((sum, c) => sum + c.snapshot.totalAssets, 0),
      totalLiabilities: counted.reduce((sum, c) => sum + c.snapshot.totalLiabilities, 0),
      netWorth: counted.reduce((sum, c) => sum + c.snapshot.netWorth, 0),
      totalCostBasis,
      totalCoveredValue,
      categoryBreakdown: mergeCategories(counted),
      partial: counted.some((c) => c.snapshot.partial) || undefined,
      asOf: asOfs.length ? Math.min(...asOfs) : undefined,
      source: "team",
      memberCount: counted.length,
    });
  });
}
