import { describe, expect, it } from "vitest";

import {
  assessCoverage,
  buildSeries,
  clampYear,
  latestWellCoveredYear,
  MAX_FAILED_CHECKS,
  MIN_MAP_COUNTRIES,
  parseSeriesRow,
  RECHECK_AFTER_MS,
  RETRY_FAILED_AFTER_MS,
  stateAfterCheck,
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

describe("parseSeriesRow", () => {
  const point = {
    countryiso3code: "DEU",
    country: { id: "DE", value: "Germany" },
    date: "2023",
    value: 4.5,
  };

  it("maps a WDI point to ISO2", () => {
    expect(parseSeriesRow(point)).toEqual({
      code: "DE",
      code3: "DEU",
      name: "Germany",
      year: 2023,
      value: 4.5,
    });
  });

  it("takes the ISO3 code from country.id when countryiso3code is empty", () => {
    expect(
      parseSeriesRow({
        ...point,
        countryiso3code: "",
        country: { id: "FRA", value: "France" },
      }),
    ).toMatchObject({ code: "FR", code3: "FRA" });
  });

  it("keeps an aggregate's 3-letter code", () => {
    expect(
      parseSeriesRow({ ...point, countryiso3code: "AFE" }),
    ).toMatchObject({ code: "AFE" });
  });

  it.each([
    ["no value", { ...point, value: null }],
    ["a subnational point without a country code", {
      ...point,
      countryiso3code: "",
      country: { id: "", value: "Bihar" },
    }],
    ["a quarterly date", { ...point, date: "2024Q1" }],
    ["a monthly date", { ...point, date: "2024M01" }],
  ])("skips %s", (_, input) => {
    expect(parseSeriesRow(input)).toBeNull();
  });
});

describe("assessCoverage", () => {
  it("needs enough real countries", () => {
    const real = Array.from({ length: MIN_MAP_COUNTRIES }, (_, i) =>
      row(String.fromCharCode(65 + i) + "Q", 2020 + (i % 2), i),
    );
    expect(assessCoverage(real)).toEqual({
      usable: true,
      countryCount: MIN_MAP_COUNTRIES,
      latestYear: 2021,
    });
    expect(assessCoverage(real.slice(1)).usable).toBe(false);
  });

  it("does not count aggregates", () => {
    // World Bank aggregates keep 3-letter codes (World, regions, income groups)
    const aggregates = Array.from({ length: 20 }, (_, i) =>
      row(`A${String(i).padStart(2, "0")}`, 2020, i),
    );
    expect(assessCoverage(aggregates).countryCount).toBe(0);
  });

  it("reports an empty answer as unusable", () => {
    expect(assessCoverage([])).toEqual({
      usable: false,
      countryCount: 0,
      latestYear: null,
    });
  });
});

describe("stateAfterCheck", () => {
  const coverage = (usable: boolean) => ({
    usable,
    countryCount: usable ? 100 : 2,
    latestYear: 2024,
  });

  it("settles on what the check found and resets failures", () => {
    expect(
      stateAfterCheck(
        { failedChecks: 2 },
        { kind: "checked", coverage: coverage(true) },
      ),
    ).toEqual({
      availability: "usable",
      failedChecks: 0,
      recheckAfterMs: RECHECK_AFTER_MS,
    });
    expect(
      stateAfterCheck(
        { availability: "usable", failedChecks: 0 },
        { kind: "checked", coverage: coverage(false) },
      ).availability,
    ).toBe("unusable");
  });

  it("marks an archived code unusable", () => {
    expect(
      stateAfterCheck(
        { availability: "usable", failedChecks: 0 },
        { kind: "notFound" },
      ).availability,
    ).toBe("unusable");
  });

  it("keeps what it knew after a failed request and retries sooner", () => {
    expect(
      stateAfterCheck(
        { availability: "usable", failedChecks: 0 },
        { kind: "failed" },
      ),
    ).toEqual({
      availability: "usable",
      failedChecks: 1,
      recheckAfterMs: RETRY_FAILED_AFTER_MS,
    });
    expect(
      stateAfterCheck({ failedChecks: 0 }, { kind: "failed" }).availability,
    ).toBeUndefined();
  });

  it("gives up after repeated failures", () => {
    expect(
      stateAfterCheck(
        { availability: "usable", failedChecks: MAX_FAILED_CHECKS - 1 },
        { kind: "failed" },
      ).availability,
    ).toBe("unusable");
  });
});
