/**
 * An indicator's whole World Bank history as one compact payload, and the
 * per-year snapshots /tools/world-map derives from it.
 *
 * The World Bank API answers one request for every year of an indicator in
 * well under a second (when warm), while a single-year request often takes
 * 15–30s. So the map loads the full series once and switching years,
 * playback, "compare years" and a country's history are all local reads.
 */

import { countryHistory, isCountryCode, type HistoryPoint } from "./countryViews";
import { ISO3_TO_ISO2 } from "./isoCodes";

/** A country or aggregate as listed once in a series. */
export interface SeriesCountry {
  /** ISO alpha-2 for countries, the World Bank's 3-letter code otherwise */
  code: string;
  code3: string;
  name: string;
}

/** One value of one country in one year, as parsed from the upstream rows. */
export interface SeriesRow extends SeriesCountry {
  year: number;
  value: number;
}

export interface IndicatorSeries {
  countries: SeriesCountry[];
  /** Year → [index into `countries`, value]; only years with any value */
  values: Record<string, Array<[number, number]>>;
  /** First and last year with any value; null for an empty series */
  firstYear: number | null;
  lastYear: number | null;
  /**
   * The latest year with good coverage: the map's default year. The last
   * year often has only a handful of early reporters (poverty: 4 countries
   * in 2025 against 75 in 2023), which would open on an almost empty map.
   */
  latestYear: number | null;
}

/** A year counts as covered with at least this share of the best year. */
export const LATEST_YEAR_COVERAGE = 0.6;

/** A country's value in one year (CountryDataPoint without formatting). */
export interface SnapshotCountry extends SeriesCountry {
  value: number;
}

/**
 * The latest year whose number of reporting countries reaches `coverage`
 * of the best-covered year; null without any data.
 */
export function latestWellCoveredYear(
  countsByYear: ReadonlyMap<number, number>,
  coverage: number = LATEST_YEAR_COVERAGE,
): number | null {
  const best = Math.max(0, ...countsByYear.values());
  if (best === 0) return null;
  const years = [...countsByYear.keys()].sort((a, b) => b - a);
  return (
    years.find((y) => (countsByYear.get(y) ?? 0) >= best * coverage) ?? null
  );
}

/** Builds the compact series from parsed rows (any order, no nulls). */
export function buildSeries(rows: readonly SeriesRow[]): IndicatorSeries {
  const countries: SeriesCountry[] = [];
  const indexByCode = new Map<string, number>();
  const values: Record<string, Array<[number, number]>> = {};
  const countryCounts = new Map<number, number>();

  for (const row of rows) {
    if (!Number.isFinite(row.value) || !Number.isInteger(row.year)) continue;
    let index = indexByCode.get(row.code);
    if (index === undefined) {
      index = countries.length;
      indexByCode.set(row.code, index);
      countries.push({ code: row.code, code3: row.code3, name: row.name });
    }
    (values[row.year] ??= []).push([index, row.value]);
    // Coverage counts real countries only; aggregates come and go together
    if (isCountryCode(row.code)) {
      countryCounts.set(row.year, (countryCounts.get(row.year) ?? 0) + 1);
    }
  }

  const years = Object.keys(values).map(Number);
  return {
    countries,
    values,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    latestYear:
      latestWellCoveredYear(countryCounts) ??
      (years.length ? Math.max(...years) : null),
  };
}

/** Every country with a value in `year`; empty for a year without data. */
export function yearSnapshot(
  series: IndicatorSeries,
  year: number,
): SnapshotCountry[] {
  return (series.values[year] ?? []).flatMap(([index, value]) => {
    const country = series.countries[index];
    return country ? [{ ...country, value }] : [];
  });
}

/** Ascending years from the first to the last year with data (gaps kept). */
export function seriesYears(series: IndicatorSeries): number[] {
  const { firstYear, lastYear } = series;
  if (firstYear === null || lastYear === null) return [];
  return Array.from(
    { length: lastYear - firstYear + 1 },
    (_, i) => firstYear + i,
  );
}

/** Clamps a year into the series' range; the year itself without data. */
export function clampYear(series: IndicatorSeries, year: number): number {
  const { firstYear, lastYear } = series;
  if (firstYear === null || lastYear === null) return year;
  return Math.min(lastYear, Math.max(firstYear, year));
}

/** One country's history over the series (trimmed, gaps as null). */
export function seriesCountryHistory(
  series: IndicatorSeries,
  code: string,
): HistoryPoint[] {
  return countryHistory(
    seriesYears(series).map((year) => ({
      year,
      countries: yearSnapshot(series, year),
    })),
    code,
  );
}

// ═══════════════════════════════════════════════════════════════
// Upstream rows and whether an indicator can be mapped
// ═══════════════════════════════════════════════════════════════

/** One data point as the World Bank API returns it (the fields read here). */
export interface WorldBankPoint {
  countryiso3code?: string | null;
  country?: { id?: string | null; value?: string | null } | null;
  date?: string | null;
  value?: number | null;
}

/**
 * A data point as a series row, or null when the map can't place it: no
 * value, no country code (subnational databases) or no calendar year
 * (quarterly and monthly databases date points as "2024Q1" / "2024M01").
 */
export function parseSeriesRow(point: WorldBankPoint): SeriesRow | null {
  // WDI fills countryiso3code; other World Bank sources (e.g. the
  // Sustainable Energy for All database) leave it empty and put the ISO3
  // code in country.id instead
  const code3 =
    point.countryiso3code ||
    (point.country?.id?.length === 3 ? point.country.id : "");
  const date = point.date ?? "";
  const value = point.value;
  if (
    !code3 ||
    !/^\d{4}$/.test(date) ||
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }
  return {
    code: ISO3_TO_ISO2[code3] || code3,
    code3,
    name: point.country?.value || code3,
    year: Number(date),
    value,
  };
}

/** Fewer real countries than this make no useful world map. */
export const MIN_MAP_COUNTRIES = 10;

export interface IndicatorCoverage {
  usable: boolean;
  /** Real countries (no aggregates) with at least one value */
  countryCount: number;
  latestYear: number | null;
}

/** Whether parsed rows give a world map: enough real countries with data. */
export function assessCoverage(rows: readonly SeriesRow[]): IndicatorCoverage {
  const series = buildSeries(rows);
  const countryCount = series.countries.filter((c) =>
    isCountryCode(c.code),
  ).length;
  return {
    usable: countryCount >= MIN_MAP_COUNTRIES,
    countryCount,
    latestYear: series.latestYear,
  };
}

/** The result of checking one indicator against the World Bank. */
export type IndicatorCheck =
  | { kind: "checked"; coverage: IndicatorCoverage }
  /** The World Bank no longer serves the code (archived or deleted) */
  | { kind: "notFound" }
  /** Timeout, network or upstream error: says nothing about the data */
  | { kind: "failed" };

export type IndicatorAvailability = "usable" | "unusable";

const HOUR_MS = 60 * 60 * 1000;
/** A settled answer is re-checked weekly, a failed check after a day */
export const RECHECK_AFTER_MS = 7 * 24 * HOUR_MS;
export const RETRY_FAILED_AFTER_MS = 24 * HOUR_MS;
/** Consecutive failed checks after which an indicator counts as unusable */
export const MAX_FAILED_CHECKS = 3;

export interface IndicatorState {
  /** Undefined until the first check settles */
  availability?: IndicatorAvailability;
  failedChecks: number;
}

/**
 * The indicator's state after a check, and when to check it next. A single
 * failed request keeps what we knew (an upstream hiccup must not hide a
 * good indicator); repeated failures mean users would hit the same wall.
 */
export function stateAfterCheck(
  previous: IndicatorState,
  check: IndicatorCheck,
): IndicatorState & { recheckAfterMs: number } {
  switch (check.kind) {
    case "checked":
      return {
        availability: check.coverage.usable ? "usable" : "unusable",
        failedChecks: 0,
        recheckAfterMs: RECHECK_AFTER_MS,
      };
    case "notFound":
      return {
        availability: "unusable",
        failedChecks: 0,
        recheckAfterMs: RECHECK_AFTER_MS,
      };
    case "failed": {
      const failedChecks = previous.failedChecks + 1;
      return {
        availability:
          failedChecks >= MAX_FAILED_CHECKS
            ? "unusable"
            : previous.availability,
        failedChecks,
        recheckAfterMs: RETRY_FAILED_AFTER_MS,
      };
    }
  }
}
