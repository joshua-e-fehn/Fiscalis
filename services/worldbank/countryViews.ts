/**
 * Pure logic behind the per-country World Bank views on /tools/world-map:
 * the change between two years, ranking by that change, the diverging
 * colour stops for the "compare years" map, one country's history and CSV
 * serialisation. A missing value is always `null` ("no data"), never 0.
 */

/** One country's value in one year's snapshot (CountryDataPoint subset). */
export interface CountryValue {
  code: string;
  value: number | null;
}

export interface YearSnapshot {
  year: number;
  countries: CountryValue[];
}

/** The change of one country between a start and an end year. */
export interface CountryDelta {
  code: string;
  startValue: number | null;
  endValue: number | null;
  /** endValue − startValue; null when either year has no data */
  absolute: number | null;
  /** Relative change in percent; null without data or from a start of 0 */
  percent: number | null;
}

export type ChangeOrder = "increase" | "decrease";
export type ChangeMetric = "absolute" | "percent";

const isNumber = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Real countries carry ISO alpha-2 codes; World Bank aggregates (World, OECD,
 * income groups …) keep their 3-character codes.
 */
export function isCountryCode(code: string): boolean {
  return code.length === 2;
}

/**
 * Change per country between two snapshots. Every country present in either
 * year gets a row; a value missing in either year leaves the change null.
 */
export function computeCountryDeltas(
  start: CountryValue[],
  end: CountryValue[],
): CountryDelta[] {
  const startByCode = new Map(start.map((c) => [c.code, c.value]));
  const endByCode = new Map(end.map((c) => [c.code, c.value]));
  const codes = [...new Set([...startByCode.keys(), ...endByCode.keys()])];

  return codes.map((code) => {
    const s = startByCode.get(code);
    const e = endByCode.get(code);
    const startValue = isNumber(s) ? s : null;
    const endValue = isNumber(e) ? e : null;
    const hasBoth = startValue !== null && endValue !== null;
    const absolute = hasBoth ? endValue - startValue : null;
    const percent =
      hasBoth && startValue !== 0
        ? ((endValue - startValue) / Math.abs(startValue)) * 100
        : null;
    return { code, startValue, endValue, absolute, percent };
  });
}

/**
 * The countries with the biggest increase (largest change first) or
 * decrease (most negative first). Rows without a change for the metric and
 * aggregates are left out. Ties break by code so the order is stable.
 */
export function rankByChange(
  deltas: CountryDelta[],
  order: ChangeOrder,
  metric: ChangeMetric = "absolute",
  limit?: number,
): CountryDelta[] {
  const ranked = deltas
    .filter((d) => isCountryCode(d.code) && isNumber(d[metric]))
    .sort((a, b) => {
      const diff = (b[metric] as number) - (a[metric] as number);
      const byValue = order === "increase" ? diff : -diff;
      return byValue !== 0 ? byValue : a.code.localeCompare(b.code);
    });
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/** Linear-interpolated quantile of an ascending list (q in [0, 1]). */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Stops for a diverging colour scale centred on zero: `steps` ascending
 * values from −m to +m, where m is the 95th percentile of |change| so one
 * outlier does not wash out every other country (values beyond m clamp to
 * the end colours). Returns null when there is nothing to scale (no values,
 * or every change is 0).
 */
export function divergingStops(
  values: Array<number | null>,
  steps: number = 5,
): number[] | null {
  if (steps < 3 || steps % 2 === 0) {
    throw new Error("divergingStops needs an odd number of steps ≥ 3");
  }
  const magnitudes = values
    .filter(isNumber)
    .map(Math.abs)
    .sort((a, b) => a - b);
  if (magnitudes.length === 0) return null;

  let m = quantile(magnitudes, 0.95);
  if (m === 0) m = magnitudes[magnitudes.length - 1];
  if (m === 0) return null;

  const half = (steps - 1) / 2;
  return Array.from({ length: steps }, (_, i) => ((i - half) / half) * m);
}

/** A point of one country's history; value null where no data exists. */
export interface HistoryPoint {
  year: number;
  value: number | null;
}

/**
 * One country's values across snapshots, ascending by year. Years without
 * data stay in as null (a gap in the chart) except before the first and
 * after the last recorded value, which are trimmed.
 */
export function countryHistory(
  snapshots: YearSnapshot[],
  code: string,
): HistoryPoint[] {
  const points = [...snapshots]
    .sort((a, b) => a.year - b.year)
    .map((snapshot) => {
      const value = snapshot.countries.find((c) => c.code === code)?.value;
      return { year: snapshot.year, value: isNumber(value) ? value : null };
    });
  const first = points.findIndex((p) => p.value !== null);
  if (first === -1) return [];
  const last = points.findLastIndex((p) => p.value !== null);
  return points.slice(first, last + 1);
}

export type CsvCell = string | number | null | undefined;

/** One RFC 4180 field: quoted when it holds a comma, quote or newline. */
export function csvField(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const text = typeof cell === "number" ? String(cell) : cell;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV document; missing values are empty cells, never 0. */
export function toCsv(header: CsvCell[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
}
