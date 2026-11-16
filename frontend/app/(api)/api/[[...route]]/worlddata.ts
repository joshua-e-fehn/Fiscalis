import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { describeError } from "@/../services/security/providerError";

import {
  fetchWorldBankSeries,
  getIndicatorMetadata,
  getAllIndicatorsMetadata,
  getIndicatorsByCategory,
  WorldBankIndicatorNotFoundError,
} from "@/lib/api/worldbank";
import {
  searchIndicators,
  getIndicatorInfo,
  guessUnitFromName,
} from "@/lib/api/worldbank-search";
import {
  INDICATOR_IDS,
  WORLDBANK_INDICATORS,
  type IndicatorId,
  type IndicatorMetadata,
  type IndicatorCategory,
  type IndicatorSeriesData,
} from "@/lib/types/worldbank";
import type { SearchedIndicator } from "@/lib/types/worldbank-search";

// ═══════════════════════════════════════════════════════════════
// Series cache: in-memory per instance, in-flight requests shared
// ═══════════════════════════════════════════════════════════════

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (historical data rarely changes)
const CACHE_MAX_ENTRIES = 100; // one entry is a whole indicator (~0.3 MB)

const cache = new Map<string, { data: IndicatorSeriesData; timestamp: number }>();
const inFlight = new Map<string, Promise<IndicatorSeriesData>>();

/**
 * The cached series for `key`, else one shared upstream load: concurrent
 * requests for the same indicator wait on the same World Bank call.
 */
async function cachedSeries(
  key: string,
  load: () => Promise<IndicatorSeriesData>,
): Promise<{ data: IndicatorSeriesData; hit: boolean }> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp <= CACHE_TTL) {
    return { data: entry.data, hit: true };
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = load()
      .then((data) => {
        if (cache.size >= CACHE_MAX_ENTRIES) {
          // Map keeps insertion order: drop the oldest entry
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.delete(key);
        cache.set(key, { data, timestamp: Date.now() });
        return data;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return { data: await pending, hit: false };
}

/**
 * Series answers are public and change at most daily: the CDN keeps them a
 * day and serves a stale copy for a week while it refreshes, so a cold
 * function rarely waits on the World Bank.
 */
const SERIES_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function seriesError(c: Context, error: unknown, label: string) {
  console.error(`World Bank series error for ${label}:`, describeError(error));
  c.header("Cache-Control", "no-store");
  if (error instanceof WorldBankIndicatorNotFoundError) {
    return c.json({ error: "Indicator not found" }, 404);
  }
  return c.json({ error: "Failed to fetch data from World Bank" }, 502);
}

// ═══════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════

// Featured indicators (predefined)
const indicatorParamSchema = z.object({
  indicator: z.enum(INDICATOR_IDS as [IndicatorId, ...IndicatorId[]]),
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
// World Bank codes are letters, digits, dots, dashes and underscores; the
// code goes into the upstream URL path, so nothing else is accepted.
const dynamicIndicatorParamSchema = z.object({
  code: z
    .string()
    .min(1, "Indicator code is required")
    .max(64, "Indicator code is too long")
    .regex(/^[A-Za-z0-9._-]+$/, "Invalid indicator code"),
});

/**
 * Validation failure -> `{ error: string }` with 400, the same shape every
 * other error in this router has (lib/api/worldbank.ts reads `error` as a
 * message). Without it zod-validator returns the raw ZodError, whose JSON
 * shape changed in zod 4.
 */
function rejectInvalid(
  result:
    | { success: true }
    | { success: false; error: { issues: ReadonlyArray<{ message: string }> } },
  c: Context,
) {
  if (!result.success) {
    return c.json(
      { error: result.error.issues[0]?.message ?? "Invalid request" },
      400,
    );
  }
}

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
  .get(
    "/search",
    zValidator("query", searchQuerySchema, rejectInvalid),
    async (c) => {
      const { q, limit } = c.req.valid("query");

      try {
        const results = await searchIndicators(q, limit);
        return c.json<{ indicators: SearchedIndicator[]; query: string }>({
          indicators: results,
          query: q,
        });
      } catch (error) {
        console.error("Search error:", describeError(error));
        return c.json(
          { error: "Failed to search indicators", indicators: [] },
          500,
        );
      }
    },
  )

  /**
   * GET /api/world-data/indicators
   * Returns list of available indicators with metadata
   * Query params:
   *   - grouped: boolean (default: false) - Return indicators grouped by category
   */
  .get(
    "/indicators",
    zValidator("query", indicatorsQuerySchema, rejectInvalid),
    async (c) => {
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
    },
  )

  /**
   * GET /api/world-data/dynamic/:code/series
   * Every year of ANY World Bank indicator by code (e.g. "NY.GDP.MKTP.CD")
   */
  .get(
    "/dynamic/:code/series",
    zValidator("param", dynamicIndicatorParamSchema, rejectInvalid),
    async (c) => {
      const { code } = c.req.valid("param");

      try {
        const { data, hit } = await cachedSeries(`dynamic:${code}`, async () => {
          const { name, lastUpdated, series } =
            await fetchWorldBankSeries(code);
          const label = name ?? code;
          return {
            indicator: {
              id: code,
              name: label,
              description: "",
              unit: guessUnitFromName(label),
            },
            source: "World Bank",
            lastUpdated,
            series,
          };
        });
        c.header("X-Cache", hit ? "HIT" : "MISS");
        c.header("Cache-Control", SERIES_CACHE_CONTROL);
        return c.json<IndicatorSeriesData>(data);
      } catch (error) {
        return seriesError(c, error, code);
      }
    },
  )

  /**
   * GET /api/world-data/info/:code
   * Get metadata for any World Bank indicator
   */
  .get(
    "/info/:code",
    zValidator("param", dynamicIndicatorParamSchema, rejectInvalid),
    async (c) => {
      const { code } = c.req.valid("param");

      try {
        const info = await getIndicatorInfo(code);
        if (!info) {
          return c.json({ error: "Indicator not found" }, 404);
        }
        return c.json<{ indicator: SearchedIndicator }>({ indicator: info });
      } catch (error) {
        console.error(
          `Indicator info error for ${code}:`,
          describeError(error),
        );
        return c.json({ error: "Failed to fetch indicator info" }, 500);
      }
    },
  )

  /**
   * GET /api/world-data/series/:indicator
   * Every year of a FEATURED indicator (e.g. "gdp", "population")
   */
  .get(
    "/series/:indicator",
    zValidator("param", indicatorParamSchema, rejectInvalid),
    async (c) => {
      const { indicator } = c.req.valid("param");

      try {
        const { data, hit } = await cachedSeries(indicator, async () => {
          const { lastUpdated, series } = await fetchWorldBankSeries(
            WORLDBANK_INDICATORS[indicator],
          );
          const { id, name, description, unit } =
            getIndicatorMetadata(indicator);
          return {
            indicator: { id, name, description, unit },
            source: "World Bank",
            lastUpdated,
            series,
          };
        });
        c.header("X-Cache", hit ? "HIT" : "MISS");
        c.header("Cache-Control", SERIES_CACHE_CONTROL);
        return c.json<IndicatorSeriesData>(data);
      } catch (error) {
        return seriesError(c, error, indicator);
      }
    },
  );

export default app;
