// ═══════════════════════════════════════════════════════════════
// World Bank Sync API
// Read-only sync status. The sync itself is internal: it runs weekly via
// cron, or manually with `npx convex run worldbank:syncAllIndicatorsInternal`.
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
