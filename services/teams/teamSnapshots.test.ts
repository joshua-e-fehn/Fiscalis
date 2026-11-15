import { describe, expect, it } from "vitest";
import { combineSnapshotSeries, type SnapshotLike } from "./teamSnapshots";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 12);

function snap(day: number, netWorth: number, extra: Partial<SnapshotLike> = {}): SnapshotLike {
  return {
    timestamp: T0 + day * DAY,
    date: new Date(T0 + day * DAY).toISOString().slice(0, 10),
    totalAssets: netWorth,
    totalLiabilities: 0,
    netWorth,
    ...extra,
  };
}

describe("combineSnapshotSeries", () => {
  it("sums members on shared days", () => {
    const rows = combineSnapshotSeries([[snap(0, 100)], [snap(0, 50)]]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ netWorth: 150, totalAssets: 150, memberCount: 2, source: "team" });
  });

  it("carries a member's latest snapshot forward to days they have none", () => {
    const rows = combineSnapshotSeries([
      [snap(0, 100), snap(2, 120)],
      [snap(1, 50)],
    ]);
    expect(rows.map((r) => [r.date, r.netWorth])).toEqual([
      ["2026-11-01", 100],
      ["2026-11-02", 150],
      ["2026-11-03", 170],
    ]);
  });

  it("uses the last snapshot of a day", () => {
    const rows = combineSnapshotSeries([
      [snap(0, 100), { ...snap(0, 110), timestamp: T0 + 1000 }],
    ]);
    expect(rows).toEqual([expect.objectContaining({ netWorth: 110, timestamp: T0 + 1000 })]);
  });

  it("adds no flow for a carried snapshot", () => {
    const flowed = (day: number) =>
      snap(day, 100, {
        categoryBreakdown: [
          {
            category: "equities",
            value: 100,
            costBasis: 80,
            netFlow: 10,
            sources: [{ source: "brokerPosition", value: 100, netFlow: 10 }],
          },
        ],
      });
    const rows = combineSnapshotSeries([[flowed(0)], [flowed(1)]]);
    const day2 = rows[1].categoryBreakdown![0];
    expect(day2).toMatchObject({ value: 200, costBasis: 160, coveredValue: 200, netFlow: 10 });
    expect(day2.sources).toEqual([{ source: "brokerPosition", value: 200, netFlow: 10 }]);
  });

  it("sums cost only over members that have one, with covered value fallback", () => {
    const rows = combineSnapshotSeries([
      [snap(0, 100, { totalCostBasis: 70 })],
      [snap(0, 50)],
    ]);
    expect(rows[0]).toMatchObject({ totalCostBasis: 70, totalCoveredValue: 100 });
  });

  it("keeps partial and the oldest asOf", () => {
    const rows = combineSnapshotSeries([
      [snap(0, 1, { partial: true, asOf: 5 })],
      [snap(0, 1, { asOf: 3 })],
    ]);
    expect(rows[0]).toMatchObject({ partial: true, asOf: 3 });
  });

  it("is empty without history", () => {
    expect(combineSnapshotSeries([[], []])).toEqual([]);
  });
});
