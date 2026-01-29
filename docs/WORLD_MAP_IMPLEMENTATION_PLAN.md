# World Map + World Bank API Implementation Plan

## Overview

This document outlines the implementation plan for integrating the World Bank API into Fiscalis to replace mock data on the world map page with real historical economic data from 1960 to present.

### Current Status

- ✅ World map page exists with MapLibre GL rendering
- ✅ GeoJSON file with country boundaries (`public/data/custom.geo.json`)
- ✅ Mock data infrastructure in place
- ✅ Phase 1: API Integration Layer (Completed 2026-01-29)
- ✅ Phase 2: Data Hooks (Completed 2026-01-29)
- ✅ Phase 3: Time Slider Component (Completed 2026-01-29)
- ✅ Phase 4: Update World Map Page (Completed 2026-01-29)
- ⏳ Phase 5: Enhanced Visualizations (Optional)

### Architecture Alignment

Following the established Fiscalis architecture:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         WORLD MAP DATA ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   World Bank API (External)              Hono API Route (Cached Proxy)          │
│   ─────────────────────────              ──────────────────────────────         │
│   • Free, no API key required            • /api/world-data/:indicator           │
│   • Historical data (1960-2024)          • In-memory cache (24h TTL)            │
│   • 200+ countries, 16k indicators       • Rate limit protection                │
│                                                                                  │
│   Accessed via:                          Client-side:                           │
│   • Hono route → fetch → cache           • React Query hooks                    │
│   • Returns normalized data              • Automatic stale-while-revalidate     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

This follows the same pattern as the existing **Metals API** (Hono + React Query for time-series data).

---

## Phase 1: API Integration Layer

### Task 1.1: Create World Bank Types

**File:** `lib/types/worldbank.ts`

```typescript
// World Bank indicator codes
export const WORLDBANK_INDICATORS = {
  // Economy
  gdp: "NY.GDP.MKTP.CD",
  gdpPerCapita: "NY.GDP.PCAP.CD",
  gdpGrowth: "NY.GDP.MKTP.KD.ZG",
  gni: "NY.GNP.MKTP.CD",

  // Demographics
  population: "SP.POP.TOTL",
  populationGrowth: "SP.POP.GROW",
  urbanPopulation: "SP.URB.TOTL.IN.ZS",
  lifeExpectancy: "SP.DYN.LE00.IN",

  // Finance
  inflation: "FP.CPI.TOTL.ZG",
  interestRate: "FR.INR.RINR",
  debtToGdp: "GC.DOD.TOTL.GD.ZS",

  // Trade
  exports: "NE.EXP.GNFS.CD",
  imports: "NE.IMP.GNFS.CD",
  tradeBalance: "NE.RSB.GNFS.CD",
  fdi: "BX.KLT.DINV.CD.WD",

  // Energy & Environment
  co2PerCapita: "EN.ATM.CO2E.PC",
  renewableEnergy: "EG.FEC.RNEW.ZS",
  electricityAccess: "EG.ELC.ACCS.ZS",

  // Development
  povertyRate: "SI.POV.DDAY",
  unemployment: "SL.UEM.TOTL.ZS",
  literacy: "SE.ADT.LITR.ZS",
} as const;

export type IndicatorId = keyof typeof WORLDBANK_INDICATORS;

// Indicator metadata for UI display
export interface IndicatorMetadata {
  id: IndicatorId;
  name: string;
  description: string;
  unit: string;
  category:
    | "economy"
    | "demographics"
    | "finance"
    | "trade"
    | "energy"
    | "development";
  formatFn: (value: number) => string;
}

// World Bank API response types
export interface WorldBankApiResponse {
  page: number;
  pages: number;
  per_page: number;
  total: number;
  sourceid: string;
  lastupdated: string;
}

export interface WorldBankDataPoint {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  unit: string;
  obs_status: string;
  decimal: number;
}

// Normalized output types
export interface CountryDataPoint {
  code: string; // ISO 2-letter code (matches GeoJSON)
  code3: string; // ISO 3-letter code
  name: string;
  value: number | null;
  formattedValue: string;
}

export interface IndicatorData {
  indicator: IndicatorMetadata;
  year: number;
  lastUpdated: string;
  source: "World Bank";
  countries: CountryDataPoint[];
}

// Available year range
export const YEAR_RANGE = {
  min: 1960,
  max: 2024,
} as const;
```

**Checklist:**

- [ ] Create `lib/types/worldbank.ts`
- [ ] Define all indicator codes
- [ ] Add indicator metadata with formatting functions
- [ ] Export types for API responses

---

### Task 1.2: Create World Bank API Client

**File:** `lib/api/worldbank.ts`

```typescript
import {
  WORLDBANK_INDICATORS,
  type IndicatorId,
  type WorldBankDataPoint,
  type CountryDataPoint,
  type IndicatorMetadata,
} from "@/lib/types/worldbank";

const WORLDBANK_BASE_URL = "https://api.worldbank.org/v2";

// Indicator metadata registry
export const INDICATOR_METADATA: Record<IndicatorId, IndicatorMetadata> = {
  gdp: {
    id: "gdp",
    name: "GDP (Current US$)",
    description: "Gross Domestic Product at current prices",
    unit: "$",
    category: "economy",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  gdpPerCapita: {
    id: "gdpPerCapita",
    name: "GDP per Capita",
    description: "GDP divided by population",
    unit: "$",
    category: "economy",
    formatFn: (v) =>
      `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  },
  population: {
    id: "population",
    name: "Population",
    description: "Total population count",
    unit: "",
    category: "demographics",
    formatFn: (v) => formatLargeNumber(v, ""),
  },
  inflation: {
    id: "inflation",
    name: "Inflation Rate",
    description: "Annual consumer price inflation",
    unit: "%",
    category: "finance",
    formatFn: (v) => `${v.toFixed(1)}%`,
  },
  // ... add all indicators
};

// Helper to format large numbers
function formatLargeNumber(value: number, prefix: string): string {
  if (value >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${prefix}${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${prefix}${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${prefix}${(value / 1e3).toFixed(2)}K`;
  return `${prefix}${value.toFixed(0)}`;
}

// ISO3 to ISO2 mapping (World Bank uses ISO3, GeoJSON uses ISO2)
const ISO3_TO_ISO2: Record<string, string> = {
  USA: "US",
  CHN: "CN",
  JPN: "JP",
  DEU: "DE",
  GBR: "GB",
  FRA: "FR",
  IND: "IN",
  ITA: "IT",
  BRA: "BR",
  CAN: "CA",
  // ... complete mapping (can be generated from GeoJSON)
};

/**
 * Fetch indicator data from World Bank API
 */
export async function fetchWorldBankIndicator(
  indicator: IndicatorId,
  year: number,
): Promise<CountryDataPoint[]> {
  const indicatorCode = WORLDBANK_INDICATORS[indicator];
  const url = `${WORLDBANK_BASE_URL}/country/all/indicator/${indicatorCode}?format=json&date=${year}&per_page=300`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`World Bank API error: ${response.status}`);
  }

  const data = await response.json();

  // World Bank returns [metadata, data[]] or [metadata, null]
  if (!data[1]) {
    return [];
  }

  const metadata = INDICATOR_METADATA[indicator];

  return (data[1] as WorldBankDataPoint[])
    .filter((d) => d.value !== null)
    .map((d) => ({
      code: ISO3_TO_ISO2[d.countryiso3code] || d.country.id,
      code3: d.countryiso3code,
      name: d.country.value,
      value: d.value,
      formattedValue: d.value !== null ? metadata.formatFn(d.value) : "N/A",
    }));
}

/**
 * Client-side fetch function (calls our API route)
 */
export async function getWorldData(
  indicator: IndicatorId,
  year: number,
): Promise<IndicatorData> {
  const response = await fetch(`/api/world-data/${indicator}?year=${year}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch world data: ${response.status}`);
  }
  return response.json();
}
```

**Checklist:**

- [ ] Create `lib/api/worldbank.ts`
- [ ] Implement `fetchWorldBankIndicator()` server-side function
- [ ] Create ISO3 → ISO2 mapping (extract from GeoJSON)
- [ ] Implement formatting functions for each indicator type
- [ ] Create `getWorldData()` client-side function

---

### Task 1.3: Create Hono API Route with Caching

**File:** `app/(api)/api/[[...route]]/worlddata.ts`

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  fetchWorldBankIndicator,
  INDICATOR_METADATA,
} from "@/lib/api/worldbank";
import {
  WORLDBANK_INDICATORS,
  YEAR_RANGE,
  type IndicatorId,
  type IndicatorData,
} from "@/lib/types/worldbank";

const worlddata = new Hono();

// In-memory cache with TTL
interface CacheEntry {
  data: IndicatorData;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (data is historical)

function getCacheKey(indicator: string, year: number): string {
  return `${indicator}:${year}`;
}

function getFromCache(key: string): IndicatorData | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: IndicatorData): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// Validation schemas
const indicatorParam = z.enum(
  Object.keys(WORLDBANK_INDICATORS) as [IndicatorId, ...IndicatorId[]],
);
const yearQuery = z.coerce.number().min(YEAR_RANGE.min).max(YEAR_RANGE.max);

/**
 * GET /api/world-data/:indicator
 * Query params: ?year=2020
 */
worlddata.get(
  "/:indicator",
  zValidator("param", z.object({ indicator: indicatorParam })),
  zValidator("query", z.object({ year: yearQuery })),
  async (c) => {
    const { indicator } = c.req.valid("param");
    const { year } = c.req.valid("query");

    const cacheKey = getCacheKey(indicator, year);

    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    try {
      const countries = await fetchWorldBankIndicator(indicator, year);
      const metadata = INDICATOR_METADATA[indicator];

      const result: IndicatorData = {
        indicator: metadata,
        year,
        lastUpdated: new Date().toISOString(),
        source: "World Bank",
        countries,
      };

      // Cache the result
      setCache(cacheKey, result);

      return c.json(result);
    } catch (error) {
      console.error("World Bank API error:", error);
      return c.json({ error: "Failed to fetch data from World Bank" }, 500);
    }
  },
);

/**
 * GET /api/world-data/indicators
 * Returns list of available indicators with metadata
 */
worlddata.get("/indicators", (c) => {
  const indicators = Object.entries(INDICATOR_METADATA).map(([id, meta]) => ({
    id,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    unit: meta.unit,
  }));

  return c.json({ indicators });
});

export default worlddata;
```

**Update:** `app/(api)/api/[[...route]]/route.ts`

```typescript
import { Hono } from "hono";
import { handle } from "hono/vercel";
import metals from "./metals";
import worlddata from "./worlddata"; // Add this

export const runtime = "edge";

const app = new Hono().basePath("/api");

const routes = app.route("/metals", metals).route("/world-data", worlddata); // Add this

export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
```

**Checklist:**

- [ ] Create `app/(api)/api/[[...route]]/worlddata.ts`
- [ ] Implement in-memory cache with 24h TTL
- [ ] Add Zod validation for indicator and year params
- [ ] Create `/indicators` endpoint for UI dropdown
- [ ] Update `route.ts` to include worlddata routes
- [ ] Test API endpoints manually

---

## Phase 2: Data Hooks

### Task 2.1: Create World Bank React Query Hooks

**File:** `hooks/worldbank.ts`

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorldData } from "@/lib/api/worldbank";
import type {
  IndicatorId,
  IndicatorData,
  IndicatorMetadata,
} from "@/lib/types/worldbank";

/**
 * Fetch world data for a specific indicator and year
 */
export function useWorldData(indicator: IndicatorId, year: number) {
  return useQuery<IndicatorData>({
    queryKey: ["world-data", indicator, year],
    queryFn: () => getWorldData(indicator, year),
    staleTime: 60 * 60 * 1000, // 1 hour (data rarely changes)
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24h
  });
}

/**
 * Prefetch adjacent years for smooth slider experience
 */
export function usePrefetchAdjacentYears(indicator: IndicatorId, year: number) {
  const queryClient = useQueryClient();

  const prefetch = (targetYear: number) => {
    queryClient.prefetchQuery({
      queryKey: ["world-data", indicator, targetYear],
      queryFn: () => getWorldData(indicator, targetYear),
      staleTime: 60 * 60 * 1000,
    });
  };

  // Prefetch ±5 years
  return {
    prefetchYear: prefetch,
    prefetchRange: () => {
      for (let i = -5; i <= 5; i++) {
        if (i !== 0) prefetch(year + i);
      }
    },
  };
}

/**
 * Fetch list of available indicators
 */
export function useIndicators() {
  return useQuery<{ indicators: IndicatorMetadata[] }>({
    queryKey: ["world-data", "indicators"],
    queryFn: async () => {
      const response = await fetch("/api/world-data/indicators");
      return response.json();
    },
    staleTime: Infinity, // Never changes
  });
}

/**
 * Get data for multiple years (for comparison view)
 */
export function useWorldDataComparison(
  indicator: IndicatorId,
  years: number[],
) {
  const queries = years.map((year) => ({
    queryKey: ["world-data", indicator, year],
    queryFn: () => getWorldData(indicator, year),
    staleTime: 60 * 60 * 1000,
  }));

  // Use useQueries for parallel fetching
  // Note: Requires TanStack Query v5
  return useQuery({
    queryKey: ["world-data", "comparison", indicator, years.join("-")],
    queryFn: async () => {
      const results = await Promise.all(
        years.map((year) => getWorldData(indicator, year)),
      );
      return results;
    },
  });
}
```

**Checklist:**

- [ ] Create `hooks/worldbank.ts`
- [ ] Implement `useWorldData()` hook
- [ ] Add `usePrefetchAdjacentYears()` for smooth scrubbing
- [ ] Add `useIndicators()` for dropdown population
- [ ] Add `useWorldDataComparison()` for multi-year view

---

## Phase 3: Time Slider Component

### Task 3.1: Create Time Slider Atom

**File:** `components/atomic/atoms/timeSlider.tsx`

```tsx
"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { Slider } from "@/components/ui/shadcn/slider";
import { Button } from "@/components/ui/shadcn/button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { YEAR_RANGE } from "@/lib/types/worldbank";

interface TimeSliderProps {
  value: number;
  onChange: (year: number) => void;
  onChangeCommitted?: (year: number) => void;
  min?: number;
  max?: number;
  decadeMarkers?: number[];
  isPlaying?: boolean;
  onPlayToggle?: () => void;
  className?: string;
}

export function TimeSlider({
  value,
  onChange,
  onChangeCommitted,
  min = YEAR_RANGE.min,
  max = YEAR_RANGE.max,
  decadeMarkers = [1970, 1980, 1990, 2000, 2010, 2020],
  isPlaying = false,
  onPlayToggle,
  className,
}: TimeSliderProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Main slider row */}
      <div className="flex items-center gap-4">
        {/* Play controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange(Math.max(min, value - 10))}
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onPlayToggle}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange(Math.min(max, value + 10))}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Year display */}
        <span className="text-lg font-bold tabular-nums w-16">{value}</span>

        {/* Slider */}
        <div className="flex-1 relative">
          <Slider
            value={[value]}
            min={min}
            max={max}
            step={1}
            onValueChange={([v]) => onChange(v)}
            onValueCommit={([v]) => onChangeCommitted?.(v)}
            className="w-full"
          />

          {/* Decade markers */}
          <div className="absolute -bottom-5 w-full flex justify-between px-2 text-xs text-muted-foreground">
            <span>{min}</span>
            {decadeMarkers.map((year) => (
              <span key={year}>{year}</span>
            ))}
            <span>{max}</span>
          </div>
        </div>
      </div>

      {/* Quick jump buttons */}
      <div className="flex gap-2 justify-center mt-4">
        {decadeMarkers.map((year) => (
          <Button
            key={year}
            variant={value === year ? "default" : "outline"}
            size="sm"
            onClick={() => {
              onChange(year);
              onChangeCommitted?.(year);
            }}
          >
            {year}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

**Checklist:**

- [ ] Create `components/atomic/atoms/timeSlider.tsx`
- [ ] Add play/pause animation controls
- [ ] Add decade quick-jump buttons
- [ ] Implement debounced onChange for API efficiency
- [ ] Style with Tailwind to match app theme

---

### Task 3.2: Create Playback Hook

**File:** `hooks/useTimePlayback.ts`

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { YEAR_RANGE } from "@/lib/types/worldbank";

interface UseTimePlaybackOptions {
  initialYear?: number;
  minYear?: number;
  maxYear?: number;
  intervalMs?: number;
  onYearChange?: (year: number) => void;
}

export function useTimePlayback({
  initialYear = 2020,
  minYear = YEAR_RANGE.min,
  maxYear = YEAR_RANGE.max,
  intervalMs = 500,
  onYearChange,
}: UseTimePlaybackOptions = {}) {
  const [year, setYear] = useState(initialYear);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const setYearAndNotify = useCallback(
    (newYear: number) => {
      setYear(newYear);
      onYearChange?.(newYear);
    },
    [onYearChange],
  );

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setYearAndNotify(minYear);
  }, [minYear, setYearAndNotify]);

  // Animation loop
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setYear((prev) => {
          const next = prev + 1;
          if (next > maxYear) {
            setIsPlaying(false);
            return minYear; // Loop back to start
          }
          onYearChange?.(next);
          return next;
        });
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, maxYear, minYear, intervalMs, onYearChange]);

  return {
    year,
    setYear: setYearAndNotify,
    isPlaying,
    play,
    pause,
    toggle,
    reset,
  };
}
```

**Checklist:**

- [ ] Create `hooks/useTimePlayback.ts`
- [ ] Implement play/pause/reset controls
- [ ] Add loop-back behavior
- [ ] Configurable playback speed

---

## Phase 4: Update World Map Page

### Task 4.1: Refactor World Map Page

**File:** `app/(root)/world-map/page.tsx`

This is a major refactor. Key changes:

1. Replace mock `useWorldData` hook with real `useWorldData` from `hooks/worldbank.ts`
2. Add `TimeSlider` component
3. Add indicator category dropdown
4. Improve color scaling (gradient instead of binary)
5. Add loading/error states
6. Preserve existing map rendering logic

**Key code changes:**

```tsx
// Replace mock data hook
import {
  useWorldData,
  usePrefetchAdjacentYears,
  useIndicators,
} from "@/hooks/worldbank";
import { useTimePlayback } from "@/hooks/useTimePlayback";
import { TimeSlider } from "@/components/atomic/atoms/timeSlider";
import type { IndicatorId } from "@/lib/types/worldbank";

export default function WorldMapPage() {
  const [selectedIndicator, setSelectedIndicator] =
    useState<IndicatorId>("gdp");

  const {
    year,
    setYear,
    isPlaying,
    toggle: togglePlayback,
  } = useTimePlayback({
    initialYear: 2020,
    onYearChange: (y) => prefetch.prefetchYear(y),
  });

  const { data, isLoading, error } = useWorldData(selectedIndicator, year);
  const prefetch = usePrefetchAdjacentYears(selectedIndicator, year);
  const { data: indicatorsData } = useIndicators();

  // ... rest of component
}
```

**Checklist:**

- [ ] Import real hooks instead of mock
- [ ] Add `useTimePlayback` for animation
- [ ] Replace mock dropdown with real indicator selector
- [ ] Add `TimeSlider` component below map
- [ ] Update color scale logic for gradient (quintiles or continuous)
- [ ] Add prefetching on hover/scrub
- [ ] Update tooltip to show formatted values
- [ ] Add "Top 5" countries summary bar
- [ ] Handle loading skeleton properly
- [ ] Handle error states with retry button

---

### Task 4.2: Improve Color Scale

**File:** `lib/utils/mapColors.ts` (new)

```typescript
import { scaleQuantile, scaleSequential } from "d3-scale";
import { interpolateBlues, interpolateRdYlGn } from "d3-scale-chromatic";

export type ColorScaleType = "sequential" | "diverging" | "quantile";

export function createColorScale(
  values: number[],
  type: ColorScaleType = "quantile",
) {
  const validValues = values.filter((v) => v != null && !isNaN(v));

  if (validValues.length === 0) {
    return () => "#e5e7eb"; // Gray for no data
  }

  switch (type) {
    case "sequential":
      return scaleSequential(interpolateBlues).domain([
        Math.min(...validValues),
        Math.max(...validValues),
      ]);

    case "diverging":
      const median = validValues.sort((a, b) => a - b)[
        Math.floor(validValues.length / 2)
      ];
      return scaleSequential(interpolateRdYlGn).domain([
        Math.min(...validValues),
        median,
        Math.max(...validValues),
      ]);

    case "quantile":
    default:
      return scaleQuantile<string>().domain(validValues).range([
        "#eff6ff", // Lightest blue
        "#bfdbfe",
        "#60a5fa",
        "#2563eb",
        "#1e40af", // Darkest blue
      ]);
  }
}

export function getNoDataColor(): string {
  return "#f3f4f6"; // Gray-100
}
```

**Checklist:**

- [ ] Create `lib/utils/mapColors.ts`
- [ ] Implement quantile color scale (default)
- [ ] Add sequential scale option
- [ ] Add diverging scale for growth rates
- [ ] Handle "no data" countries with gray

---

## Phase 5: Enhanced Visualizations (Optional)

### Task 5.1: Country Details Modal

**File:** `components/atomic/molecules/countryDetailsModal.tsx`

- Click on country → open modal
- Show sparkline chart of indicator over time (1960-present)
- Show all indicators for that country
- Compare with regional average

### Task 5.2: Top Countries Bar

**File:** `components/atomic/atoms/topCountriesBar.tsx`

- Horizontal bar at bottom of map
- Shows Top 5 countries for selected indicator
- Click to zoom/highlight on map

### Task 5.3: Comparison View

- Select 2 years → show side-by-side or delta map
- Highlight biggest gainers/losers

---

## File Checklist Summary

### New Files to Create

```
lib/
├── types/
│   └── worldbank.ts              # Types & indicator definitions
├── api/
│   └── worldbank.ts              # API client & fetch functions
└── utils/
    └── mapColors.ts              # Color scale utilities

hooks/
├── worldbank.ts                  # React Query hooks
└── useTimePlayback.ts            # Animation playback hook

components/atomic/
├── atoms/
│   ├── timeSlider.tsx            # Year slider with controls
│   └── topCountriesBar.tsx       # Top 5 display (optional)
└── molecules/
    └── countryDetailsModal.tsx   # Country deep dive (optional)

app/(api)/api/[[...route]]/
└── worlddata.ts                  # Hono route with caching
```

### Files to Update

```
app/(api)/api/[[...route]]/route.ts   # Add worlddata route
app/(root)/world-map/page.tsx         # Major refactor
```

---

## Timeline Estimate

| Phase | Description              | Estimated Time       |
| ----- | ------------------------ | -------------------- |
| 1.1   | Types & Definitions      | 1 hour               |
| 1.2   | API Client               | 2 hours              |
| 1.3   | Hono Route + Cache       | 2 hours              |
| 2.1   | React Query Hooks        | 1 hour               |
| 3.1   | Time Slider Component    | 2 hours              |
| 3.2   | Playback Hook            | 1 hour               |
| 4.1   | Refactor World Map       | 3-4 hours            |
| 4.2   | Color Scale Improvements | 1 hour               |
| 5.x   | Enhanced Features        | 3-4 hours (optional) |

**Core Implementation (Phases 1-4): ~12-14 hours**
**With Enhancements (Phase 5): ~16-18 hours**

---

## Testing Checklist

- [ ] API route returns correct data format
- [ ] Cache works (second request is instant)
- [ ] All indicators load without errors
- [ ] Year slider updates map in real-time
- [ ] Play animation cycles through years smoothly
- [ ] Prefetching reduces loading states
- [ ] Color scale correctly represents data distribution
- [ ] Mobile responsive (slider works on touch)
- [ ] Error states handled gracefully
- [ ] No data countries show gray

---

## References

- [World Bank API Documentation](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589)
- [World Bank Indicator List](https://data.worldbank.org/indicator)
- [Fiscalis Architecture Guide](./ARCHITECTURE.md)
- [D3 Color Scales](https://d3js.org/d3-scale-chromatic)
