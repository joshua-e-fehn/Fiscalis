import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { createRegionNamer } from "@/../services/i18n/regionNames";
import {
  computeCountryDeltas,
  isCountryCode,
} from "@/../services/worldbank/countryViews";
import {
  seriesCountryHistory,
  yearSnapshot,
  type SnapshotCountry,
} from "@/../services/worldbank/series";

import {
  getIndicators,
  getIndicatorsGrouped,
  getIndicatorSeries,
  INDICATOR_METADATA,
  searchWorldBankIndicators,
  WorldBankIndicatorNotFoundError,
} from "@/lib/api/worldbank";
import { getFormatFunction } from "@/lib/api/worldbank-search";
import { isIndicatorId } from "@/lib/types/worldbank";
import type {
  CountryDataPoint,
  IndicatorData,
  IndicatorMetadata,
  IndicatorCategory,
  IndicatorSeriesData,
  SeriesIndicator,
} from "@/lib/types/worldbank";
import type { SearchedIndicator } from "@/lib/types/worldbank-search";

// ═══════════════════════════════════════════════════════════════
// Query Keys
// ═══════════════════════════════════════════════════════════════

export const worldDataKeys = {
  all: ["world-data"] as const,
  indicators: () => [...worldDataKeys.all, "indicators"] as const,
  indicatorsGrouped: () =>
    [...worldDataKeys.all, "indicators", "grouped"] as const,
  search: (query: string) => [...worldDataKeys.all, "search", query] as const,
  /** An indicator's full history; featured ids and searched codes apart */
  series: (indicator: string, isDynamic: boolean) =>
    [
      ...worldDataKeys.all,
      "series",
      isDynamic ? "dynamic" : "featured",
      indicator,
    ] as const,
};

// ═══════════════════════════════════════════════════════════════
// Data Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * An indicator's whole history in one request: every year, the latest
 * well-covered year and the year range. Switching years, playback,
 * "compare years" and a country's history all read this one query, so
 * there is nothing to prefetch. Featured ids and searched World Bank codes
 * both work; `isDynamic` marks a searched code.
 */
export function useIndicatorSeries(indicator: string, isDynamic: boolean) {
  const dynamic = isDynamic || !isIndicatorId(indicator);
  return useQuery<IndicatorSeriesData>({
    queryKey: worldDataKeys.series(indicator, dynamic),
    queryFn: () => getIndicatorSeries(indicator, dynamic),
    enabled: indicator.length > 0,
    // The server and CDN refresh daily. An empty series may be an upstream
    // hiccup, so like the server it is only kept fresh for a minute.
    staleTime: (query) =>
      query.state.data?.series.firstYear === null
        ? 60 * 1000
        : 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    // The server already retries the World Bank; one more try covers a
    // dropped connection without stacking minute-long waits. A code the
    // World Bank no longer serves is final.
    retry: (failureCount, error) =>
      !(error instanceof WorldBankIndicatorNotFoundError) && failureCount < 1,
  });
}

/** English display formatting of an indicator's values (map tooltip, CSV). */
function valueFormatter(indicator: SeriesIndicator): (value: number) => string {
  return isIndicatorId(indicator.id)
    ? INDICATOR_METADATA[indicator.id].formatFn
    : getFormatFunction(indicator.unit);
}

/** One year of a loaded series, shaped as the map's per-year data. */
export function toYearData(
  data: IndicatorSeriesData,
  year: number,
): IndicatorData {
  const format = valueFormatter(data.indicator);
  return {
    indicator: data.indicator,
    year,
    lastUpdated: data.lastUpdated,
    source: data.source,
    countries: yearSnapshot(data.series, year).map(
      (c): CountryDataPoint => ({ ...c, formattedValue: format(c.value) }),
    ),
  };
}

/** Memoised `toYearData`; undefined while the series loads. */
export function useYearData(
  data: IndicatorSeriesData | undefined,
  year: number,
): IndicatorData | undefined {
  return useMemo(() => (data ? toYearData(data, year) : undefined), [data, year]);
}

/**
 * Change per country between two years of a loaded series. A country
 * missing a value in either year has a null change ("no data"), never 0.
 */
export function useWorldDataDelta(
  data: IndicatorSeriesData | undefined,
  startYear: number,
  endYear: number,
  enabled: boolean = true,
) {
  return useMemo(() => {
    if (!data || !enabled) {
      return { data: null, startCountries: [], endCountries: [] };
    }
    const startCountries: SnapshotCountry[] = yearSnapshot(
      data.series,
      startYear,
    );
    const endCountries: SnapshotCountry[] = yearSnapshot(data.series, endYear);
    return {
      data: computeCountryDeltas(startCountries, endCountries),
      startCountries,
      endCountries,
    };
  }, [data, startYear, endYear, enabled]);
}

/**
 * Fetch list of available indicators
 */
export function useIndicators() {
  return useQuery<{ indicators: IndicatorMetadata[] }>({
    queryKey: worldDataKeys.indicators(),
    queryFn: getIndicators,
    staleTime: Infinity, // Never changes during session
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch indicators grouped by category
 */
export function useIndicatorsGrouped() {
  return useQuery<{ grouped: Record<IndicatorCategory, IndicatorMetadata[]> }>({
    queryKey: worldDataKeys.indicatorsGrouped(),
    queryFn: getIndicatorsGrouped,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

// ═══════════════════════════════════════════════════════════════
// Dynamic Indicator Hooks (Search any World Bank indicator)
// ═══════════════════════════════════════════════════════════════

/**
 * Search World Bank indicators with debouncing
 */
export function useIndicatorSearch(query: string, enabled: boolean = true) {
  return useQuery<{ indicators: SearchedIndicator[]; query: string }>({
    queryKey: worldDataKeys.search(query),
    queryFn: () => searchWorldBankIndicators(query, 50),
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
}

// ═══════════════════════════════════════════════════════════════
// Utility Hooks
// ═══════════════════════════════════════════════════════════════

/**
 * One country's history for an indicator across every year with data,
 * read from the same series query as the map (no extra request once the
 * map has loaded). Years without data are gaps; idle while countryCode is
 * null.
 */
export function useCountryData(
  indicator: string,
  countryCode: string | null,
  isDynamic: boolean = false,
) {
  const series = useIndicatorSeries(indicator, isDynamic);
  const data = useMemo(
    () =>
      series.data && countryCode
        ? seriesCountryHistory(series.data.series, countryCode)
        : [],
    [series.data, countryCode],
  );
  return { data, isLoading: series.isLoading, isError: series.isError };
}

/**
 * Top N countries by value in one year's data. Aggregate regions (World,
 * OECD, …) are left out: only real countries with 2-letter ISO codes.
 */
export function useTopCountries(
  countries: CountryDataPoint[] | undefined,
  count: number = 10,
  order: "asc" | "desc" = "desc",
) {
  return useMemo(
    () =>
      (countries ?? [])
        .filter((c) => c.value !== null && isCountryCode(c.code))
        .sort((a, b) => {
          const comparison = (b.value ?? 0) - (a.value ?? 0);
          return order === "desc" ? comparison : -comparison;
        })
        .slice(0, count),
    [countries, count, order],
  );
}

// ═══════════════════════════════════════════════════════════════
// Display text in the UI language
// ═══════════════════════════════════════════════════════════════

/**
 * An indicator's name and description for display. Curated indicators are
 * translated (worldMap.indicators.<id>); the API keeps returning English.
 * Indicators found through the upstream search stay in English: the World
 * Bank publishes no German metadata.
 */
export function useIndicatorText() {
  const t = useTranslations("worldMap.indicators");

  return useCallback(
    (indicator: { id: string; name: string; description?: string }) =>
      isIndicatorId(indicator.id)
        ? {
            name: t(`${indicator.id}.name`),
            description: t(`${indicator.id}.description`),
          }
        : { name: indicator.name, description: indicator.description },
    [t],
  );
}

/**
 * Country names in the UI language, by ISO alpha-2 code; English, aggregates and
 * unknown codes keep the World Bank / GeoJSON English name.
 */
export function useCountryName() {
  const locale = useLocale();
  return useMemo(() => createRegionNamer(locale), [locale]);
}

/**
 * Locale-aware formatting of an indicator's values and of changes between
 * two years, by the indicator's unit ("$", "%", "years", "t" or none). The
 * API's formattedValue is English-only; this is for values computed here
 * (chart axes, deltas). A change in a "%" indicator is in percentage points.
 */
export function useIndicatorFormat(unit: string | undefined) {
  const t = useTranslations("worldMap.units");
  const format = useFormatter();

  return useMemo(() => {
    const render = (value: number, signed: boolean, isChange: boolean) => {
      const signDisplay = signed ? ("exceptZero" as const) : ("auto" as const);
      if (unit === "$") {
        return format.number(value, {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 2,
          signDisplay,
        });
      }
      const number = format.number(value, {
        notation: Math.abs(value) >= 1e6 ? "compact" : "standard",
        maximumFractionDigits: unit === "t" ? 2 : 1,
        signDisplay,
      });
      if (unit === "%") {
        return isChange
          ? t("percentPoints", { value: number })
          : t("percentValue", { value: number });
      }
      if (unit === "years") return t("yearsValue", { value: number });
      if (unit === "t") return t("tonnesValue", { value: number });
      return number;
    };

    return {
      /** A level, e.g. a chart tick or tooltip value */
      value: (value: number) => render(value, false, false),
      /** An absolute change, always signed */
      change: (value: number) => render(value, true, true),
      /** A relative change given in percent (12.5 → "+12.5%") */
      percentChange: (percent: number) =>
        format.number(percent / 100, {
          style: "percent",
          maximumFractionDigits: 1,
          signDisplay: "exceptZero",
        }),
    };
  }, [format, t, unit]);
}
