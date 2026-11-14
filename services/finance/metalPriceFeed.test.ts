/** Tests for the gold.de feed parser and the close-based chart series. */
import { describe, it, expect } from "vitest";

import {
  bucketStart,
  chartSeries,
  chartWindow,
  closePoints,
  dailyChartSlots,
  dayCloseLabel,
  fxRatesFromDayCloses,
  historyPoints,
  historyWindow,
  parseGoldDeSnapshot,
  sampleDayCloses,
  spotPricesFromSnapshot,
  weekStarts,
  type StoredClose,
} from "./metalPriceFeed";

// Trimmed gold.de payload: the fields the parser reads, plus noise
const goldDe = {
  au_gold_eur_o: 3518.55,
  au_gold_usd_o: 3878.56,
  au_gold_chf_o: 3249.88,
  au_silber_eur_o: 44.35,
  au_silber_usd_o: 48.88,
  au_silber_chf_o: 40.73,
  au_platin_eur_o: 1350.27,
  au_platin_usd_o: 1489,
  au_platin_chf_o: 1249.65,
  au_palladium_eur_o: 910.91,
  au_palladium_usd_o: 1004.5,
  au_palladium_chf_o: 843.03,
  au_wechselkurs_eur_usd: 1.1024,
  au_wechselkurs_eur_chf: 0.9246,
  au_gold_usd: "3.878,56 USD",
  timestamp: 1763152320,
};

const AT = Date.parse("2026-11-14T20:32:41.512Z");
const MINUTE = Date.parse("2026-11-14T20:32:00.000Z");

describe("parseGoldDeSnapshot", () => {
  it("maps the ounce prices and rates, floored to the minute", () => {
    expect(parseGoldDeSnapshot(goldDe, AT)).toEqual({
      timestamp: MINUTE,
      prices: {
        gold: { eur: 3518.55, usd: 3878.56, chf: 3249.88 },
        silver: { eur: 44.35, usd: 48.88, chf: 40.73 },
        platinum: { eur: 1350.27, usd: 1489, chf: 1249.65 },
        palladium: { eur: 910.91, usd: 1004.5, chf: 843.03 },
      },
      eurToUsd: 1.1024,
      eurToChf: 0.9246,
    });
  });

  it("drops invalid CHF values but keeps the snapshot", () => {
    const snapshot = parseGoldDeSnapshot(
      { ...goldDe, au_silber_chf_o: "40", au_wechselkurs_eur_chf: 0 },
      AT,
    );
    expect(snapshot?.prices.silver).toEqual({ eur: 44.35, usd: 48.88 });
    expect(snapshot).not.toHaveProperty("eurToChf");
  });

  it("rejects a snapshot missing a required EUR/USD price or rate", () => {
    expect(parseGoldDeSnapshot({ ...goldDe, au_platin_eur_o: null }, AT)).toBeNull();
    expect(parseGoldDeSnapshot({ ...goldDe, au_gold_usd_o: -1 }, AT)).toBeNull();
    expect(parseGoldDeSnapshot({ ...goldDe, au_wechselkurs_eur_usd: NaN }, AT)).toBeNull();
    expect(parseGoldDeSnapshot(null, AT)).toBeNull();
    expect(parseGoldDeSnapshot("<html>", AT)).toBeNull();
  });
});

describe("spotPricesFromSnapshot", () => {
  it("yields one EUR spot price per metal at the snapshot time", () => {
    const snapshot = parseGoldDeSnapshot(goldDe, AT)!;
    expect(spotPricesFromSnapshot(snapshot)).toEqual([
      { metalType: "gold", eurPerOunce: 3518.55, sourceTimestamp: MINUTE },
      { metalType: "silver", eurPerOunce: 44.35, sourceTimestamp: MINUTE },
      { metalType: "platinum", eurPerOunce: 1350.27, sourceTimestamp: MINUTE },
      { metalType: "palladium", eurPerOunce: 910.91, sourceTimestamp: MINUTE },
    ]);
  });
});

describe("bucketStart", () => {
  it("floors to the UTC hour and day", () => {
    expect(bucketStart(AT, "hour")).toBe(Date.parse("2026-11-14T20:00:00Z"));
    expect(bucketStart(AT, "day")).toBe(Date.parse("2026-11-14T00:00:00Z"));
  });
});

describe("fxRatesFromDayCloses", () => {
  it("emits USD and CHF per UTC day, skipping a missing CHF rate", () => {
    expect(
      fxRatesFromDayCloses([
        { timestamp: Date.parse("2026-11-13T23:59:00Z"), eurToUsd: 1.1, eurToChf: 0.93 },
        { timestamp: Date.parse("2026-11-14T20:32:00Z"), eurToUsd: 1.1024 },
      ]),
    ).toEqual([
      { date: "2026-11-13", currency: "USD", unitsPerEur: 1.1 },
      { date: "2026-11-13", currency: "CHF", unitsPerEur: 0.93 },
      { date: "2026-11-14", currency: "USD", unitsPerEur: 1.1024 },
    ]);
  });
});

describe("dailyChartSlots", () => {
  const NOW = Date.parse("2026-11-14T20:32:00Z"); // a Saturday

  it("steps a day for Week, from 7 days back to yesterday 23:59", () => {
    const slots = dailyChartSlots("Week", NOW);
    expect(slots).toHaveLength(7);
    expect(new Date(slots[0]).toISOString()).toBe("2026-11-07T23:59:00.000Z");
    expect(new Date(slots.at(-1)!).toISOString()).toBe("2026-11-13T23:59:00.000Z");
  });

  it("steps a calendar month back for Month", () => {
    const slots = dailyChartSlots("Month", NOW);
    expect(new Date(slots[0]).toISOString()).toBe("2026-10-14T23:59:00.000Z");
    expect(slots).toHaveLength(31);
  });

  it("steps a week from 1 January for YTD", () => {
    const slots = dailyChartSlots("YTD", NOW);
    expect(new Date(slots[0]).toISOString()).toBe("2026-01-01T23:59:00.000Z");
    expect(new Date(slots[1]).toISOString()).toBe("2026-01-08T23:59:00.000Z");
    expect(slots.every((s) => s < bucketStart(NOW, "day"))).toBe(true);
  });

  it("steps a quarter from the platform launch for ALL", () => {
    const slots = dailyChartSlots("ALL", NOW);
    expect(new Date(slots[0]).toISOString()).toBe("2024-01-01T23:59:00.000Z");
    expect(new Date(slots[1]).toISOString()).toBe("2024-04-01T23:59:00.000Z");
    expect(new Date(slots.at(-1)!).toISOString()).toBe("2026-10-01T23:59:00.000Z");
  });

  it("has no daily slots for the intraday ranges", () => {
    expect(dailyChartSlots("Day", NOW)).toEqual([]);
    expect(dailyChartSlots("Hour", NOW)).toEqual([]);
  });
});

const close = (iso: string, goldEur: number): StoredClose => {
  const timestamp = Date.parse(iso);
  const quote = { eur: goldEur, usd: goldEur * 1.1 };
  return {
    bucketStart: bucketStart(timestamp, "day"),
    timestamp,
    prices: { gold: quote, silver: quote, platinum: quote, palladium: quote },
  };
};

describe("sampleDayCloses", () => {
  it("takes the same-day close and leaves a missing day as a gap", () => {
    const closes = [close("2026-11-12T23:59:00Z", 3500), close("2026-11-10T22:10:00Z", 3400)];
    const slots = ["2026-11-10", "2026-11-11", "2026-11-12"].map((d) =>
      dayCloseLabel(Date.parse(`${d}T00:00:00Z`)),
    );
    expect(sampleDayCloses(closes, slots, "gold", "eur").map((p) => p.price)).toEqual([
      3400,
      null,
      3500,
    ]);
  });

  it("is a gap where the currency was not recorded", () => {
    const [c] = [close("2026-11-12T23:59:00Z", 3500)];
    expect(sampleDayCloses([c], [dayCloseLabel(c.timestamp)], "gold", "chf")[0].price).toBeNull();
  });
});

describe("closePoints", () => {
  it("orders closes by bucket and labels them at their observation time", () => {
    const points = closePoints(
      [close("2026-11-12T23:59:00Z", 3500), close("2026-11-11T20:00:00Z", 3450)],
      "gold",
      "usd",
    );
    expect(points.map((p) => new Date(p.timestamp).toISOString())).toEqual([
      "2026-11-11T20:00:00.000Z",
      "2026-11-12T23:59:00.000Z",
    ]);
    expect(points[0].price).toBeCloseTo(3795);
  });
});

describe("weekStarts", () => {
  it("lists Mondays from the week of `from` through the week of `to`", () => {
    const starts = weekStarts(Date.parse("2026-11-01T12:00:00Z"), Date.parse("2026-11-14T20:00:00Z"));
    expect(starts.map((s) => new Date(s).toISOString().slice(0, 10))).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
  });
});

describe("chartWindow / chartSeries", () => {
  const NOW = Date.parse("2026-11-14T20:32:00Z");
  const latest = close("2026-11-14T20:32:00Z", 3600);

  it("reads hourly closes of the last 24 h before the current hour for Day", () => {
    const w = chartWindow("Day", NOW);
    expect(w).toMatchObject({
      resolution: "hour",
      from: Date.parse("2026-11-13T20:00:00Z"),
      to: Date.parse("2026-11-14T20:00:00Z"),
      slots: null,
    });
    const hour = (iso: string, p: number) => ({ ...close(iso, p), bucketStart: bucketStart(Date.parse(iso), "hour") });
    const series = chartSeries(w, [hour("2026-11-14T18:59:00Z", 3580), hour("2026-11-14T19:59:00Z", 3590)], latest, "gold", "eur");
    expect(series.map((p) => p.price)).toEqual([3580, 3590, 3600]);
  });

  it("reads day closes up to yesterday and ends at the latest price", () => {
    const w = chartWindow("Week", NOW);
    expect(w.resolution).toBe("day");
    expect(w.from).toBe(Date.parse("2026-11-07T00:00:00Z"));
    expect(w.to).toBe(Date.parse("2026-11-14T00:00:00Z"));
    const series = chartSeries(w, [close("2026-11-12T23:59:00Z", 3500)], latest, "gold", "eur");
    // 7 daily slots with leading gaps dropped, then the latest price
    expect(series.map((p) => p.price)).toEqual([3500, null, 3600]);
    expect(series.at(-1)!.timestamp).toBe(NOW);
  });

  it("is empty with neither closes nor a latest price", () => {
    expect(chartSeries(chartWindow("Month", NOW), [], null, "gold", "eur")).toEqual([]);
  });
});

describe("historyWindow / historyPoints", () => {
  const NOW = Date.parse("2026-11-16T10:00:00Z"); // a Monday
  const latest = close("2026-11-16T10:00:00Z", 3700);
  const FROM = Date.parse("2026-11-01T00:00:00Z");

  it("reads day closes before today for day and week intervals", () => {
    expect(historyWindow("week", FROM, NOW)).toEqual({
      resolution: "day",
      from: FROM,
      to: Date.parse("2026-11-16T00:00:00Z"),
    });
    expect(historyWindow("minute", FROM + 3_000_000, NOW).resolution).toBe("hour");
  });

  it("labels days at 23:59 and puts the latest price on today", () => {
    const points = historyPoints("day", [close("2026-11-13T21:00:00Z", 3500)], latest, "gold", "eur", FROM, NOW);
    expect(points.map((p) => [new Date(p.timestamp).toISOString(), p.price])).toEqual([
      ["2026-11-13T23:59:00.000Z", 3500],
      ["2026-11-16T23:59:00.000Z", 3700],
    ]);
  });

  it("samples Mondays for weeks, today's Monday at the latest price, gaps dropped", () => {
    const closes = [close("2026-11-02T23:00:00Z", 3400), close("2026-11-10T23:00:00Z", 3450)];
    const points = historyPoints("week", closes, latest, "gold", "eur", FROM, NOW);
    expect(points.map((p) => [new Date(p.timestamp).toISOString().slice(0, 10), p.price])).toEqual([
      ["2026-11-02", 3400],
      ["2026-11-16", 3700],
    ]);
  });
});
