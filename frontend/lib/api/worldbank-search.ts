// ═══════════════════════════════════════════════════════════════
// World Bank Indicator Search API
// Searches all ~17,000 World Bank indicators
// ═══════════════════════════════════════════════════════════════

import type {
  SearchedIndicator,
  WorldBankIndicatorSearchResult,
  DynamicIndicatorData,
} from "@/lib/types/worldbank-search";
import { ISO3_TO_ISO2 } from "./worldbank";

const WORLDBANK_BASE_URL = "https://api.worldbank.org/v2";

// Cache for indicator search results
const searchCache = new Map<
  string,
  { results: SearchedIndicator[]; timestamp: number }
>();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 15000; // 15 second timeout for API calls

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
 * Search World Bank indicators by keyword
 * Fetches from multiple pages to cover common indicators like NY.GDP.*, SP.POP.*, etc.
 * Returns up to 50 matching indicators
 */
export async function searchIndicators(
  query: string,
  limit: number = 50,
): Promise<SearchedIndicator[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const cacheKey = `${query.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
    return cached.results;
  }

  try {
    // World Bank has 29,000+ indicators sorted alphabetically
    // Common indicators like NY.GDP.*, SP.POP.* are around page 140-160
    // We fetch from strategic pages to cover different indicator prefixes:
    // - Page 1: Indicators starting with numbers (1.0.*, 6.0.*, etc.)
    // - Page 80-100: Indicators starting with E-I
    // - Page 140-160: NY.* (GDP, GNI), SP.* (Population) - the common ones
    // - Page 180-200: Later indicators

    const pagesToFetch = [1, 90, 145, 150, 155, 185];
    const perPage = 500;

    const fetchPromises = pagesToFetch.map((page) =>
      fetchWithTimeout(
        `${WORLDBANK_BASE_URL}/indicator?format=json&per_page=${perPage}&page=${page}`,
        { headers: { Accept: "application/json" } },
      )
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    );

    const results = await Promise.all(fetchPromises);

    // Combine all indicators from all pages
    const allIndicators: WorldBankIndicatorSearchResult[] = [];
    for (const data of results) {
      if (data?.[1] && Array.isArray(data[1])) {
        allIndicators.push(...data[1]);
      }
    }

    if (allIndicators.length === 0) {
      return [];
    }

    const searchLower = query.toLowerCase();
    const searchTerms = searchLower.split(/\s+/).filter((t) => t.length > 1);

    // Score-based filtering for better results
    const scoredResults = allIndicators
      .map((ind: WorldBankIndicatorSearchResult) => {
        const nameLower = ind.name?.toLowerCase() || "";
        const idLower = ind.id?.toLowerCase() || "";
        const descLower = ind.sourceNote?.toLowerCase() || "";

        let score = 0;

        for (const term of searchTerms) {
          // Exact word match in name scores highest
          if (
            nameLower.includes(` ${term} `) ||
            nameLower.startsWith(`${term} `) ||
            nameLower.endsWith(` ${term}`)
          ) {
            score += 10;
          } else if (nameLower.includes(term)) {
            score += 5;
          }

          // ID match (e.g., "GDP" in "NY.GDP.MKTP.CD")
          if (idLower.includes(term)) {
            score += 3;
          }

          // Description match
          if (descLower.includes(term)) {
            score += 1;
          }
        }

        // Boost World Development Indicators (source 2) - these are the common ones
        if (ind.source?.id === "2") {
          score *= 1.5;
        }

        return { ind, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ ind }) => ({
        code: ind.id,
        name: ind.name,
        description: ind.sourceNote || "",
        source: ind.source?.value || "World Bank",
        topics: ind.topics?.map((t) => t.value) || [],
      }));

    searchCache.set(cacheKey, {
      results: scoredResults,
      timestamp: Date.now(),
    });
    return scoredResults;
  } catch (error) {
    console.error("Error searching indicators:", error);
    return [];
  }
}

/**
 * Fetch all indicators (paginated) for full-text search
 * This is more comprehensive but slower
 */
export async function fetchAllIndicatorsForSearch(
  page: number = 1,
  perPage: number = 1000,
): Promise<{ indicators: SearchedIndicator[]; total: number; pages: number }> {
  try {
    const url = `${WORLDBANK_BASE_URL}/indicator?format=json&page=${page}&per_page=${perPage}`;

    const response = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`World Bank API error: ${response.status}`);
    }

    const data = await response.json();
    const metadata = data[0];

    if (!data[1] || !Array.isArray(data[1])) {
      return { indicators: [], total: 0, pages: 0 };
    }

    const indicators: SearchedIndicator[] = data[1].map(
      (ind: WorldBankIndicatorSearchResult) => ({
        code: ind.id,
        name: ind.name,
        description: ind.sourceNote || "",
        source: ind.source?.value || "World Bank",
        topics: ind.topics?.map((t) => t.value) || [],
      }),
    );

    return {
      indicators,
      total: metadata.total,
      pages: metadata.pages,
    };
  } catch (error) {
    console.error("Error fetching all indicators:", error);
    return { indicators: [], total: 0, pages: 0 };
  }
}

/**
 * Fetch data for any World Bank indicator code
 * Works with any valid indicator code, not just predefined ones
 */
export async function fetchDynamicIndicator(
  indicatorCode: string,
  year: number,
): Promise<DynamicIndicatorData> {
  const url = `${WORLDBANK_BASE_URL}/country/all/indicator/${indicatorCode}?format=json&date=${year}&per_page=300`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "World Bank API request timed out. The API may be temporarily unavailable. Please try again later.",
      );
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`World Bank API error: ${response.status}`);
  }

  const data = await response.json();

  // Check for error message from World Bank
  if (data[0]?.message) {
    throw new Error(data[0].message[0]?.value || "Invalid indicator");
  }

  // Extract indicator info from first data point
  const indicatorInfo = data[1]?.[0]?.indicator || {
    id: indicatorCode,
    value: indicatorCode,
  };

  // Determine unit and format based on indicator name
  const name = indicatorInfo.value || indicatorCode;
  const unit = guessUnitFromName(name);
  const formatFn = getFormatFunction(unit);

  const countries = (data[1] || [])
    .filter((d: any) => d.value !== null && d.countryiso3code)
    .map((d: any) => ({
      code: ISO3_TO_ISO2[d.countryiso3code] || d.countryiso3code,
      code3: d.countryiso3code,
      name: d.country.value,
      value: d.value,
      formattedValue: d.value !== null ? formatFn(d.value) : "N/A",
    }));

  return {
    indicator: {
      code: indicatorCode,
      name,
      description: "",
      unit,
    },
    year,
    lastUpdated: new Date().toISOString(),
    source: "World Bank",
    countries,
  };
}

/**
 * Get indicator metadata by code
 */
export async function getIndicatorInfo(
  indicatorCode: string,
): Promise<SearchedIndicator | null> {
  try {
    const url = `${WORLDBANK_BASE_URL}/indicator/${indicatorCode}?format=json`;

    const response = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data[1] || !data[1][0]) {
      return null;
    }

    const ind = data[1][0] as WorldBankIndicatorSearchResult;
    return {
      code: ind.id,
      name: ind.name,
      description: ind.sourceNote || "",
      source: ind.source?.value || "World Bank",
      topics: ind.topics?.map((t) => t.value) || [],
    };
  } catch (error) {
    console.error("Error fetching indicator info:", error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Guess the unit from indicator name
 */
function guessUnitFromName(name: string): string {
  const nameLower = name.toLowerCase();

  if (
    nameLower.includes("% of") ||
    nameLower.includes("percentage") ||
    nameLower.includes("rate")
  ) {
    return "%";
  }
  if (
    nameLower.includes("current us$") ||
    nameLower.includes("usd") ||
    nameLower.includes("us$")
  ) {
    return "$";
  }
  if (nameLower.includes("per capita")) {
    if (
      nameLower.includes("co2") ||
      nameLower.includes("carbon") ||
      nameLower.includes("metric tons")
    ) {
      return "t";
    }
    return "";
  }
  if (nameLower.includes("years") || nameLower.includes("life expectancy")) {
    return "years";
  }
  if (nameLower.includes("kwh") || nameLower.includes("kilowatt")) {
    return "kWh";
  }
  if (
    nameLower.includes("hectares") ||
    nameLower.includes("sq km") ||
    nameLower.includes("square km")
  ) {
    return "km²";
  }

  return "";
}

/**
 * Get appropriate format function based on unit
 */
function getFormatFunction(unit: string): (value: number) => string {
  switch (unit) {
    case "%":
      return (v) => `${v.toFixed(1)}%`;
    case "$":
      return formatLargeNumber;
    case "years":
      return (v) => `${v.toFixed(1)} years`;
    case "t":
      return (v) => `${v.toFixed(2)} t`;
    case "kWh":
      return (v) => `${formatLargeNumber(v)} kWh`;
    case "km²":
      return (v) => `${formatLargeNumber(v)} km²`;
    default:
      return (v) => {
        if (Math.abs(v) >= 1e6) return formatLargeNumber(v);
        if (Math.abs(v) < 0.01) return v.toExponential(2);
        if (Number.isInteger(v)) return v.toLocaleString();
        return v.toFixed(2);
      };
  }
}

/**
 * Format large numbers with suffix
 */
function formatLargeNumber(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1e12) return `${sign}$${(absValue / 1e12).toFixed(2)}T`;
  if (absValue >= 1e9) return `${sign}$${(absValue / 1e9).toFixed(2)}B`;
  if (absValue >= 1e6) return `${sign}$${(absValue / 1e6).toFixed(2)}M`;
  if (absValue >= 1e3) return `${sign}$${(absValue / 1e3).toFixed(2)}K`;
  return `${sign}$${absValue.toFixed(0)}`;
}
