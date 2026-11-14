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
import {
  Globe2,
  Database,
  TrendingUp,
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
} from "lucide-react";

// Custom Components
import { TimeSlider, SpeedControl } from "@/components/atomic/atoms/timeSlider";
import {
  IndicatorSearch,
  type SelectedIndicator,
} from "@/components/atomic/molecules/indicatorSearch";
import { PageHeader } from "@/components/atomic/molecules/investments";

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
} from "@/hooks/worldbank";
import { useTimePlayback } from "@/hooks/useTimePlayback";
import {
  useIsIndicatorFavorited,
  useToggleFavorite,
} from "@/hooks/convex";

// Types
import type { IndicatorId } from "@/lib/types/worldbank";
import { YEAR_RANGE, isIndicatorId } from "@/lib/types/worldbank";

// Auth
import { useUser } from "@clerk/nextjs";

// Utils
import {
  createMapColorExpression,
  getRecommendedColorScale,
  getColorPalette,
  isInvertedIndicator,
  NO_DATA_COLOR,
} from "@/lib/utils/mapColors";
import type { MapColorExpression } from "@/lib/utils/mapColors";

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

// Default indicator state (the name is the stored English one; the UI shows
// worldMap.indicators.gdp)
const DEFAULT_INDICATOR: SelectedIndicator = {
  id: "gdp",
  name: "GDP (Current US$)",
  description: "Gross Domestic Product at current prices",
  isDynamic: false,
  unit: "$",
};

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

  // Determine if we're using a dynamic (searched) or featured indicator
  const isFeaturedIndicator =
    !selectedIndicator.isDynamic && isIndicatorId(selectedIndicator.id);

  // Cache check for playback (only works for featured indicators)
  const isYearCached = useIsYearCached(
    isFeaturedIndicator ? (selectedIndicator.id as IndicatorId) : "gdp",
  );

  // Time playback - skip uncached years for smooth playback at high speeds
  const {
    year,
    setYear,
    isPlaying,
    toggle: togglePlayback,
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
  const featuredQuery = useWorldData(
    isFeaturedIndicator ? (selectedIndicator.id as IndicatorId) : "gdp",
    year,
  );
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
  const { isFavorited: isCurrentFavorited } =
    useIsIndicatorFavorited(selectedIndicator.id);
  const toggleFavorite = useToggleFavorite();


  const { data: indicatorsData } = useIndicatorsGrouped();

  // Top countries only works for featured indicators
  const { data: topCountries, isLoading: isLoadingTop } = useTopCountries(
    isFeaturedIndicator ? (selectedIndicator.id as IndicatorId) : "gdp",
    year,
    5,
    "desc",
  );

  // Prefetching (only for featured indicators)
  const prefetch = usePrefetchAdjacentYears(
    isFeaturedIndicator ? (selectedIndicator.id as IndicatorId) : "gdp",
    year,
    3,
  );

  // Background prefetch for all years (only for featured indicators)
  const {
    prefetchAll,
    progress: prefetchProgress,
    isPrefetching,
  } = usePrefetchAllYears(
    isFeaturedIndicator ? (selectedIndicator.id as IndicatorId) : "gdp",
    YEAR_RANGE.min,
    YEAR_RANGE.max,
  );

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

      // Use marker value for missing data, preserve actual null/0 values from API
      const hasData =
        countryData &&
        countryData.value !== null &&
        countryData.value !== undefined;

      return {
        ...feature,
        properties: {
          ...props,
          // Store the resolved country code for hover
          resolvedCode: countryCode,
          dataValue: hasData ? countryData.value : NO_DATA_MARKER,
          hasData: hasData,
          formattedValue: countryData?.formattedValue ?? "",
          countryName: countryData?.name ?? props.name ?? props.admin,
        },
      };
    });

    return processed;
  }, [geoJsonData, worldData]);

  // Color expression for map
  const colorExpression = useMemo((): MapColorExpression => {
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
  }, [worldData, selectedIndicator.id, isFeaturedIndicator]);

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
    const firstSymbolLayer = layers.find(
      (layer) => layer.type === "symbol",
    );

    if (firstSymbolLayer) {
      setFirstLabelLayerId(firstSymbolLayer.id);
    }
  }, []);

  // Value as shown in the UI: the API formats values in English, so a
  // missing value and the "years" unit are rendered here.
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
      return formattedValue;
    },
    [t, indicatorUnit],
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
          formattedValue: displayValue(props.dataValue, props.formattedValue),
          longitude,
          latitude,
        });
      } else {
        setHoveredCountry(null);
      }
    },
    [countryName, displayValue],
  );

  // The selected indicator's name and description in the UI language
  const selectedText = indicatorText(selectedIndicator);
  const mapTitle = isFeaturedIndicator
    ? selectedText.name
    : worldData?.indicator?.name;
  const mapDescription = isFeaturedIndicator
    ? selectedText.description
    : worldData?.indicator?.description;
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
        `"${country.name}"`,
        country.value?.toString() ?? "",
        year.toString(),
      ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    downloadCSV(csvContent, `world-data-${selectedIndicator.id}-${year}.csv`);
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
      const rows: string[][] = [];

      for (const { year: dataYear, countries } of allData) {
        for (const country of countries) {
          if (country.value !== null) {
            rows.push([
              country.code,
              country.code3,
              `"${country.name}"`,
              dataYear.toString(),
              country.value?.toString() ?? "",
            ]);
          }
        }
      }

      // Sort by country name, then by year
      rows.sort((a, b) => {
        const nameCompare = a[2].localeCompare(b[2]);
        if (nameCompare !== 0) return nameCompare;
        return parseInt(a[3]) - parseInt(b[3]);
      });

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.join(",")),
      ].join("\n");

      downloadCSV(
        csvContent,
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

  // Legend colors
  const legendColors = useMemo(() => {
    const scaleType = isFeaturedIndicator
      ? getRecommendedColorScale(selectedIndicator.id as IndicatorId)
      : "quantile";
    const inverted = isFeaturedIndicator
      ? isInvertedIndicator(selectedIndicator.id as IndicatorId)
      : false;
    return getColorPalette(scaleType, 5, inverted);
  }, [selectedIndicator.id, isFeaturedIndicator]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title={t("page.title")}
        subtitle={t("page.subtitle")}
      />

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
                {year}
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
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    {isExporting ? t("export.exporting") : t("export.button")}
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={exportCurrentYear}
                    disabled={!worldData || isLoading}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {t("export.currentYear", { year })}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportAllYears}
                    disabled={isExporting}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    {t("export.allYears", {
                      min: YEAR_RANGE.min,
                      max: YEAR_RANGE.max,
                    })}
                  </DropdownMenuItem>
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
              <SpeedControl speed={speed} onSpeedChange={setSpeed} />
            </div>
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
                    <Download className="h-3 w-3 mr-1" />
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
                  <Badge variant="outline" className="ml-auto animate-pulse">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
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
                  className="ml-4"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
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
                  <div className="flex items-center space-x-2">
                    <Globe2 className="h-5 w-5" />
                    <CardTitle className="text-lg">
                      {mapTitle || t("map.fallbackTitle")}
                    </CardTitle>
                  </div>
                  {isLoading && (
                    <Badge variant="outline" className="animate-pulse">
                      {t("map.loading")}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {mapDescription || t("map.fallbackDescription")}
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
                    {isLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <div className="text-sm font-medium">
                            {t("map.loadingIndicator", {
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
                      <div className="absolute bottom-4 right-4 bg-background/95 backdrop-blur p-3 rounded-lg shadow-lg border">
                        <div className="text-xs font-medium mb-2">
                          {mapTitle || t("map.legendValue")}
                        </div>
                        <div className="flex items-center gap-1">
                          {legendColors.map((color, i) => (
                            <div
                              key={i}
                              className="w-6 h-4 first:rounded-l last:rounded-r"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{t("map.low")}</span>
                          <span>{t("map.high")}</span>
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
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <CardTitle className="text-lg">{t("top.title")}</CardTitle>
                </div>
                <CardDescription>
                  {t("top.description", { year })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingTop ? (
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
                ) : topCountries && topCountries.length > 0 ? (
                  <div className="space-y-3">
                    {topCountries.map((country, index) => (
                      <div
                        key={country.code}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {countryName(country.code, country.name)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {displayValue(country.value, country.formattedValue)}
                          </p>
                        </div>
                      </div>
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
              <div className="flex items-center space-x-2">
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
    </div>
  );
}
