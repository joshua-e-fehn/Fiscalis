import { describe, expect, it } from "vitest";

import {
  buildSeries,
  clampYear,
  latestWellCoveredYear,
  seriesCountryHistory,
  seriesYears,
  yearSnapshot,
  type SeriesRow,
} from "./series";

const row = (
  code: string,
  year: number,
  value: number,
  name = code,
): SeriesRow => ({ code, code3: `${code}X`, name, year, value });

describe("latestWellCoveredYear", () => {
  it("skips a last year with only a few early reporters", () => {
    const counts = new Map([
      [2023, 75],
      [2024, 41],
      [2025, 4],
    ]);
    expect(latestWellCoveredYear(counts)).toBe(2023);
  });

  it("takes the last year when it is covered", () => {
    const counts = new Map([
      [2024, 248],
      [2025, 234],
    ]);
    expect(latestWellCoveredYear(counts)).toBe(2025);
  });

  it("is null without data", () => {
    expect(latestWellCoveredYear(new Map())).toBeNull();
  });
});

describe("buildSeries", () => {
  const series = buildSeries([
    row("DE", 2000, 1),
    row("FR", 2000, 2),
    row("DE", 2002, 3),
    row("FR", 2002, 4),
    row("DE", 2003, 5),
    row("WLD", 2003, 9), // aggregate: never counts as coverage
  ]);

  it("lists each country once and keeps only years with data", () => {
    expect(series.countries.map((c) => c.code)).toEqual(["DE", "FR", "WLD"]);
    expect(Object.keys(series.values)).toEqual(["2000", "2002", "2003"]);
    expect(series.firstYear).toBe(2000);
    expect(series.lastYear).toBe(2003);
  });

  it("defaults to the latest well-covered year, counting countries only", () => {
    // 2003 has DE + the aggregate: 1 of 2 countries is below 60%
    expect(series.latestYear).toBe(2002);
  });

  it("is empty without rows", () => {
    expect(buildSeries([])).toEqual({
      countries: [],
      values: {},
      firstYear: null,
      lastYear: null,
      latestYear: null,
    });
  });

  it("drops non-finite values", () => {
    const s = buildSeries([row("DE", 2000, Number.NaN), row("FR", 2000, 1)]);
    expect(yearSnapshot(s, 2000).map((c) => c.code)).toEqual(["FR"]);
  });

  it("falls back to the last year when only aggregates report", () => {
    expect(buildSeries([row("WLD", 1999, 1)]).latestYear).toBe(1999);
  });
});

describe("yearSnapshot", () => {
  const series = buildSeries([
    row("DE", 2000, 1, "Germany"),
    row("FR", 2001, 2),
  ]);

  it("returns the year's countries with names and codes", () => {
    expect(yearSnapshot(series, 2000)).toEqual([
      { code: "DE", code3: "DEX", name: "Germany", value: 1 },
    ]);
  });

  it("is empty for a year without data", () => {
    expect(yearSnapshot(series, 1990)).toEqual([]);
  });
});

describe("seriesYears and clampYear", () => {
  const series = buildSeries([row("DE", 2000, 1), row("DE", 2003, 2)]);

  it("spans first to last year, gaps included", () => {
    expect(seriesYears(series)).toEqual([2000, 2001, 2002, 2003]);
  });

  it("clamps into the range", () => {
    expect(clampYear(series, 2027)).toBe(2003);
    expect(clampYear(series, 1960)).toBe(2000);
    expect(clampYear(series, 2001)).toBe(2001);
  });

  it("leaves the year alone for an empty series", () => {
    expect(clampYear(buildSeries([]), 2027)).toBe(2027);
    expect(seriesYears(buildSeries([]))).toEqual([]);
  });
});

describe("seriesCountryHistory", () => {
  it("keeps gaps as null and trims before the first value", () => {
    const series = buildSeries([
      row("FR", 2000, 9),
      row("DE", 2001, 1),
      row("DE", 2003, 3),
    ]);
    expect(seriesCountryHistory(series, "DE")).toEqual([
      { year: 2001, value: 1 },
      { year: 2002, value: null },
      { year: 2003, value: 3 },
    ]);
  });
});
