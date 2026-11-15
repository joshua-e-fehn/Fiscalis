import { describe, expect, it } from "vitest";

import { dailySnapshots, investmentLots, type SnapshotForLots } from "./lots";

const snap = (
  date: string,
  timestamp: number,
  categories: Record<string, { value: number; netFlow?: number }>,
): SnapshotForLots => ({
  date,
  timestamp,
  categoryBreakdown: Object.entries(categories).map(([category, c]) => ({
    category,
    value: c.value,
    ...(c.netFlow !== undefined ? { netFlow: c.netFlow, sources: [] } : {}),
  })),
});

describe("dailySnapshots", () => {
  it("keeps the newest row of each day, oldest day first", () => {
    const rows = [snap("2026-01-02", 5, {}), snap("2026-01-01", 1, {}), snap("2026-01-02", 9, {})];
    expect(dailySnapshots(rows).map((r) => [r.date, r.timestamp])).toEqual([
      ["2026-01-01", 1],
      ["2026-01-02", 9],
    ]);
  });
});

describe("investmentLots", () => {
  it("splits each day into money moved in and performance", () => {
    const { invested, gains } = investmentLots([
      snap("2026-01-01", 1, { equities: { value: 10_000 } }),
      // +1000 invested, value +1200: 200 of gains
      snap("2026-01-02", 2, { equities: { value: 11_200, netFlow: 1000 } }),
    ]);
    expect(invested).toEqual([{ date: "2026-01-02", amount: 1000 }]);
    expect(gains).toEqual([{ date: "2026-01-02", amount: 200 }]);
  });

  it("nets out moving money between investment categories", () => {
    const { invested, gains } = investmentLots([
      snap("2026-01-01", 1, { equities: { value: 5000 }, crypto: { value: 1000 } }),
      snap("2026-01-02", 2, {
        equities: { value: 4000, netFlow: -1000 },
        crypto: { value: 2000, netFlow: 1000 },
      }),
    ]);
    expect(invested).toEqual([]);
    expect(gains).toEqual([]);
  });

  it("counts selling to cash as money out, and ignores cash itself", () => {
    const { invested } = investmentLots([
      snap("2026-01-01", 1, { equities: { value: 5000 }, cash: { value: 100 } }),
      snap("2026-01-02", 2, {
        equities: { value: 3000, netFlow: -2000 },
        cash: { value: 2100, netFlow: 0 },
      }),
    ]);
    expect(invested).toEqual([{ date: "2026-01-02", amount: -2000 }]);
  });

  it("leaves out real estate and collectibles", () => {
    const { invested, gains } = investmentLots([
      snap("2026-01-01", 1, { "real-estate": { value: 300_000 } }),
      snap("2026-01-02", 2, { "real-estate": { value: 320_000, netFlow: 0 } }),
    ]);
    expect(invested).toEqual([]);
    expect(gains).toEqual([]);
  });

  it("treats a category that first appears as money in", () => {
    const { invested } = investmentLots([
      snap("2026-01-01", 1, { cash: { value: 100 } }),
      snap("2026-01-02", 2, { cash: { value: 100 }, crypto: { value: 500 } }),
    ]);
    expect(invested).toEqual([{ date: "2026-01-02", amount: 500 }]);
  });

  it("flags days whose flow had to be estimated", () => {
    const { estimatedDates, invested, gains } = investmentLots([
      snap("2026-01-01", 1, { equities: { value: 1000 } }),
      snap("2026-01-02", 2, { equities: { value: 1100 } }), // no stored flow
    ]);
    expect(estimatedDates).toEqual(["2026-01-02"]);
    expect(invested).toEqual([]);
    expect(gains).toEqual([{ date: "2026-01-02", amount: 100 }]);
  });

  it("skips days without a breakdown", () => {
    const { invested } = investmentLots([
      { date: "2026-01-01", timestamp: 1 },
      snap("2026-01-02", 2, { equities: { value: 1000, netFlow: 1000 } }),
    ]);
    expect(invested).toEqual([]);
  });

  it("leaves out the flow of a source on the day it gained holdings already owned", () => {
    const row = (date: string, ts: number, broker: number, bitpanda: number, flows?: [number, number]) => ({
      date,
      timestamp: ts,
      categoryBreakdown: [
        {
          category: "equities",
          value: broker + bitpanda,
          ...(flows ? { netFlow: flows[0] + flows[1] } : {}),
          sources: [
            { source: "brokerPosition", value: broker, ...(flows ? { netFlow: flows[0] } : {}) },
            { source: "bitpanda", value: bitpanda, ...(flows ? { netFlow: flows[1] } : {}) },
          ],
        },
      ],
    });
    const { invested, gains } = investmentLots(
      [
        row("2026-01-01", 1, 10_000, 0),
        // Bitpanda connected with 50k already owned, and 1000 bought at the broker
        row("2026-01-02", 2, 11_000, 50_000, [1000, 50_000]),
      ],
      [{ date: "2026-01-02", source: "bitpanda" }],
    );
    expect(invested).toEqual([{ date: "2026-01-02", amount: 1000 }]);
    expect(gains).toEqual([]);
  });

  it("keeps the flow when the rows have no per-source values to attribute it to", () => {
    const { invested } = investmentLots(
      [
        snap("2026-01-01", 1, { cash: { value: 1 } }),
        snap("2026-01-05", 2, { cash: { value: 1 }, crypto: { value: 500 } }),
      ],
      [{ date: "2026-01-03", source: "bitpanda" }],
    );
    // No per-source rows: nothing to attribute the appearance to
    expect(invested).toEqual([{ date: "2026-01-05", amount: 500 }]);
  });
});
