// ═══════════════════════════════════════════════════════════════
// World Bank Sync API
// Endpoints for triggering and monitoring indicator sync
// ═══════════════════════════════════════════════════════════════

import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const worldbankSync = new Hono();

// Initialize Convex client
const getConvexClient = () => {
  const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!deploymentUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(deploymentUrl);
};

/**
 * POST /api/worldbank/sync
 * Trigger a full sync of World Bank indicators
 */
worldbankSync.post("/sync", async (c) => {
  try {
    const client = getConvexClient();

    // Note: Convex actions return FunctionReference results
    // We call the action via the HTTP client
    const result = await client.action(api.worldbank.syncAllIndicators, {});

    return c.json({
      success: result.success,
      indicatorCount: result.indicatorCount,
      message: result.message,
    });
  } catch (error) {
    console.error("[WorldBank Sync] Error:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * GET /api/worldbank/sync/status
 * Get current sync status
 */
worldbankSync.get("/sync/status", async (c) => {
  try {
    const client = getConvexClient();
    const status = await client.query(api.worldbank.getSyncStatus, {});

    return c.json(status);
  } catch (error) {
    console.error("[WorldBank Sync] Status error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

export default worldbankSync;
