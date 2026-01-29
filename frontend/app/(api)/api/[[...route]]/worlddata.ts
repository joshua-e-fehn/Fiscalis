import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  fetchWorldBankIndicator,
  getIndicatorMetadata,
  getAllIndicatorsMetadata,
  getIndicatorsByCategory,
} from "@/lib/api/worldbank";
import {
  searchIndicators,
  fetchDynamicIndicator,
  getIndicatorInfo,
} from "@/lib/api/worldbank-search";
import {
  INDICATOR_IDS,
  YEAR_RANGE,
  type IndicatorId,
  type IndicatorData,
  type IndicatorMetadata,
  type IndicatorCategory,
} from "@/lib/types/worldbank";
import type {
  SearchedIndicator,
  DynamicIndicatorData,
} from "@/lib/types/worldbank-search";

// ═══════════════════════════════════════════════════════════════
// In-Memory Cache with TTL
// ═══════════════════════════════════════════════════════════════

interface CacheEntry {
  data: IndicatorData;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (historical data rarely changes)

function getCacheKey(indicator: string, year: number): string {
  return `${indicator}:${year}`;
}

function getFromCache(key: string): IndicatorData | null {
  const entry = cache.get(key);
  if (!entry) return null;

  // Check if cache entry has expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache(
  key: string,
  data: IndicatorData | DynamicIndicatorData,
): void {
  // Limit cache size to prevent memory issues (keep last 500 entries)
  if (cache.size >= 500) {
    // Remove oldest entries
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, 100); // Remove 100 oldest
    toRemove.forEach(([key]) => cache.delete(key));
  }

  cache.set(key, { data: data as IndicatorData, timestamp: Date.now() });
}

// ═══════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════

// Featured indicators (predefined)
const indicatorParamSchema = z.object({
  indicator: z.enum(INDICATOR_IDS as [IndicatorId, ...IndicatorId[]]),
});

const yearQuerySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(YEAR_RANGE.min, `Year must be >= ${YEAR_RANGE.min}`)
    .max(YEAR_RANGE.max, `Year must be <= ${YEAR_RANGE.max}`),
});

const indicatorsQuerySchema = z.object({
  grouped: z.coerce.boolean().optional().default(false),
});

// Search query schema
const searchQuerySchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

// Dynamic indicator schema (any World Bank indicator code)
const dynamicIndicatorParamSchema = z.object({
  code: z.string().min(1, "Indicator code is required"),
});

// ═══════════════════════════════════════════════════════════════
// Hono App Definition
// ═══════════════════════════════════════════════════════════════

const app = new Hono()
  /**
   * GET /api/world-data/search
   * Search World Bank indicators by keyword
   * Query params:
   *   - q: string (search query, min 2 chars)
   *   - limit: number (default: 50, max: 100)
   */
  .get("/search", zValidator("query", searchQuerySchema), async (c) => {
    const { q, limit } = c.req.valid("query");

    try {
      const results = await searchIndicators(q, limit);
      return c.json<{ indicators: SearchedIndicator[]; query: string }>({
        indicators: results,
        query: q,
      });
    } catch (error) {
      console.error("Search error:", error);
      return c.json(
        { error: "Failed to search indicators", indicators: [] },
        500,
      );
    }
  })

  /**
   * GET /api/world-data/indicators
   * Returns list of available indicators with metadata
   * Query params:
   *   - grouped: boolean (default: false) - Return indicators grouped by category
   */
  .get("/indicators", zValidator("query", indicatorsQuerySchema), async (c) => {
    const { grouped } = c.req.valid("query");

    if (grouped) {
      const groupedIndicators = getIndicatorsByCategory();
      return c.json<{
        grouped: Record<IndicatorCategory, IndicatorMetadata[]>;
      }>({
        grouped: groupedIndicators,
      });
    }

    const indicators = getAllIndicatorsMetadata();
    return c.json<{ indicators: IndicatorMetadata[] }>({ indicators });
  })

  /**
   * GET /api/world-data/dynamic/:code
   * Fetch data for ANY World Bank indicator by code
   * Path params:
   *   - code: string (World Bank indicator code, e.g., "NY.GDP.MKTP.CD")
   * Query params:
   *   - year: number (1960-2024)
   */
  .get(
    "/dynamic/:code",
    zValidator("param", dynamicIndicatorParamSchema),
    zValidator("query", yearQuerySchema),
    async (c) => {
      const { code } = c.req.valid("param");
      const { year } = c.req.valid("query");

      const cacheKey = getCacheKey(`dynamic:${code}`, year);

      // Check cache first
      const cached = getFromCache(cacheKey);
      if (cached) {
        c.header("X-Cache", "HIT");
        return c.json(cached);
      }

      try {
        const result = await fetchDynamicIndicator(code, year);

        // Cache the result
        setCache(cacheKey, result);
        c.header("X-Cache", "MISS");

        return c.json(result);
      } catch (error) {
        console.error(`Dynamic indicator error for ${code}/${year}:`, error);

        if (error instanceof Error) {
          return c.json(
            {
              error: "Failed to fetch indicator data",
              message: error.message,
            },
            500,
          );
        }

        return c.json({ error: "Failed to fetch indicator data" }, 500);
      }
    },
  )

  /**
   * GET /api/world-data/info/:code
   * Get metadata for any World Bank indicator
   */
  .get(
    "/info/:code",
    zValidator("param", dynamicIndicatorParamSchema),
    async (c) => {
      const { code } = c.req.valid("param");

      try {
        const info = await getIndicatorInfo(code);
        if (!info) {
          return c.json({ error: "Indicator not found" }, 404);
        }
        return c.json<{ indicator: SearchedIndicator }>({ indicator: info });
      } catch (error) {
        console.error(`Indicator info error for ${code}:`, error);
        return c.json({ error: "Failed to fetch indicator info" }, 500);
      }
    },
  )

  /**
   * GET /api/world-data/:indicator
   * Fetch world data for a FEATURED indicator and year
   * Path params:
   *   - indicator: IndicatorId (e.g., "gdp", "population")
   * Query params:
   *   - year: number (1960-2024)
   */
  .get(
    "/:indicator",
    zValidator("param", indicatorParamSchema),
    zValidator("query", yearQuerySchema),
    async (c) => {
      const { indicator } = c.req.valid("param");
      const { year } = c.req.valid("query");

      const cacheKey = getCacheKey(indicator, year);

      // Check cache first
      const cached = getFromCache(cacheKey);
      if (cached) {
        // Add cache header for debugging
        c.header("X-Cache", "HIT");
        return c.json<IndicatorData>(cached);
      }

      try {
        // Fetch from World Bank API
        const countries = await fetchWorldBankIndicator(indicator, year);
        const metadata = getIndicatorMetadata(indicator);

        const result: IndicatorData = {
          indicator: metadata,
          year,
          lastUpdated: new Date().toISOString(),
          source: "World Bank",
          countries,
        };

        // Cache the result
        setCache(cacheKey, result);
        c.header("X-Cache", "MISS");

        return c.json<IndicatorData>(result);
      } catch (error) {
        console.error(`World Bank API error for ${indicator}/${year}:`, error);

        // Return appropriate error response
        if (error instanceof Error) {
          return c.json(
            {
              error: "Failed to fetch data from World Bank",
              message: error.message,
            },
            500,
          );
        }

        return c.json({ error: "Failed to fetch data from World Bank" }, 500);
      }
    },
  );

export default app;
