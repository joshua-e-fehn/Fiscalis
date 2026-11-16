"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Map as MapGL,
  Source,
  Layer,
  Popup,
  NavigationControl,
} from "react-map-gl/maplibre";
import type { MapEvent, MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadMapLibre } from "@/lib/utils/loadMapLibre";
import { useTranslations } from "next-intl";

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Switch } from "@/components/ui/shadcn/switch";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  Globe2,
  Database,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  Download,
  Loader2,
  Calendar,
  FileSpreadsheet,
  ChevronDown,
  Search,
  Heart,
  GitCompareArrows,
} from "lucide-react";

// Custom Components
import { TimeSlider, SpeedControl } from "@/components/atomic/atoms/timeSlider";
import {
  IndicatorSearch,
  type SelectedIndicator,
} from "@/components/atomic/molecules/indicatorSearch";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { CountryHistoryPanel } from "@/components/atomic/organisms/worldMap/CountryHistoryPanel";

// Hooks
import {
  useIndicatorSeries,
  useYearData,
  useIndicatorsGrouped,
  useTopCountries,
  useIndicatorText,
  useCountryName,
  useWorldDataDelta,
  useIndicatorFormat,
} from "@/hooks/worldbank";
import { INDICATOR_METADATA } from "@/lib/api/worldbank";
import { useTimePlayback } from "@/hooks/useTimePlayback";
import { useIsIndicatorFavorited, useToggleFavorite } from "@/hooks/convex";

// Types
import { YEAR_RANGE, isIndicatorId } from "@/lib/types/worldbank";

// Auth
import { useUser } from "@clerk/nextjs";

// Logic
import {
  divergingStops,
  isCountryCode,
  rankByChange,
  toCsv,
  type ChangeMetric,
  type ChangeOrder,
  type CountryDelta,
  type CsvCell,
} from "@/../services/worldbank/countryViews";
import { seriesYears, yearSnapshot } from "@/../services/worldbank/series";

// Utils
import {
  createDivergingMapColorExpression,
  createMapColorExpression,
  getRecommendedColorScale,
  getColorPalette,
  isInvertedIndicator,
  NO_DATA_COLOR,
  NO_DATA_VALUE,
} from "@/lib/utils/mapColors";
import type {
  MapColorExpression,
  MapValueExpression,
} from "@/lib/utils/mapColors";
import { isolateLtr } from "@/../services/i18n/bidi";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

// Properties read from /data/custom.geo.json country features
type CountryProperties = {
  iso_a2?: string;
  iso_a2_eh?: string;
  wb_a2?: string;
  name?: string;
  admin?: string;
  [key: string]: unknown;
};
type CountryFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  CountryProperties
>;

// Value of a country without data in the map's paint expressions
const NO_DATA_MARKER = NO_DATA_VALUE;

// Default indicator state: the stored (English) name and description come
// from the registry; the UI shows worldMap.indicators.gdp
const DEFAULT_INDICATOR: SelectedIndicator = {
  id: "gdp",
  name: INDICATOR_METADATA.gdp.name,
  description: INDICATOR_METADATA.gdp.description,
  isDynamic: false,
  unit: INDICATOR_METADATA.gdp.unit,
};

// "Compare years" opens on the last 20 years up to the latest year
const DEFAULT_COMPARE_SPAN = 20;

/**
 * A GeoJSON country's ISO alpha-2 code: iso_a2, else iso_a2_eh (France,
 * Norway, Kosovo), else wb_a2, skipping the -99 placeholder. Taiwan is
 * CN-TW in the GeoJSON but TW in the data.
 */
function resolveCountryCode(props: CountryProperties): string | undefined {
  for (const code of [props.iso_a2, props.iso_a2_eh, props.wb_a2]) {
    if (code && code !== "-99") return code === "CN-TW" ? "TW" : code;
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function WorldMapPage() {
  const t = useTranslations("worldMap");
  const indicatorText = useIndicatorText();
  const countryName = useCountryName();

  // Auth - for favorites
  const { user } = useUser();
  const userId = user?.id;

  // State - using unified indicator selection
  const [selectedIndicator, setSelectedIndicator] =
    useState<SelectedIndicator>(DEFAULT_INDICATOR);
  const [geoJsonData, setGeoJsonData] =
    useState<CountryFeatureCollection | null>(null);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [firstLabelLayerId, setFirstLabelLayerId] = useState<
    string | undefined
  >(undefined);
  const [hoveredCountry, setHoveredCountry] = useState<{
    name: string;
    code: string;
    value: number | null;
    formattedValue: string;
    longitude: number;
    latitude: number;
  } | null>(null);
  // Country whose history is open in the side panel
  const [selectedCountry, setSelectedCountry] = useState<{
    code: string;
    name: string;
  } | null>(null);
  // "Compare years": the map shows the change between two years. null
  // means the default span ending in the indicator's latest year.
  const [compareMode, setCompareMode] = useState(false);
  const [pickedCompareStart, setCompareStart] = useState<number | null>(null);
  const [pickedCompareEnd, setCompareEnd] = useState<number | null>(null);
  const [rankOrder, setRankOrder] = useState<ChangeOrder>("increase");
  const [rankMetric, setRankMetric] = useState<ChangeMetric>("absolute");

  // A featured (curated) indicator or a World Bank code from the search
  const isFeaturedIndicator =
    !selectedIndicator.isDynamic && isIndicatorId(selectedIndicator.id);

  // The indicator's whole history in one request; every year below is a
  // local read of it
  const seriesQuery = useIndicatorSeries(
    selectedIndicator.id,
    !isFeaturedIndicator,
  );
  const seriesData = seriesQuery.data;
  const series = seriesData?.series;
  const isLoading = seriesQuery.isLoading;
  const error = seriesQuery.error;
  const refetch = seriesQuery.refetch;

  // The slider spans the years with data; before the series arrives it
  // keeps the requested range
  const minYear = series?.firstYear ?? YEAR_RANGE.min;
  const maxYear = series?.lastYear ?? YEAR_RANGE.max;
  const latestYear = series?.latestYear ?? maxYear;
  const yearsDesc = useMemo(
    () => (series ? seriesYears(series).reverse() : []),
    [series],
  );

  const compareEnd = pickedCompareEnd ?? latestYear;
  const compareStart =
    pickedCompareStart ?? Math.max(minYear, latestYear - DEFAULT_COMPARE_SPAN);
  const compareActive = compareMode;
  const isComparing = compareActive && compareStart !== compareEnd;

  const {
    year,
    setYear,
    isPlaying,
    toggle: togglePlayback,
    pause: pausePlayback,
    stepForward,
    stepBackward,
    jumpToStart,
    jumpToEnd,
    speed,
    setSpeed,
  } = useTimePlayback({
    initialYear: YEAR_RANGE.max,
    minYear,
    maxYear,
    intervalMs: 500,
  });

  // Each indicator opens on its latest well-covered year (and its default
  // comparison), once its series has loaded
  const openedIndicatorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!series || openedIndicatorRef.current === selectedIndicator.id) return;
    openedIndicatorRef.current = selectedIndicator.id;
    if (series.latestYear !== null) setYear(series.latestYear);
    setCompareStart(null);
    setCompareEnd(null);
  }, [series, selectedIndicator.id, setYear]);

  const worldData = useYearData(seriesData, year);

  // Favorites
  const { isFavorited: isCurrentFavorited } = useIsIndicatorFavorited(
    selectedIndicator.id,
  );
  const toggleFavorite = useToggleFavorite();

  const { data: indicatorsData } = useIndicatorsGrouped();

  const topCountries = useTopCountries(worldData?.countries, 5, "desc");

  // Change between the two compared years
  const delta = useWorldDataDelta(
    seriesData,
    compareStart,
    compareEnd,
    isComparing,
  );
  const deltaByCode = useMemo(
    () => new Map((delta.data ?? []).map((d) => [d.code, d])),
    [delta.data],
  );
  // English names of every country in either compared year
  const comparedNames = useMemo(() => {
    const names = new Map<string, { name: string; code3: string }>();
    for (const c of [...delta.startCountries, ...delta.endCountries]) {
      names.set(c.code, { name: c.name, code3: c.code3 });
    }
    return names;
  }, [delta.startCountries, delta.endCountries]);

  // Load GeoJSON
  useEffect(() => {
    async function fetchGeoJson() {
      try {
        const response = await fetch("/data/custom.geo.json");
        if (!response.ok) throw new Error("Failed to load GeoJSON");
        const data = await response.json();
        setGeoJsonData(data);
      } catch (err) {
        console.error("Error loading GeoJSON:", err);
        setMapLoadFailed(true);
      }
    }
    fetchGeoJson();
  }, []);

  // The country shapes, reduced once to the code and name the map needs.
  // The data never goes into the GeoJSON: changing the year or indicator
  // only swaps the paint expression, so the (large) shapes are uploaded to
  // the map once instead of on every year.
  const countryShapes = useMemo((): CountryFeatureCollection | null => {
    if (!geoJsonData) return null;
    return {
      ...geoJsonData,
      features: geoJsonData.features.map((feature) => ({
        ...feature,
        properties: {
          resolvedCode: resolveCountryCode(feature.properties),
          name: feature.properties.name ?? feature.properties.admin,
        },
      })),
    };
  }, [geoJsonData]);

  // The value each country is coloured by: the year's value, or the change
  // when comparing (missing in either year is no data)
  const countryByCode = useMemo(
    () => new Map((worldData?.countries ?? []).map((c) => [c.code, c])),
    [worldData],
  );
  const mapValues = useMemo(() => {
    const values = new Map<string, number>();
    if (isComparing) {
      for (const d of delta.data ?? []) {
        if (d.absolute !== null) values.set(d.code, d.absolute);
      }
    } else {
      for (const c of worldData?.countries ?? []) {
        if (c.value !== null) values.set(c.code, c.value);
      }
    }
    return values;
  }, [isComparing, delta.data, worldData]);

  // Looks a feature's value up by its code; NO_DATA_MARKER without one
  const valueExpression = useMemo((): MapValueExpression => {
    const pairs = [...mapValues].flat();
    return pairs.length === 0
      ? ["literal", NO_DATA_MARKER]
      : ([
          "match",
          ["coalesce", ["get", "resolvedCode"], ""],
          ...pairs,
          NO_DATA_MARKER,
        ] as unknown as MapValueExpression);
  }, [mapValues]);

  // Color expression for map
  const colorExpression = useMemo((): MapColorExpression => {
    if (isComparing) {
      const changes = (delta.data ?? [])
        .filter((d) => isCountryCode(d.code))
        .map((d) => d.absolute);
      return createDivergingMapColorExpression(
        divergingStops(changes),
        isInvertedIndicator(selectedIndicator.id),
        valueExpression,
      );
    }
    if (!worldData) return ["literal", NO_DATA_COLOR];

    const values = worldData.countries
      .map((c) => c.value)
      .filter((v): v is number => v !== null);

    // Searched indicators: quantile, not inverted (the registry knows
    // neither for them)
    return createMapColorExpression(
      values,
      getRecommendedColorScale(selectedIndicator.id),
      isInvertedIndicator(selectedIndicator.id),
      valueExpression,
    );
  }, [
    worldData,
    selectedIndicator.id,
    isComparing,
    delta.data,
    valueExpression,
  ]);

  // Map layers - insert before labels to keep text visible
  const countryLayer = useMemo(
    () => ({
      id: "country-data",
      type: "fill" as const,
      ...(firstLabelLayerId && { beforeId: firstLabelLayerId }),
      paint: {
        "fill-color": colorExpression,
        "fill-opacity": 0.8,
      },
    }),
    [colorExpression, firstLabelLayerId],
  );

  const borderLayer = useMemo(
    () => ({
      id: "country-borders",
      type: "line" as const,
      ...(firstLabelLayerId && { beforeId: firstLabelLayerId }),
      paint: {
        "line-color": "#ffffff",
        "line-width": 1,
      },
    }),
    [firstLabelLayerId],
  );

  // Map load handler - find first label layer
  const onMapLoad = useCallback((event: MapEvent) => {
    const map = event.target;
    const layers = map.getStyle()?.layers || [];

    // Find first symbol layer (labels) to insert our layers before it
    const firstSymbolLayer = layers.find((layer) => layer.type === "symbol");

    if (firstSymbolLayer) {
      setFirstLabelLayerId(firstSymbolLayer.id);
    }
  }, []);

  // Value as shown in the UI: the API formats values in English, so a
  // missing value and the "years" unit are rendered here, and its "-1.2%"
  // is isolated so it reads left to right in the RTL UI too.
  const indicatorUnit = worldData?.indicator?.unit;
  const displayValue = useCallback(
    (value: number | null | undefined, formattedValue: string | undefined) => {
      if (
        value === null ||
        value === undefined ||
        value === NO_DATA_MARKER ||
        !formattedValue
      ) {
        return t("map.noData");
      }
      if (indicatorUnit === "years") {
        return t("units.yearsValue", { value: value.toFixed(1) });
      }
      return isolateLtr(formattedValue);
    },
    [t, indicatorUnit],
  );

  // A change between the compared years, e.g. "+1.2 pp (+8.3%)"
  const fmt = useIndicatorFormat(indicatorUnit);
  const displayChange = useCallback(
    (d: CountryDelta | undefined) => {
      if (!d || d.absolute === null) return t("map.noData");
      const absolute = fmt.change(d.absolute);
      return d.percent === null
        ? absolute
        : t("compare.changeValue", {
            absolute,
            percent: fmt.percentChange(d.percent),
          });
    },
    [t, fmt],
  );

  // Hover handler
  const onHover = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];

      if (feature?.properties) {
        const props = feature.properties;
        const { lng: longitude, lat: latitude } = event.lngLat;
        const code: string = props.resolvedCode ?? "";
        const data = countryByCode.get(code);
        const englishName: string = data?.name || props.name || code;

        setHoveredCountry({
          name: countryName(code, englishName),
          code,
          value: data?.value ?? null,
          formattedValue: isComparing
            ? displayChange(deltaByCode.get(code))
            : displayValue(data?.value, data?.formattedValue),
          longitude,
          latitude,
        });
      } else {
        setHoveredCountry(null);
      }
    },
    [
      countryName,
      displayValue,
      displayChange,
      isComparing,
      deltaByCode,
      countryByCode,
    ],
  );

  // Click handler: open the country's history
  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const props = event.features?.[0]?.properties;
      const code: string | undefined = props?.resolvedCode;
      if (!props || !code) return;
      const englishName: string =
        countryByCode.get(code)?.name || props.name || code;
      setSelectedCountry({ code, name: countryName(code, englishName) });
    },
    [countryName, countryByCode],
  );

  // The selected indicator's name and description in the UI language
  const selectedText = indicatorText(selectedIndicator);
  const mapTitle = isFeaturedIndicator
    ? selectedText.name
    : worldData?.indicator?.name;
  const mapDescription = isComparing
    ? t("compare.mapDescription", { start: compareStart, end: compareEnd })
    : isFeaturedIndicator
      ? selectedText.description
      : worldData?.indicator?.description;
  const mapLoading = isLoading;
  const unitLabel =
    indicatorUnit === "years" ? t("units.years") : indicatorUnit;

  // Handle indicator change
  const handleIndicatorChange = useCallback(
    (newIndicator: SelectedIndicator) => {
      setSelectedIndicator(newIndicator);
    },
    [],
  );

  // Helper function to trigger CSV download
  const downloadCSV = useCallback((content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Export current year to CSV
  const exportCurrentYear = useCallback(() => {
    if (!worldData) return;

    const indicatorName = isFeaturedIndicator
      ? indicatorText(selectedIndicator).name
      : worldData.indicator.name;
    const unit =
      worldData.indicator.unit === "years"
        ? t("units.years")
        : worldData.indicator.unit;

    // Build CSV content (headers translated, values machine-readable)
    const headers = [
      t("csv.countryCode"),
      t("csv.countryCodeIso3"),
      t("csv.countryName"),
      t("csv.value", { indicator: indicatorName, unit }),
      t("csv.year"),
    ];
    const rows = worldData.countries
      .filter((c) => c.value !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((country) => [
        country.code,
        country.code3,
        country.name,
        country.value,
        year,
      ]);

    downloadCSV(
      toCsv(headers, rows),
      `world-data-${selectedIndicator.id}-${year}.csv`,
    );
  }, [
    worldData,
    selectedIndicator,
    year,
    downloadCSV,
    isFeaturedIndicator,
    indicatorText,
    t,
  ]);

  // Export all years to CSV, straight from the loaded series
  const exportAllYears = useCallback(() => {
    if (!seriesData) return;
    const indicatorName = indicatorText(selectedIndicator).name;
    const unit =
      seriesData.indicator.unit === "years"
        ? t("units.years")
        : seriesData.indicator.unit;

    const headers = [
      t("csv.countryCode"),
      t("csv.countryCodeIso3"),
      t("csv.countryName"),
      t("csv.year"),
      t("csv.value", { indicator: indicatorName, unit }),
    ];
    const rows = seriesYears(seriesData.series)
      .flatMap((y) =>
        yearSnapshot(seriesData.series, y).map((c) => [
          c.code,
          c.code3,
          c.name,
          y,
          c.value,
        ]),
      )
      // Sort by country name, then by year
      .sort(
        (a, b) =>
          String(a[2]).localeCompare(String(b[2])) ||
          Number(a[3]) - Number(b[3]),
      );

    downloadCSV(
      toCsv(headers, rows),
      `world-data-${selectedIndicator.id}-all-years.csv`,
    );
  }, [seriesData, selectedIndicator, downloadCSV, indicatorText, t]);

    // Export the comparison: both years plus the change columns. A country
  // missing either year keeps an empty change, never 0.
  const exportComparison = useCallback(() => {
    if (!delta.data) return;
    const indicatorName = indicatorText(selectedIndicator).name;
    const unit =
      indicatorUnit === "years" ? t("units.years") : (indicatorUnit ?? "");
    const headers = [
      t("csv.countryCode"),
      t("csv.countryCodeIso3"),
      t("csv.countryName"),
      t("csv.yearValue", {
        indicator: indicatorName,
        year: compareStart,
        unit,
      }),
      t("csv.yearValue", { indicator: indicatorName, year: compareEnd, unit }),
      t("csv.absoluteChange", { start: compareStart, end: compareEnd, unit }),
      t("csv.percentChange", { start: compareStart, end: compareEnd }),
    ];
    const rows: CsvCell[][] = delta.data
      .filter((d) => d.startValue !== null || d.endValue !== null)
      .map((d) => {
        const names = comparedNames.get(d.code);
        return [
          d.code,
          names?.code3,
          names?.name ?? d.code,
          d.startValue,
          d.endValue,
          d.absolute,
          d.percent,
        ];
      })
      .sort((a, b) => String(a[2]).localeCompare(String(b[2])));

    downloadCSV(
      toCsv(headers, rows),
      `world-data-${selectedIndicator.id}-${compareStart}-${compareEnd}.csv`,
    );
  }, [
    delta.data,
    comparedNames,
    selectedIndicator,
    indicatorText,
    indicatorUnit,
    compareStart,
    compareEnd,
    downloadCSV,
    t,
  ]);

  // Biggest increase / decrease between the compared years
  const rankedChanges = useMemo(
    () =>
      delta.data ? rankByChange(delta.data, rankOrder, rankMetric, 5) : [],
    [delta.data, rankOrder, rankMetric],
  );

  // The sidebar list: biggest changes when comparing, else top values
  const topEntries = isComparing
    ? rankedChanges.map((d) => ({
        code: d.code,
        name: countryName(d.code, comparedNames.get(d.code)?.name ?? d.code),
        detail: displayChange(d),
      }))
    : topCountries.map((c) => ({
        code: c.code,
        name: countryName(c.code, c.name),
        detail: displayValue(c.value, c.formattedValue),
      }));

  // Legend colors
  const legendColors = useMemo(() => {
    const inverted = isInvertedIndicator(selectedIndicator.id);
    return isComparing
      ? getColorPalette("diverging", 5, inverted)
      : getColorPalette(
          getRecommendedColorScale(selectedIndicator.id),
          5,
          inverted,
        );
  }, [selectedIndicator.id, isComparing]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <PageHeader title={t("page.title")} subtitle={t("page.subtitle")} />

      {/* Controls Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>{t("controls.title")}</CardTitle>
              <CardDescription>{t("controls.description")}</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              {/* Favorite Button */}
              {userId && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    toggleFavorite({
                      indicatorCode: selectedIndicator.id,
                      indicatorName: selectedIndicator.name,
                      indicatorDescription: selectedIndicator.description,
                    })
                  }
                  className="h-10 w-10"
                  title={
                    isCurrentFavorited
                      ? t("controls.removeFavorite")
                      : t("controls.addFavorite")
                  }
                  aria-label={
                    isCurrentFavorited
                      ? t("controls.removeFavorite")
                      : t("controls.addFavorite")
                  }
                >
                  <Heart
                    className={`h-5 w-5 transition-colors ${
                      isCurrentFavorited
                        ? "text-red-500 fill-red-500"
                        : "text-muted-foreground hover:text-red-500"
                    }`}
                  />
                </Button>
              )}

              {/* Indicator Selector */}
              <IndicatorSearch
                selectedIndicator={selectedIndicator}
                onSelect={handleIndicatorChange}
                featuredIndicators={indicatorsData?.grouped}
                userId={userId}
              />

              {/* Year Badge */}
              <Badge variant="secondary" className="text-lg px-4 py-1">
                {isComparing
                  ? t("compare.fromTo", {
                      start: compareStart,
                      end: compareEnd,
                    })
                  : year}
              </Badge>

              {/* Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!worldData}>
                    <Download className="h-4 w-4 me-2" />
                    {t("export.button")}
                    <ChevronDown className="h-4 w-4 ms-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={exportCurrentYear}
                    disabled={!worldData || isLoading}
                  >
                    <Calendar className="h-4 w-4 me-2" />
                    {t("export.currentYear", { year })}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportAllYears}
                    disabled={!seriesData}
                  >
                    <FileSpreadsheet className="h-4 w-4 me-2" />
                    {t("export.allYears", { min: minYear, max: maxYear })}
                  </DropdownMenuItem>
                  {isComparing && (
                    <DropdownMenuItem
                      onClick={exportComparison}
                      disabled={!delta.data}
                    >
                      <GitCompareArrows className="h-4 w-4 me-2" />
                      {t("export.comparison", {
                        start: compareStart,
                        end: compareEnd,
                      })}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Time Slider */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("controls.timePeriod")}
              </span>
              {!compareActive && (
                <SpeedControl speed={speed} onSpeedChange={setSpeed} />
              )}
            </div>

            {/* Compare years */}
            <div className="flex flex-wrap items-center gap-4 mb-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="compare-years"
                  checked={compareActive}
                  onCheckedChange={(on) => {
                    // The slider is hidden while comparing; stop playback with it
                    if (on) pausePlayback();
                    setCompareMode(on);
                  }}
                  disabled={!series}
                />
                <Label htmlFor="compare-years">{t("compare.toggle")}</Label>
              </div>
              {compareActive && (
                <>
                  <CompareYearSelect
                    label={t("compare.from")}
                    value={compareStart}
                    years={yearsDesc}
                    onChange={setCompareStart}
                  />
                  <CompareYearSelect
                    label={t("compare.to")}
                    value={compareEnd}
                    years={yearsDesc}
                    onChange={setCompareEnd}
                  />
                  {compareStart === compareEnd && (
                    <span className="text-xs text-destructive">
                      {t("compare.sameYear")}
                    </span>
                  )}
                </>
              )}
            </div>

            {!compareActive && (
              <TimeSlider
                value={year}
                onChange={setYear}
                min={minYear}
                max={maxYear}
                isPlaying={isPlaying}
                onPlayToggle={togglePlayback}
                onStepForward={stepForward}
                onStepBackward={stepBackward}
                onJumpToStart={jumpToStart}
                onJumpToEnd={jumpToEnd}
                isLoading={isLoading}
                showQuickJumps={true}
              />
            )}

            {/* Dynamic indicator notice */}
            {!isFeaturedIndicator && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t text-sm text-muted-foreground">
                <Search className="h-4 w-4" />
                <span>
                  {t.rich("dynamic.viewing", {
                    indicator: selectedText.name,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </span>
                {isLoading && (
                  <Badge variant="outline" className="ms-auto animate-pulse">
                    <Loader2 className="h-3 w-3 me-1 animate-spin" />
                    {t("dynamic.fetching")}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t("errors.loadTitle")}</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>{t("errors.loadDescription")}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="ms-4"
                >
                  <RefreshCw className="h-4 w-4 me-2" />
                  {t("errors.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Map Section */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Map */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe2 className="h-5 w-5" />
                    <CardTitle className="text-lg">
                      {mapTitle || t("map.fallbackTitle")}
                    </CardTitle>
                  </div>
                  {mapLoading && (
                    <Badge variant="outline" className="animate-pulse">
                      {t("map.loading")}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {mapDescription || t("map.fallbackDescription")}
                  <span className="block text-xs">{t("country.hint")}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[500px] relative p-0">
                {mapLoadFailed ? (
                  <Alert variant="destructive" className="m-4">
                    <AlertTitle>{t("errors.mapTitle")}</AlertTitle>
                    <AlertDescription>
                      {t("errors.mapDescription")}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="h-full w-full relative">
                    {/* Loading Overlay */}
                    {mapLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <div className="text-sm font-medium">
                            {isComparing
                              ? t("compare.loading", {
                                  start: compareStart,
                                  end: compareEnd,
                                })
                              : t("map.loadingIndicator", {
                                  indicator: selectedText.name,
                                })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {!isFeaturedIndicator && t("map.fetchingUpstream")}
                          </div>
                        </div>
                      </div>
                    )}
                    <MapGL
                      // Never evaluated on the server: react-map-gl only
                      // awaits mapLib inside an effect.
                      mapLib={
                        typeof window === "undefined"
                          ? undefined
                          : loadMapLibre()
                      }
                      initialViewState={{
                        longitude: 0,
                        latitude: 20,
                        zoom: 1.5,
                      }}
                      mapStyle={MAP_STYLE}
                      style={{ width: "100%", height: "100%" }}
                      interactiveLayerIds={["country-data"]}
                      onMouseMove={onHover}
                      onMouseLeave={() => setHoveredCountry(null)}
                      onClick={onClick}
                      cursor={hoveredCountry ? "pointer" : "grab"}
                      onLoad={onMapLoad}
                    >
                      {countryShapes && (
                        <Source
                          id="countries"
                          type="geojson"
                          data={countryShapes}
                        >
                          <Layer {...countryLayer} />
                          <Layer {...borderLayer} />
                        </Source>
                      )}

                      {/* Navigation Controls */}
                      <NavigationControl position="top-right" />

                      {/* Legend */}
                      <div className="absolute bottom-4 end-4 bg-background/95 backdrop-blur p-3 rounded-lg shadow-lg border">
                        <div className="text-xs font-medium mb-2">
                          {isComparing
                            ? t("compare.legendTitle", {
                                start: compareStart,
                                end: compareEnd,
                              })
                            : mapTitle || t("map.legendValue")}
                        </div>
                        <div className="flex items-center gap-1">
                          {legendColors.map((color, i) => (
                            <div
                              key={i}
                              className="w-6 h-4 first:rounded-s last:rounded-e"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>
                            {isComparing ? t("compare.decrease") : t("map.low")}
                          </span>
                          {isComparing && <span>{t("compare.noChange")}</span>}
                          <span>
                            {isComparing
                              ? t("compare.increase")
                              : t("map.high")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                          <div
                            className="w-4 h-3 rounded"
                            style={{ backgroundColor: NO_DATA_COLOR }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {t("map.noData")}
                          </span>
                        </div>
                      </div>

                      {/* Popup */}
                      {hoveredCountry && (
                        <Popup
                          longitude={hoveredCountry.longitude}
                          latitude={hoveredCountry.latitude}
                          closeButton={false}
                          closeOnClick={false}
                          anchor="bottom"
                          className="z-10"
                        >
                          <div className="px-1 py-0.5 min-w-[120px]">
                            <h3 className="font-semibold text-sm">
                              {hoveredCountry.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {mapTitle}
                            </p>
                            <p className="text-sm font-medium mt-1">
                              {hoveredCountry.formattedValue}
                            </p>
                          </div>
                        </Popup>
                      )}
                    </MapGL>

                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Countries Sidebar */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {isComparing && rankOrder === "decrease" ? (
                    <TrendingDown className="h-5 w-5" />
                  ) : (
                    <TrendingUp className="h-5 w-5" />
                  )}
                  <CardTitle className="text-lg">
                    {!isComparing
                      ? t("top.title")
                      : rankOrder === "increase"
                        ? t("top.titleIncrease")
                        : t("top.titleDecrease")}
                  </CardTitle>
                </div>
                <CardDescription>
                  {isComparing
                    ? t("top.changeDescription", {
                        start: compareStart,
                        end: compareEnd,
                      })
                    : t("top.description", { year })}
                </CardDescription>
                {isComparing && (
                  <div
                    className="flex flex-wrap gap-2 pt-2"
                    aria-label={t("top.sortLabel")}
                  >
                    <ToggleGroup
                      value={rankOrder}
                      onChange={setRankOrder}
                      options={[
                        { value: "increase", label: t("top.sortIncrease") },
                        { value: "decrease", label: t("top.sortDecrease") },
                      ]}
                    />
                    <ToggleGroup
                      value={rankMetric}
                      onChange={setRankMetric}
                      options={[
                        { value: "absolute", label: t("top.sortAbsolute") },
                        { value: "percent", label: t("top.sortPercent") },
                      ]}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : topEntries.length > 0 ? (
                  <div className="space-y-3">
                    {topEntries.map((entry, index) => (
                      <button
                        type="button"
                        key={entry.code}
                        onClick={() =>
                          setSelectedCountry({
                            code: entry.code,
                            name: entry.name,
                          })
                        }
                        aria-label={t("top.showHistory", {
                          country: entry.name,
                        })}
                        className="flex w-full items-center gap-3 p-2 rounded-lg text-start hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.detail}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("top.empty")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Dataset Information */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                <CardTitle className="text-lg">{t("dataset.title")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("dataset.source")}
                  </p>
                  <p className="text-sm">{worldData?.source || "World Bank"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("dataset.year")}
                  </p>
                  <p className="text-sm">{year}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("dataset.countries")}
                  </p>
                  <p className="text-sm">
                    {t("dataset.countriesWithData", {
                      count: worldData?.countries?.length ?? 0,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("dataset.unit")}
                  </p>
                  <p className="text-sm">{unitLabel || "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <CountryHistoryPanel
        country={selectedCountry}
        onClose={() => setSelectedCountry(null)}
        indicator={selectedIndicator.id}
        isDynamic={!isFeaturedIndicator}
        indicatorName={mapTitle || selectedText.name}
        unit={indicatorUnit}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Small controls
// ═══════════════════════════════════════════════════════════════

function CompareYearSelect({
  label,
  value,
  years,
  onChange,
}: {
  label: string;
  value: number;
  /** Selectable years, newest first */
  years: number[];
  onChange: (year: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-8 w-24" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={option.value === value ? "secondary" : "ghost"}
          className="h-7 px-2 text-xs"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
