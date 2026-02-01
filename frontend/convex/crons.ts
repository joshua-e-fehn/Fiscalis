// ═══════════════════════════════════════════════════════════════
// Convex Scheduled Jobs (Cron)
// ═══════════════════════════════════════════════════════════════

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ═══════════════════════════════════════════════════════════════
// World Bank Indicator Sync
// Runs every Sunday at 3:00 AM UTC
// ═══════════════════════════════════════════════════════════════
crons.weekly(
  "sync-worldbank-indicators",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.worldbank.syncAllIndicatorsInternal,
);

// ═══════════════════════════════════════════════════════════════
// Crypto Connection Sync (Vezgo)
// Runs every 6 hours to keep crypto data fresh
// ═══════════════════════════════════════════════════════════════
crons.interval(
  "sync-crypto-connections",
  { hours: 6 },
  internal.actions.vezgo.scheduledSyncAllAction,
);

export default crons;
