// ═══════════════════════════════════════════════════════════════
// World Bank Indicators - Convex Functions
// Syncs all ~29,000 World Bank indicators for instant search
// ═══════════════════════════════════════════════════════════════

import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserId, requireUserId } from "./lib/auth";
import { describeError } from "../../services/security/providerError";
import {
  assessCoverage,
  parseSeriesRow,
  stateAfterCheck,
  type IndicatorCheck,
  type SeriesRow,
  type WorldBankPoint,
} from "../../services/worldbank/series";

const WORLDBANK_BASE_URL = "https://api.worldbank.org/v2";
const INDICATORS_PER_PAGE = 1000; // Max allowed by World Bank API
const FETCH_TIMEOUT_MS = 30000; // 30 second timeout

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface WorldBankIndicatorResponse {
  id: string;
  name: string;
  sourceNote?: string;
  source?: { id: string; value: string };
  topics?: Array<{ id: string; value: string }>;
}

interface WorldBankApiResponse {
  page: number;
  pages: number;
  per_page: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════
// Search Queries
// ═══════════════════════════════════════════════════════════════

/**
 * Search World Bank indicators using Convex's full-text search
 */
export const searchIndicators = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const searchQuery = args.query.toLowerCase().trim();

    if (searchQuery.length < 2) {
      return { indicators: [], totalInDb: 0 };
    }

    // Get total count from sync status (avoid loading all documents)
    const syncStatus = await ctx.db
      .query("worldBankSyncStatus")
      .order("desc")
      .first();
    const totalInDb = syncStatus?.indicatorCount ?? 0;

    // Use Convex's search index for full-text search only
    // This is the most efficient way to search in Convex
    const results = await ctx.db
      .query("worldBankIndicators")
      .withSearchIndex("search_indicators", (q) =>
        q.search("nameLower", searchQuery),
      )
      .take(limit * 3); // Get more to allow for filtering and scoring

    // Only indicators the map can show: a check found them archived, without
    // country-year data or too sparse. Unchecked ones stay until checked.
    const filtered = results.filter((ind) => ind.availability !== "unusable");

    // Score and sort results
    const scored = filtered.map((ind) => {
      let score = 0;
      const terms = searchQuery.split(/\s+/).filter((t) => t.length > 1);

      for (const term of terms) {
        // Exact word match in name
        if (
          ind.nameLower.includes(` ${term} `) ||
          ind.nameLower.startsWith(`${term} `) ||
          ind.nameLower.endsWith(` ${term}`) ||
          ind.nameLower === term
        ) {
          score += 10;
        } else if (ind.nameLower.includes(term)) {
          score += 5;
        }

        // Code match (e.g., "GDP" in "NY.GDP.MKTP.CD")
        if (ind.codeLower.includes(term)) {
          score += 8;
        }
      }

      // Boost World Development Indicators (source 2)
      if (ind.sourceId === "2") {
        score *= 1.5;
      }

      // Verified indicators first among equals
      if (ind.availability === "usable") score *= 1.2;

      return { ind, score };
    });

    // Sort by score and take limit
    const sortedResults = scored
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ ind }) => ({
        code: ind.code,
        name: ind.name,
        description: ind.description,
        source: ind.sourceName || "World Bank",
        topics: ind.topics || [],
        // Set once a check found the indicator usable
        latestYear: ind.latestYear,
        countryCount: ind.countryCount,
      }));

    return { indicators: sortedResults, totalInDb };
  },
});

/**
 * Get sync status
 */
export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const status = await ctx.db
      .query("worldBankSyncStatus")
      .order("desc")
      .first();

    // Counts from the last sync status instead of counting all documents
    // This avoids reading all 29,000+ indicators
    return {
      lastSync: status?.lastFullSync,
      indicatorCount: status?.indicatorCount ?? 0,
      syncStatus: status?.status,
      errorMessage: status?.errorMessage,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// User Favorites
// ═══════════════════════════════════════════════════════════════

/**
 * Get user's favorite indicators
 */
export const getUserFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const favorites = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return await Promise.all(
      favorites.map(async (fav) => {
        const indicator = await ctx.db
          .query("worldBankIndicators")
          .withIndex("by_code", (q) => q.eq("code", fav.indicatorCode))
          .first();
        return {
          code: fav.indicatorCode,
          name: fav.indicatorName,
          description: fav.indicatorDescription,
          addedAt: fav.addedAt,
          // A favourite the World Bank has since archived stays listed (the
          // user may want to remove it) but can't be opened
          available: indicator?.availability !== "unusable",
        };
      }),
    );
  },
});

/**
 * Check if an indicator is favorited by user
 */
export const isIndicatorFavorited = query({
  args: {
    indicatorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return false;
    const favorite = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", userId).eq("indicatorCode", args.indicatorCode),
      )
      .first();

    return !!favorite;
  },
});

/**
 * Add indicator to favorites
 */
export const addToFavorites = mutation({
  args: {
    indicatorCode: v.string(),
    indicatorName: v.string(),
    indicatorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Check if already favorited
    const existing = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", userId).eq("indicatorCode", args.indicatorCode),
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("worldBankFavorites", {
      userId,
      indicatorCode: args.indicatorCode,
      indicatorName: args.indicatorName,
      indicatorDescription: args.indicatorDescription,
      addedAt: Date.now(),
    });
  },
});

/**
 * Remove indicator from favorites
 */
export const removeFromFavorites = mutation({
  args: {
    indicatorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const favorite = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", userId).eq("indicatorCode", args.indicatorCode),
      )
      .first();

    if (favorite) {
      await ctx.db.delete(favorite._id);
      return true;
    }

    return false;
  },
});

/**
 * Toggle indicator favorite status
 */
export const toggleFavorite = mutation({
  args: {
    indicatorCode: v.string(),
    indicatorName: v.string(),
    indicatorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", userId).eq("indicatorCode", args.indicatorCode),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { isFavorited: false };
    }

    await ctx.db.insert("worldBankFavorites", {
      userId,
      indicatorCode: args.indicatorCode,
      indicatorName: args.indicatorName,
      indicatorDescription: args.indicatorDescription,
      addedAt: Date.now(),
    });

    return { isFavorited: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// Sync Actions
// ═══════════════════════════════════════════════════════════════

/**
 * Internal mutation to upsert indicators in batches
 */
export const upsertIndicatorsBatch = internalMutation({
  args: {
    indicators: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        description: v.union(v.string(), v.null()),
        sourceId: v.union(v.string(), v.null()),
        sourceName: v.union(v.string(), v.null()),
        topics: v.union(v.array(v.string()), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const ind of args.indicators) {
      // Check if indicator already exists
      const existing = await ctx.db
        .query("worldBankIndicators")
        .withIndex("by_code", (q) => q.eq("code", ind.code))
        .first();

      // Convert null values to undefined for optional schema fields
      const description = ind.description ?? undefined;
      const sourceId = ind.sourceId ?? undefined;
      const sourceName = ind.sourceName ?? undefined;
      const topics = ind.topics ?? undefined;

      if (existing) {
        // Update existing - keep its availability check state
        await ctx.db.patch(existing._id, {
          name: ind.name,
          description,
          sourceId,
          sourceName,
          topics,
          nameLower: ind.name.toLowerCase(),
          codeLower: ind.code.toLowerCase(),
          syncedAt: now,
        });
      } else {
        // Insert new
        await ctx.db.insert("worldBankIndicators", {
          code: ind.code,
          name: ind.name,
          description,
          sourceId,
          sourceName,
          topics,
          nameLower: ind.name.toLowerCase(),
          codeLower: ind.code.toLowerCase(),
          timeoutCount: 0,
          syncedAt: now,
        });
      }
    }

    return { upserted: args.indicators.length };
  },
});

/**
 * Internal mutation to update sync status
 */
export const updateSyncStatus = internalMutation({
  args: {
    lastFullSync: v.number(),
    indicatorCount: v.number(),
    syncDurationMs: v.number(),
    status: v.union(
      v.literal("success"),
      v.literal("partial"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("worldBankSyncStatus", {
      lastFullSync: args.lastFullSync,
      indicatorCount: args.indicatorCount,
      syncDurationMs: args.syncDurationMs,
      status: args.status,
      errorMessage: args.errorMessage,
    });
  },
});

// Sanitized indicator type for Convex
interface SanitizedIndicator {
  id: string;
  name: string;
  sourceNote: string | null;
  source: { id: string; value: string } | null;
  topics: Array<{ id: string; value: string }> | null;
}

/**
 * Internal action to fetch a single page of indicators
 */
export const fetchIndicatorPage = internalAction({
  args: {
    page: v.number(),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    indicators: SanitizedIndicator[];
    totalPages: number;
  } | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const url = `${WORLDBANK_BASE_URL}/indicator?format=json&per_page=${INDICATORS_PER_PAGE}&page=${args.page}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Failed to fetch page ${args.page}: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (!data || !Array.isArray(data) || data.length < 2) {
        return null;
      }

      const meta = data[0] as WorldBankApiResponse;
      const rawIndicators = data[1] as WorldBankIndicatorResponse[];

      // Sanitize data - replace undefined with null for Convex compatibility
      const indicators: SanitizedIndicator[] = rawIndicators.map((ind) => ({
        id: ind.id || "",
        name: ind.name || "",
        sourceNote: ind.sourceNote || null,
        source: ind.source
          ? { id: ind.source.id || "", value: ind.source.value || "" }
          : null,
        topics:
          ind.topics && Array.isArray(ind.topics)
            ? ind.topics.map((t) => ({ id: t.id || "", value: t.value || "" }))
            : null,
      }));

      return {
        indicators,
        totalPages: meta.pages,
      };
    } catch (error) {
      console.error(`Error fetching page ${args.page}:`, describeError(error));
      return null;
    }
  },
});

/**
 * Main sync action - fetches all indicators from World Bank API
 * Runs weekly via cron. Manual run (from frontend/):
 *   npx convex run worldbank:syncAllIndicatorsInternal
 */
export const syncAllIndicatorsInternal = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ success: boolean; indicatorCount: number; message: string }> => {
    const startTime = Date.now();
    let totalIndicators = 0;
    const failedPages: number[] = [];

    console.log("[WorldBank Sync] Starting full indicator sync...");

    // First, fetch page 1 to get total pages
    const firstPage = await ctx.runAction(
      internal.worldbank.fetchIndicatorPage,
      { page: 1 },
    );

    if (!firstPage) {
      await ctx.runMutation(internal.worldbank.updateSyncStatus, {
        lastFullSync: startTime,
        indicatorCount: 0,
        syncDurationMs: Date.now() - startTime,
        status: "failed",
        errorMessage: "Failed to fetch first page from World Bank API",
      });
      return {
        success: false,
        indicatorCount: 0,
        message: "Failed to fetch first page",
      };
    }

    const totalPages = firstPage.totalPages;
    console.log(`[WorldBank Sync] Found ${totalPages} pages of indicators`);

    // Process first page
    if (firstPage.indicators.length > 0) {
      const batch = firstPage.indicators.map((ind: SanitizedIndicator) => ({
        code: ind.id,
        name: ind.name,
        description: ind.sourceNote,
        sourceId: ind.source?.id || null,
        sourceName: ind.source?.value || null,
        topics: ind.topics?.map((t) => t.value) || null,
      }));

      await ctx.runMutation(internal.worldbank.upsertIndicatorsBatch, {
        indicators: batch,
      });
      totalIndicators += batch.length;
    }

    // Fetch remaining pages in batches to avoid rate limits
    const BATCH_SIZE = 5; // Fetch 5 pages in parallel
    const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay

    for (
      let batchStart = 2;
      batchStart <= totalPages;
      batchStart += BATCH_SIZE
    ) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
      const pageNumbers = Array.from(
        { length: batchEnd - batchStart + 1 },
        (_, i) => batchStart + i,
      );

      console.log(
        `[WorldBank Sync] Fetching pages ${batchStart}-${batchEnd}...`,
      );

      // Fetch pages in parallel
      const pageResults = await Promise.all(
        pageNumbers.map((page) =>
          ctx.runAction(internal.worldbank.fetchIndicatorPage, { page }),
        ),
      );

      // Process results
      for (let i = 0; i < pageResults.length; i++) {
        const result = pageResults[i];
        const pageNum = pageNumbers[i];

        if (!result || result.indicators.length === 0) {
          failedPages.push(pageNum);
          continue;
        }

        const batch = result.indicators.map((ind: SanitizedIndicator) => ({
          code: ind.id,
          name: ind.name,
          description: ind.sourceNote,
          sourceId: ind.source?.id || null,
          sourceName: ind.source?.value || null,
          topics: ind.topics?.map((t) => t.value) || null,
        }));

        await ctx.runMutation(internal.worldbank.upsertIndicatorsBatch, {
          indicators: batch,
        });
        totalIndicators += batch.length;
      }

      // Delay between batches
      if (batchEnd < totalPages) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_BATCHES),
        );
      }
    }

    const syncDurationMs = Date.now() - startTime;
    const status =
      failedPages.length === 0
        ? "success"
        : failedPages.length > totalPages / 2
          ? "failed"
          : "partial";

    await ctx.runMutation(internal.worldbank.updateSyncStatus, {
      lastFullSync: startTime,
      indicatorCount: totalIndicators,
      syncDurationMs,
      status,
      errorMessage:
        failedPages.length > 0
          ? `Failed pages: ${failedPages.join(", ")}`
          : undefined,
    });

    console.log(
      `[WorldBank Sync] Complete! Synced ${totalIndicators} indicators in ${Math.round(syncDurationMs / 1000)}s`,
    );

    return {
      success: status !== "failed",
      indicatorCount: totalIndicators,
      message: `Synced ${totalIndicators} indicators. ${failedPages.length > 0 ? `Failed pages: ${failedPages.length}` : ""}`,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// Availability checks
// Every indicator is asked for its data the way the map asks for it, so
// search only offers indicators that actually draw a map.
// ═══════════════════════════════════════════════════════════════

const CHECK_TIMEOUT_MS = 60000;
/** Parallel World Bank requests per run; it's a free public API */
const CHECK_CONCURRENCY = 8;
const CHECK_BATCH_SIZE = 1000;
/** Stop starting checks after this, so a run ends before the next cron */
const CHECK_RUN_BUDGET_MS = 4 * 60 * 1000;
/** A user-requested re-check of the same indicator at most this often */
const REQUESTED_CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Asks the World Bank for every country's most recent value, the same
 * endpoint the map's series request uses, and judges the answer.
 */
async function checkAgainstWorldBank(code: string): Promise<IndicatorCheck> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const url = `${WORLDBANK_BASE_URL}/country/all/indicator/${encodeURIComponent(code)}?format=json&per_page=1000&mrnev=1`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    // Some databases reject every data request with 400 (an HTML error
    // page); 404 is an unknown code. Neither is a passing hiccup.
    if (response.status === 400 || response.status === 404) {
      return { kind: "notFound" };
    }
    if (!response.ok) return { kind: "failed" };
    const data = await response.json();
    // An unknown or archived code answers 200 with [{ message: [...] }]
    if (data?.[0]?.message) return { kind: "notFound" };
    const points: WorldBankPoint[] = Array.isArray(data?.[1]) ? data[1] : [];
    const rows = points
      .map(parseSeriesRow)
      .filter((row): row is SeriesRow => row !== null);
    return { kind: "checked", coverage: assessCoverage(rows) };
  } catch (error) {
    console.warn(
      `[WorldBank check] ${code} failed: ${describeError(error)}`,
    );
    return { kind: "failed" };
  } finally {
    clearTimeout(timeoutId);
  }
}

const checkValidator = v.union(
  v.object({
    kind: v.literal("checked"),
    coverage: v.object({
      usable: v.boolean(),
      countryCount: v.number(),
      latestYear: v.union(v.number(), v.null()),
    }),
  }),
  v.object({ kind: v.literal("notFound") }),
  v.object({ kind: v.literal("failed") }),
);

/** Codes due for a check: never checked first, then the oldest. */
export const dueIndicatorCodes = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    // Missing nextCheckAt sorts before every number, so never-checked
    // indicators come first
    const due = await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_next_check", (q) => q.lte("nextCheckAt", args.now))
      .take(args.limit);
    return due.map((ind) => ind.code);
  },
});

/** Stores one check's outcome and when the indicator is due again. */
export const recordIndicatorCheck = internalMutation({
  args: { code: v.string(), check: checkValidator },
  handler: async (ctx, args) => {
    const indicator = await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!indicator) return;

    const now = Date.now();
    const next = stateAfterCheck(
      {
        availability: indicator.availability,
        failedChecks: indicator.timeoutCount,
      },
      args.check,
    );
    const coverage =
      args.check.kind === "checked" ? args.check.coverage : undefined;
    await ctx.db.patch(indicator._id, {
      availability: next.availability,
      timeoutCount: next.failedChecks,
      nextCheckAt: now + next.recheckAfterMs,
      lastTestedAt: now,
      // A failed request leaves the last known coverage in place
      ...(coverage && {
        countryCount: coverage.countryCount,
        latestYear: coverage.latestYear ?? undefined,
      }),
      ...(args.check.kind === "notFound" && {
        countryCount: undefined,
        latestYear: undefined,
      }),
    });
  },
});

/**
 * Checks the indicators that are due (cron, every few minutes). A full
 * pass over ~29,000 indicators takes several hours the first time; after
 * that each indicator is re-checked weekly.
 */
export const checkDueIndicators = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number }> => {
    const started = Date.now();
    const codes: string[] = await ctx.runQuery(
      internal.worldbank.dueIndicatorCodes,
      { now: started, limit: CHECK_BATCH_SIZE },
    );

    let next = 0;
    let checked = 0;
    const worker = async () => {
      while (
        next < codes.length &&
        Date.now() - started < CHECK_RUN_BUDGET_MS
      ) {
        const code = codes[next++];
        const check = await checkAgainstWorldBank(code);
        await ctx.runMutation(internal.worldbank.recordIndicatorCheck, {
          code,
          check,
        });
        checked++;
      }
    };
    await Promise.all(Array.from({ length: CHECK_CONCURRENCY }, worker));

    if (codes.length > 0) {
      console.log(
        `[WorldBank check] ${checked}/${codes.length} indicators in ${Math.round((Date.now() - started) / 1000)}s`,
      );
    }
    return { checked };
  },
});

/** Checks one indicator now (see requestIndicatorCheck). */
export const checkIndicator = internalAction({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const check = await checkAgainstWorldBank(args.code);
    await ctx.runMutation(internal.worldbank.recordIndicatorCheck, {
      code: args.code,
      check,
    });
  },
});

/**
 * The map could not load an indicator (not found or no data): check it
 * now instead of waiting for its turn, so search stops offering it. The
 * client only asks; the verdict comes from the server's own request.
 */
export const requestIndicatorCheck = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const indicator = await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    const now = Date.now();
    if (
      !indicator ||
      (indicator.lastTestedAt !== undefined &&
        now - indicator.lastTestedAt < REQUESTED_CHECK_INTERVAL_MS)
    ) {
      return { scheduled: false };
    }
    await ctx.db.patch(indicator._id, { lastTestedAt: now });
    await ctx.scheduler.runAfter(0, internal.worldbank.checkIndicator, {
      code: indicator.code,
    });
    return { scheduled: true };
  },
});
