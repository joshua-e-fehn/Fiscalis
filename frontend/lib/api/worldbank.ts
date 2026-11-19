import {
  type IndicatorId,
  type IndicatorMetadata,
  type IndicatorCategory,
  type WorldBankApiResponse,
  type IndicatorSeriesData,
  YEAR_RANGE,
} from "@/lib/types/worldbank";
import {
  buildSeries,
  parseSeriesRow,
  type IndicatorSeries,
  type SeriesRow,
} from "@/../services/worldbank/series";

// ═══════════════════════════════════════════════════════════════
// World Bank API Configuration
// ═══════════════════════════════════════════════════════════════

const WORLDBANK_BASE_URL = "https://api.worldbank.org/v2";

// ═══════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Format large numbers with appropriate suffix (K, M, B, T)
 */
function formatLargeNumber(value: number, prefix: string = ""): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1e12)
    return `${sign}${prefix}${(absValue / 1e12).toFixed(2)}T`;
  if (absValue >= 1e9) return `${sign}${prefix}${(absValue / 1e9).toFixed(2)}B`;
  if (absValue >= 1e6) return `${sign}${prefix}${(absValue / 1e6).toFixed(2)}M`;
  if (absValue >= 1e3) return `${sign}${prefix}${(absValue / 1e3).toFixed(2)}K`;
  return `${sign}${prefix}${absValue.toFixed(0)}`;
}

/**
 * Format currency values
 */
function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Format percentage values
 */
function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format population/count values
 */
function formatCount(value: number): string {
  return formatLargeNumber(value);
}

/**
 * Format years (for life expectancy)
 */
function formatYears(value: number): string {
  return `${value.toFixed(1)} years`;
}

/**
 * Format metric tons
 */
function formatMetricTons(value: number): string {
  return `${value.toFixed(2)} t`;
}

// ═══════════════════════════════════════════════════════════════
// Indicator Metadata Registry
// ═══════════════════════════════════════════════════════════════

type FormatFunction = (value: number) => string;

interface IndicatorConfig extends IndicatorMetadata {
  formatFn: FormatFunction;
}

export const INDICATOR_METADATA: Record<IndicatorId, IndicatorConfig> = {
  // Economy
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
    description: "GDP divided by midyear population",
    unit: "$",
    category: "economy",
    formatFn: formatCurrency,
  },
  gdpGrowth: {
    id: "gdpGrowth",
    name: "GDP Growth Rate",
    description: "Annual percentage growth rate of GDP",
    unit: "%",
    category: "economy",
    formatFn: formatPercent,
  },
  gni: {
    id: "gni",
    name: "GNI (Current US$)",
    description: "Gross National Income at current prices",
    unit: "$",
    category: "economy",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },

  // Demographics
  population: {
    id: "population",
    name: "Population",
    description: "Total population count",
    unit: "",
    category: "demographics",
    formatFn: formatCount,
  },
  populationGrowth: {
    id: "populationGrowth",
    name: "Population Growth",
    description: "Annual population growth rate",
    unit: "%",
    category: "demographics",
    formatFn: formatPercent,
  },
  urbanPopulation: {
    id: "urbanPopulation",
    name: "Urban Population",
    description: "Percentage of population living in urban areas",
    unit: "%",
    category: "demographics",
    formatFn: formatPercent,
  },
  lifeExpectancy: {
    id: "lifeExpectancy",
    name: "Life Expectancy",
    description: "Life expectancy at birth, total years",
    unit: "years",
    category: "demographics",
    formatFn: formatYears,
  },

  // Finance
  inflation: {
    id: "inflation",
    name: "Inflation Rate",
    description: "Annual consumer price inflation",
    unit: "%",
    category: "finance",
    formatFn: formatPercent,
  },
  interestRate: {
    id: "interestRate",
    name: "Real Interest Rate",
    description: "Real interest rate adjusted for inflation",
    unit: "%",
    category: "finance",
    formatFn: formatPercent,
  },
  debtToGdp: {
    id: "debtToGdp",
    name: "Central Govt Debt (% of GDP)",
    description: "Central government debt as percentage of GDP",
    unit: "%",
    category: "finance",
    formatFn: formatPercent,
  },

  // Trade
  exports: {
    id: "exports",
    name: "Exports (Current US$)",
    description: "Exports of goods and services",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  imports: {
    id: "imports",
    name: "Imports (Current US$)",
    description: "Imports of goods and services",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  tradeBalance: {
    id: "tradeBalance",
    name: "Trade Balance",
    description: "External balance on goods and services",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  fdi: {
    id: "fdi",
    name: "Foreign Direct Investment",
    description: "Net inflows of foreign direct investment",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },

  // Energy & Environment
  co2PerCapita: {
    id: "co2PerCapita",
    name: "CO₂ Emissions per Capita",
    description: "Carbon dioxide emissions per capita in metric tons",
    unit: "t",
    category: "energy",
    formatFn: formatMetricTons,
  },
  renewableEnergy: {
    id: "renewableEnergy",
    name: "Renewable Energy Consumption",
    description: "Percentage of total final energy consumption",
    unit: "%",
    category: "energy",
    formatFn: formatPercent,
  },
  electricityAccess: {
    id: "electricityAccess",
    name: "Access to Electricity",
    description: "Percentage of population with access to electricity",
    unit: "%",
    category: "energy",
    formatFn: formatPercent,
  },

  // Development
  povertyRate: {
    id: "povertyRate",
    name: "Poverty Rate",
    description: "Population living below $2.15/day (2017 PPP)",
    unit: "%",
    category: "development",
    formatFn: formatPercent,
  },
  unemployment: {
    id: "unemployment",
    name: "Unemployment Rate",
    description: "Unemployment as percentage of total labor force",
    unit: "%",
    category: "development",
    formatFn: formatPercent,
  },
  literacy: {
    id: "literacy",
    name: "Literacy Rate",
    description: "Adult literacy rate (ages 15+)",
    unit: "%",
    category: "development",
    formatFn: formatPercent,
  },

  // Commodities (Minerals, Oil, Gas)
  mineralRents: {
    id: "mineralRents",
    name: "Mineral Rents (% of GDP)",
    description:
      "Mineral rents including tin, gold, lead, zinc, iron, copper, nickel, silver, bauxite, and phosphate",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  oresMetalsExports: {
    id: "oresMetalsExports",
    name: "Ores & Metals Exports",
    description: "Ores and metals as percentage of merchandise exports",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  oresMetalsImports: {
    id: "oresMetalsImports",
    name: "Ores & Metals Imports",
    description: "Ores and metals as percentage of merchandise imports",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  mineralDepletion: {
    id: "mineralDepletion",
    name: "Mineral Depletion (% of GNI)",
    description:
      "Ratio of mineral stock value to remaining reserve lifetime (tin, gold, lead, zinc, iron, copper, nickel, silver, bauxite, phosphate)",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  oilRents: {
    id: "oilRents",
    name: "Oil Rents (% of GDP)",
    description:
      "Difference between crude oil production value at regional prices and total production costs",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  naturalGasRents: {
    id: "naturalGasRents",
    name: "Natural Gas Rents (% of GDP)",
    description:
      "Difference between natural gas production value at regional prices and total production costs",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  totalResourceRents: {
    id: "totalResourceRents",
    name: "Total Natural Resources Rents (% of GDP)",
    description: "Sum of oil, natural gas, coal, mineral, and forest rents",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
};

// ═══════════════════════════════════════════════════════════════
// Server-side API Functions (for Hono route)
// ═══════════════════════════════════════════════════════════════

const FETCH_TIMEOUT_MS = 30000; // 30 second timeout for World Bank API calls
const MAX_RETRIES = 2; // Retry up to 2 times on failure

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with timeout and automatic retry on transient failures
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = MAX_RETRIES,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      // Retry on 5xx server errors from World Bank
      if (response.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("Fetch failed after retries");
}

/**
 * A full-history request is fast when the World Bank has it warm (<1s) but
 * can take close to a minute cold, so it gets a longer timeout and a single
 * retry instead of the per-request defaults.
 */
const SERIES_TIMEOUT_MS = 90000;
const SERIES_RETRIES = 1;
/** One page holds 266 entities × ~66 years; more pages are still followed */
const SERIES_PAGE_SIZE = 20000;

/** The World Bank does not know the requested indicator code. */
export class WorldBankIndicatorNotFoundError extends Error {}

/**
 * Every year of one indicator for every country and aggregate, in one
 * request (server-side). Works for featured and searched indicator codes.
 */
export async function fetchWorldBankSeries(indicatorCode: string): Promise<{
  /** The indicator's English name as the World Bank labels it */
  name: string | null;
  /** The World Bank's own last update date of the source */
  lastUpdated: string | null;
  series: IndicatorSeries;
}> {
  const lastYear = new Date().getUTCFullYear();
  const rows: SeriesRow[] = [];
  let name: string | null = null;
  let lastUpdated: string | null = null;

  for (let page = 1, pages = 1; page <= pages; page++) {
    const url = `${WORLDBANK_BASE_URL}/country/all/indicator/${encodeURIComponent(indicatorCode)}?format=json&date=${YEAR_RANGE.min}:${lastYear}&per_page=${SERIES_PAGE_SIZE}&page=${page}`;
    const response = await fetchWithRetry(
      url,
      { headers: { Accept: "application/json" } },
      SERIES_RETRIES,
      SERIES_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(
        `World Bank API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    // An unknown or archived code answers 200 with [{ message: [...] }]
    if (data?.[0]?.message) {
      throw new WorldBankIndicatorNotFoundError(
        data[0].message[0]?.value || "Indicator not found",
      );
    }
    const [meta, points] = data as WorldBankApiResponse;
    pages = meta?.pages ?? 1;
    lastUpdated ??= meta?.lastupdated ?? null;

    for (const d of points ?? []) {
      name ??= d.indicator?.value ?? null;
      const row = parseSeriesRow(d);
      if (row) rows.push(row);
    }
  }

  return { name, lastUpdated, series: buildSeries(rows) };
}

/** An indicator's metadata without its formatFn (functions don't serialize) */
function toIndicatorMetadata({
  id,
  name,
  description,
  unit,
  category,
}: IndicatorConfig): IndicatorMetadata {
  return { id, name, description, unit, category };
}

/**
 * Get indicator metadata (without formatFn for serialization)
 */
export function getIndicatorMetadata(
  indicator: IndicatorId,
): IndicatorMetadata {
  return toIndicatorMetadata(INDICATOR_METADATA[indicator]);
}

/**
 * Get all indicators metadata for UI dropdown
 */
export function getAllIndicatorsMetadata(): IndicatorMetadata[] {
  return Object.values(INDICATOR_METADATA).map(toIndicatorMetadata);
}

/**
 * Get indicators grouped by category
 */
export function getIndicatorsByCategory(): Record<
  IndicatorCategory,
  IndicatorMetadata[]
> {
  const grouped: Record<IndicatorCategory, IndicatorMetadata[]> = {
    economy: [],
    demographics: [],
    finance: [],
    trade: [],
    energy: [],
    development: [],
    commodities: [],
  };

  for (const config of Object.values(INDICATOR_METADATA)) {
    const metadata = toIndicatorMetadata(config);
    grouped[metadata.category].push(metadata);
  }

  return grouped;
}

// ═══════════════════════════════════════════════════════════════
// Client-side API Functions (for React hooks)
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch an indicator's full history from our API route (client-side).
 * `isDynamic` selects a searched World Bank code over a featured id.
 */
export async function getIndicatorSeries(
  indicator: string,
  isDynamic: boolean,
): Promise<IndicatorSeriesData> {
  const path = isDynamic
    ? `/api/world-data/dynamic/${encodeURIComponent(indicator)}/series`
    : `/api/world-data/series/${encodeURIComponent(indicator)}`;
  const response = await fetch(path);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData.error || `Failed to fetch world data: ${response.status}`;
    // The series routes answer 404 for a code the World Bank no longer serves
    throw response.status === 404
      ? new WorldBankIndicatorNotFoundError(message)
      : new Error(message);
  }

  return response.json();
}

/**
 * Fetch list of available indicators (client-side)
 */
export async function getIndicators(): Promise<{
  indicators: IndicatorMetadata[];
}> {
  const response = await fetch("/api/world-data/indicators");

  if (!response.ok) {
    throw new Error(`Failed to fetch indicators: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch indicators grouped by category (client-side)
 */
export async function getIndicatorsGrouped(): Promise<{
  grouped: Record<IndicatorCategory, IndicatorMetadata[]>;
}> {
  const response = await fetch("/api/world-data/indicators?grouped=true");

  if (!response.ok) {
    throw new Error(`Failed to fetch indicators: ${response.status}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════
// Dynamic Indicator Functions (Client-side)
// ═══════════════════════════════════════════════════════════════

import type { SearchedIndicator } from "@/lib/types/worldbank-search";

/**
 * Search World Bank indicators by keyword
 */
export async function searchWorldBankIndicators(
  query: string,
  limit: number = 50,
): Promise<{ indicators: SearchedIndicator[]; query: string }> {
  if (!query || query.length < 2) {
    return { indicators: [], query };
  }

  const response = await fetch(
    `/api/world-data/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to search indicators: ${response.status}`);
  }

  return response.json();
}

/**
 * Get metadata for any World Bank indicator
 */
export async function getIndicatorInfo(
  indicatorCode: string,
): Promise<{ indicator: SearchedIndicator } | null> {
  const response = await fetch(
    `/api/world-data/info/${encodeURIComponent(indicatorCode)}`,
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch indicator info: ${response.status}`);
  }

  return response.json();
}
