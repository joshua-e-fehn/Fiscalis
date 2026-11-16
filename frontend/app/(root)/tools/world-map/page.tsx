"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
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
  CheckCircle2,
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
  useWorldData,
  useDynamicWorldData,
  usePrefetchAdjacentYears,
  usePrefetchAllYears,
  useIsYearCached,
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
import type { IndicatorId } from "@/lib/types/worldbank";
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

// Utils
import {
  createDivergingMapColorExpression,
  createMapColorExpression,
  getRecommendedColorScale,
  getColorPalette,
  isInvertedIndicator,
  NO_DATA_COLOR,
} from "@/lib/utils/mapColors";
import type { MapColorExpression } from "@/lib/utils/mapColors";
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

// Use a marker value for "no data" since null doesn't serialize well in GeoJSON
const NO_DATA_MARKER = -999999999;

// Default indicator state: the stored (English) name and description come
// from the registry; the UI shows worldMap.indicators.gdp
const DEFAULT_INDICATOR: SelectedIndicator = {
  id: "gdp",
  name: INDICATOR_METADATA.gdp.name,
  description: INDICATOR_METADATA.gdp.description,
  isDynamic: false,
  unit: INDICATOR_METADATA.gdp.unit,
};

// Default years for "Compare years"
const DEFAULT_COMPARE = { start: 2000, end: 2020 } as const;

const YEARS_DESC = Array.from(
  { length: YEAR_RANGE.max - YEAR_RANGE.min + 1 },
  (_, i) => YEAR_RANGE.max - i,
);

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
  const [isExporting, setIsExporting] = useState(false);
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
  // "Compare years": the map shows the change between two years
  const [compareMode, setCompareMode] = useState(false);
  const [compareStart, setCompareStart] = useState<number>(
    DEFAULT_COMPARE.start,
  );
  const [compareEnd, setCompareEnd] = useState<number>(DEFAULT_COMPARE.end);
  const [rankOrder, setRankOrder] = useState<ChangeOrder>("increase");
  const [rankMetric, setRankMetric] = useState<ChangeMetric>("absolute");

  // Determine if we're using a dynamic (searched) or featured indicator
  const isFeaturedIndicator =
    !selectedIndicator.isDynamic && isIndicatorId(selectedIndicator.id);
  // Featured-only hooks need an IndicatorId; they are idle or unused otherwise
  const featuredId: IndicatorId = isFeaturedIndicator
    ? (selectedIndicator.id as IndicatorId)
    : "gdp";
  // Comparing needs a featured indicator and two different years
  // Compare mode only applies to featured indicators; a searched indicator
  // falls back to the single-year view (with its time slider).
  const compareActive = compareMode && isFeaturedIndicator;
  const isComparing = compareActive && compareStart !== compareEnd;

  // Cache check for playback (only works for featured indicators)
  const isYearCached = useIsYearCached(featuredId);

  // Time playback - skip uncached years for smooth playback at high speeds
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
    initialYear: 2020,
    minYear: YEAR_RANGE.min,
    maxYear: YEAR_RANGE.max,
    intervalMs: 500,
    isYearCached: isFeaturedIndicator ? isYearCached : () => false,
    skipUncachedYears: isFeaturedIndicator,
  });

  // Data fetching - use appropriate hook based on indicator type
  const featuredQuery = useWorldData(featuredId, year);
  const dynamicQuery = useDynamicWorldData(
    selectedIndicator.id,
    year,
    !isFeaturedIndicator,
  );

  // Unified data access
  const worldData = isFeaturedIndicator
    ? featuredQuery.data
    : dynamicQuery.data;
  const isLoading = isFeaturedIndicator
    ? featuredQuery.isLoading
    : dynamicQuery.isLoading;
  const error = isFeaturedIndicator ? featuredQuery.error : dynamicQuery.error;
  const refetch = isFeaturedIndicator
    ? featuredQuery.refetch
    : dynamicQuery.refetch;

  // Favorites
  const { isFavorited: isCurrentFavorited } = useIsIndicatorFavorited(
    selectedIndicator.id,
  );
  const toggleFavorite = useToggleFavorite();

  const { data: indicatorsData } = useIndicatorsGrouped();

  // Top countries only works for featured indicators
  const { data: topCountries, isLoading: isLoadingTop } = useTopCountries(
    featuredId,
    year,
    5,
    "desc",
  );

  // Change between the two compared years (featured indicators only)
  const delta = useWorldDataDelta(
    featuredId,
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
    for (const snapshot of [delta.startYearData, delta.endYearData]) {
      for (const c of snapshot?.countries ?? []) {
        names.set(c.code, { name: c.name, code3: c.code3 });
      }
    }
    return names;
  }, [delta.startYearData, delta.endYearData]);

  // Prefetching (only for featured indicators)
  const prefetch = usePrefetchAdjacentYears(featuredId, year, 3);

  // Background prefetch for all years (only for featured indicators)
  const {
    prefetchAll,
    progress: prefetchProgress,
    isPrefetching,
  } = usePrefetchAllYears(featuredId, YEAR_RANGE.min, YEAR_RANGE.max);

  // Auto-prefetch all years when indicator changes (start in background)
  useEffect(() => {
    if (!isFeaturedIndicator) return; // Skip prefetch for dynamic indicators
    // Start prefetching after a short delay to prioritize current year
    const timer = setTimeout(() => {
      prefetchAll();
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedIndicator.id, isFeaturedIndicator, prefetchAll]);

  // Prefetch adjacent years when year changes
  useEffect(() => {
    if (!isPlaying && isFeaturedIndicator) {
      prefetch.prefetchRange();
    }
  }, [year, selectedIndicator.id, isPlaying, prefetch, isFeaturedIndicator]);

  // Prefetch decades when indicator changes (only for featured indicators)
  useEffect(() => {
    if (isFeaturedIndicator) {
      prefetch.prefetchDecades();
    }
  }, [selectedIndicator.id, isFeaturedIndicator, prefetch]);

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

  // Process GeoJSON with current data
  const processedGeoJson = useMemo(() => {
    if (!geoJsonData || !worldData) return null;

    const countryMap = new Map(worldData.countries.map((c) => [c.code, c]));

    const processed: CountryFeatureCollection = JSON.parse(
      JSON.stringify(geoJsonData),
    );

    processed.features = processed.features.map((feature) => {
      const props = feature.properties;

      // Get country code with fallbacks:
      // 1. iso_a2 (standard)
      // 2. iso_a2_eh (extended, used for France, Norway, Kosovo)
      // 3. wb_a2 (World Bank specific code)
      // Skip -99 placeholder values
      let countryCode = props.iso_a2;
      if (!countryCode || countryCode === "-99") {
        countryCode = props.iso_a2_eh;
      }
      if (!countryCode || countryCode === "-99") {
        countryCode = props.wb_a2;
      }

      // Handle special cases
      // Taiwan uses CN-TW in GeoJSON but TW in some datasets
      if (countryCode === "CN-TW") {
        countryCode = "TW";
      }

      const countryData =
        countryCode === undefined ? undefined : countryMap.get(countryCode);

      // Use marker value for missing data, preserve actual null/0 values from API.
      // Comparing, the value is the change; missing in either year is no data.
      const change =
        isComparing && countryCode !== undefined
          ? deltaByCode.get(countryCode)?.absolute
          : undefined;
      const value = isComparing ? change : countryData?.value;
      const hasData = value !== null && value !== undefined;

      return {
        ...feature,
        properties: {
          ...props,
          // Store the resolved country code for hover
          resolvedCode: countryCode,
          dataValue: hasData ? value : NO_DATA_MARKER,
          hasData: hasData,
          formattedValue: countryData?.formattedValue ?? "",
          countryName: countryData?.name ?? props.name ?? props.admin,
        },
      };
    });

    return processed;
  }, [geoJsonData, worldData, isComparing, deltaByCode]);

  // Color expression for map
  const colorExpression = useMemo((): MapColorExpression => {
    if (isComparing) {
      const changes = (delta.data ?? [])
        .filter((d) => isCountryCode(d.code))
        .map((d) => d.absolute);
      return createDivergingMapColorExpression(
        divergingStops(changes),
        isInvertedIndicator(featuredId),
      );
    }
    if (!worldData) return ["literal", NO_DATA_COLOR];

    const values = worldData.countries
      .map((c) => c.value)
      .filter((v): v is number => v !== null);

    const scaleType = isFeaturedIndicator
      ? getRecommendedColorScale(selectedIndicator.id as IndicatorId)
      : "quantile"; // Default to quantile for dynamic indicators
    const inverted = isFeaturedIndicator
      ? isInvertedIndicator(selectedIndicator.id as IndicatorId)
      : false; // Default to non-inverted for dynamic indicators
    return createMapColorExpression(values, scaleType, inverted);
  }, [
    worldData,
    selectedIndicator.id,
    isFeaturedIndicator,
    isComparing,
    delta.data,
    featuredId,
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
        const code: string = props.resolvedCode || props.iso_a2;
        const englishName: string =
          props.countryName || props.name || props.admin || code;

        setHoveredCountry({
          name: countryName(code, englishName),
          code,
          value: props.dataValue,
          formattedValue: isComparing
            ? displayChange(deltaByCode.get(code))
            : displayValue(props.dataValue, props.formattedValue),
          longitude,
          latitude,
        });
      } else {
        setHoveredCountry(null);
      }
    },
    [countryName, displayValue, displayChange, isComparing, deltaByCode],
  );

  // Click handler: open the country's history
  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const props = event.features?.[0]?.properties;
      const code: string | undefined = props?.resolvedCode || props?.iso_a2;
      if (!props || !code || code === "-99") return;
      const englishName: string =
        props.countryName || props.name || props.admin || code;
      setSelectedCountry({ code, name: countryName(code, englishName) });
    },
    [countryName],
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
  const mapLoading = isLoading || delta.isLoading;
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

  // Export all years to CSV
  const exportAllYears = useCallback(async () => {
    setIsExporting(true);

    try {
      // Get indicator name and unit from either featured or dynamic data
      const indicatorName = indicatorText(selectedIndicator).name;
      let indicatorUnit = selectedIndicator.unit || "";

      if (isFeaturedIndicator && indicatorsData?.grouped) {
        const allIndicators = Object.values(indicatorsData.grouped).flat();
        const indicator = allIndicators.find(
          (i) => i.id === selectedIndicator.id,
        );
        if (indicator) {
          indicatorUnit = indicator.unit;
        }
      }
      if (indicatorUnit === "years") indicatorUnit = t("units.years");

      // Fetch all years in parallel (in batches to avoid overwhelming the server)
      const years = Array.from(
        { length: YEAR_RANGE.max - YEAR_RANGE.min + 1 },
        (_, i) => YEAR_RANGE.min + i,
      );

      // Use batch size of 10 to be gentle on the API
      const batchSize = 10;
      const allData: Array<{
        year: number;
        countries: NonNullable<typeof worldData>["countries"];
      }> = [];

      // Use appropriate endpoint for featured vs dynamic indicators
      const endpoint = isFeaturedIndicator
        ? `/api/world-data/${selectedIndicator.id}`
        : `/api/world-data/dynamic/${selectedIndicator.id}`;

      for (let i = 0; i < years.length; i += batchSize) {
        const batch = years.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (y) => {
            try {
              const response = await fetch(`${endpoint}?year=${y}`);
              if (!response.ok) return null;
              const data = await response.json();
              return { year: y, countries: data.countries };
            } catch {
              return null;
            }
          }),
        );

        // Filter out failed requests
        allData.push(
          ...batchResults.filter((r): r is NonNullable<typeof r> => r !== null),
        );
      }

      // Build CSV with all years
      const headers = [
        t("csv.countryCode"),
        t("csv.countryCodeIso3"),
        t("csv.countryName"),
        t("csv.year"),
        t("csv.value", { indicator: indicatorName, unit: indicatorUnit }),
      ];

      // Collect all unique countries and create rows for each year
      const rows: Array<[string, string, string, number, number]> = [];

      for (const { year: dataYear, countries } of allData) {
        for (const country of countries) {
          if (country.value !== null) {
            rows.push([
              country.code,
              country.code3,
              country.name,
              dataYear,
              country.value,
            ]);
          }
        }
      }

      // Sort by country name, then by year
      rows.sort((a, b) => a[2].localeCompare(b[2]) || a[3] - b[3]);

      downloadCSV(
        toCsv(headers, rows),
        `world-data-${selectedIndicator.id}-all-years.csv`,
      );
    } catch (error) {
      console.error("Failed to export all years:", error);
    } finally {
      setIsExporting(false);
    }
  }, [
    selectedIndicator,
    indicatorsData,
    downloadCSV,
    isFeaturedIndicator,
    indicatorText,
    t,
  ]);

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
    : (topCountries ?? []).map((c) => ({
        code: c.code,
        name: countryName(c.code, c.name),
        detail: displayValue(c.value, c.formattedValue),
      }));

  // Legend colors
  const legendColors = useMemo(() => {
    if (isComparing) {
      return getColorPalette("diverging", 5, isInvertedIndicator(featuredId));
    }
    const scaleType = isFeaturedIndicator
      ? getRecommendedColorScale(selectedIndicator.id as IndicatorId)
      : "quantile";
    const inverted = isFeaturedIndicator
      ? isInvertedIndicator(selectedIndicator.id as IndicatorId)
      : false;
    return getColorPalette(scaleType, 5, inverted);
  }, [selectedIndicator.id, isFeaturedIndicator, isComparing, featuredId]);

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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(!worldData && !indicatorsData) || isExporting}
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 me-2" />
                    )}
                    {isExporting ? t("export.exporting") : t("export.button")}
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
                    disabled={isExporting}
                  >
                    <FileSpreadsheet className="h-4 w-4 me-2" />
                    {t("export.allYears", {
                      min: YEAR_RANGE.min,
                      max: YEAR_RANGE.max,
                    })}
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
                  disabled={!isFeaturedIndicator}
                />
                <Label htmlFor="compare-years">{t("compare.toggle")}</Label>
              </div>
              {!isFeaturedIndicator && (
                <span className="text-xs text-muted-foreground">
                  {t("compare.featuredOnly")}
                </span>
              )}
              {compareActive && (
                <>
                  <CompareYearSelect
                    label={t("compare.from")}
                    value={compareStart}
                    onChange={setCompareStart}
                  />
                  <CompareYearSelect
                    label={t("compare.to")}
                    value={compareEnd}
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
                onChangeCommitted={(y) => prefetch.prefetchYear(y)}
                min={YEAR_RANGE.min}
                max={YEAR_RANGE.max}
                isPlaying={isPlaying}
                onPlayToggle={togglePlayback}
                onStepForward={stepForward}
                onStepBackward={stepBackward}
                onJumpToStart={jumpToStart}
                onJumpToEnd={jumpToEnd}
                isLoading={
                  isLoading && (!isFeaturedIndicator || !isYearCached(year))
                }
                showQuickJumps={true}
              />
            )}

            {/* Prefetch Progress - only show for featured indicators */}
            {isFeaturedIndicator && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {isPrefetching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        {t("prefetch.loading", {
                          loaded: prefetchProgress.loaded,
                          total: prefetchProgress.total,
                        })}
                      </span>
                    </>
                  ) : prefetchProgress.isComplete ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t("prefetch.complete")}</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>
                        {t("prefetch.partial", {
                          loaded: prefetchProgress.loaded,
                          total: prefetchProgress.total,
                        })}
                      </span>
                    </>
                  )}
                </div>
                {!prefetchProgress.isComplete && !isPrefetching && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prefetchAll}
                    className="text-xs"
                  >
                    <Download className="h-3 w-3 me-1" />
                    {t("prefetch.loadAll")}
                  </Button>
                )}
                {/* Progress bar */}
                <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${(prefetchProgress.loaded / prefetchProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
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
                      {processedGeoJson && (
                        <Source
                          id="countries"
                          type="geojson"
                          data={processedGeoJson}
                        >
                          <Layer
                            key={`layer-fill-${selectedIndicator}`}
                            {...countryLayer}
                          />
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

                    {/* Loading Overlay */}
                    {isLoading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                          <span className="text-sm text-muted-foreground">
                            {t("map.loadingYear", { year })}
                          </span>
                        </div>
                      </div>
                    )}
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
                {(isComparing ? delta.isLoading : isLoadingTop) ? (
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
  onChange,
}: {
  label: string;
  value: number;
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
          {YEARS_DESC.map((y) => (
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
