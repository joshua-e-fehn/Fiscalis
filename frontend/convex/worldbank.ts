// ═══════════════════════════════════════════════════════════════
// World Bank Indicators - Convex Functions
// Syncs all ~29,000 World Bank indicators for instant search
// ═══════════════════════════════════════════════════════════════

import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";

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
    includeErrored: v.optional(v.boolean()),
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

    // Filter out errored indicators unless explicitly included
    const filtered = args.includeErrored
      ? results
      : results.filter((ind) => ind.status !== "error");

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

      // Penalize errored/warning indicators slightly
      if (ind.status === "error") score *= 0.5;
      if (ind.status === "warning") score *= 0.8;

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
        status: ind.status,
        timeoutCount: ind.timeoutCount,
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

    // Get counts from the last sync status instead of counting all documents
    // This avoids reading all 29,000+ indicators
    const indicatorCount = status?.indicatorCount ?? 0;

    // Warning and error counts are typically small, but we'll use .take() to limit
    // This prevents memory issues when all indicators might match (e.g., all have status "ok")
    const warningIndicators = await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_status", (q) => q.eq("status", "warning"))
      .take(1000);

    const errorIndicators = await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_status", (q) => q.eq("status", "error"))
      .take(1000);

    return {
      lastSync: status?.lastFullSync,
      indicatorCount,
      warningCount: warningIndicators.length,
      errorCount: errorIndicators.length,
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
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const favorites = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return favorites.map((fav) => ({
      code: fav.indicatorCode,
      name: fav.indicatorName,
      description: fav.indicatorDescription,
      addedAt: fav.addedAt,
    }));
  },
});

/**
 * Check if an indicator is favorited by user
 */
export const isIndicatorFavorited = query({
  args: {
    userId: v.string(),
    indicatorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const favorite = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", args.userId).eq("indicatorCode", args.indicatorCode),
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
    userId: v.string(),
    indicatorCode: v.string(),
    indicatorName: v.string(),
    indicatorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already favorited
    const existing = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", args.userId).eq("indicatorCode", args.indicatorCode),
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("worldBankFavorites", {
      userId: args.userId,
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
    userId: v.string(),
    indicatorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const favorite = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", args.userId).eq("indicatorCode", args.indicatorCode),
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
    userId: v.string(),
    indicatorCode: v.string(),
    indicatorName: v.string(),
    indicatorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("worldBankFavorites")
      .withIndex("by_user_indicator", (q) =>
        q.eq("userId", args.userId).eq("indicatorCode", args.indicatorCode),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { isFavorited: false };
    }

    await ctx.db.insert("worldBankFavorites", {
      userId: args.userId,
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
        // Update existing - preserve timeout tracking
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
          status: "ok",
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
      console.error(`Error fetching page ${args.page}:`, error);
      return null;
    }
  },
});

/**
 * Main sync action - fetches all indicators from World Bank API
 * Can be called manually or scheduled via cron
 * This is internal for cron, but we also expose a public wrapper
 */
export const syncAllIndicatorsInternal = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ success: boolean; indicatorCount: number; message: string }> => {
    const startTime = Date.now();
    let totalIndicators = 0;
    let failedPages: number[] = [];

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

/**
 * Public wrapper for manual sync (can be called from HTTP)
 */
export const syncAllIndicators = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ success: boolean; indicatorCount: number; message: string }> => {
    return await ctx.runAction(
      internal.worldbank.syncAllIndicatorsInternal,
      {},
    );
  },
});

// ═══════════════════════════════════════════════════════════════
// Timeout Tracking
// ═══════════════════════════════════════════════════════════════

/**
 * Record a timeout for an indicator
 * Called from frontend when an indicator fails to load
 */
export const recordIndicatorTimeout = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const indicator = await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!indicator) {
      return { updated: false, message: "Indicator not found" };
    }

    const newTimeoutCount = indicator.timeoutCount + 1;
    let newStatus: "ok" | "warning" | "error" = "ok";

    if (newTimeoutCount >= 3) {
      newStatus = "error";
    } else if (newTimeoutCount >= 1) {
      newStatus = "warning";
    }

    await ctx.db.patch(indicator._id, {
      timeoutCount: newTimeoutCount,
      status: newStatus,
      lastTestedAt: Date.now(),
    });

    return {
      updated: true,
      newStatus,
      timeoutCount: newTimeoutCount,
    };
  },
});

/**
 * Record a successful load for an indicator
 * Resets timeout count (but keeps a memory of past issues)
 */
export const recordIndicatorSuccess = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const indicator = await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!indicator) {
      return { updated: false };
    }

    // Only update if there were previous timeouts
    if (indicator.timeoutCount > 0) {
      // Decrement timeout count but don't go below 0
      const newTimeoutCount = Math.max(0, indicator.timeoutCount - 1);
      let newStatus: "ok" | "warning" | "error" = "ok";

      if (newTimeoutCount >= 3) {
        newStatus = "error";
      } else if (newTimeoutCount >= 1) {
        newStatus = "warning";
      }

      await ctx.db.patch(indicator._id, {
        timeoutCount: newTimeoutCount,
        status: newStatus,
        lastTestedAt: Date.now(),
      });
    }

    return { updated: true };
  },
});

/**
 * Get indicator by code (for checking status before fetching)
 */
export const getIndicatorByCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("worldBankIndicators")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});
