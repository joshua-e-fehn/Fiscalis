// ═══════════════════════════════════════════════════════════════
// Convex Scheduled Jobs (Cron)
// ═══════════════════════════════════════════════════════════════

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ═══════════════════════════════════════════════════════════════
// Daily Portfolio Sync & Snapshot
// Runs every day at 6:00 AM UTC
// Syncs all providers (Plaid, Snaptrade, Vezgo) for all users
// and creates portfolio snapshots for performance tracking
// ═══════════════════════════════════════════════════════════════
crons.daily(
  "daily-portfolio-sync",
  { hourUTC: 6, minuteUTC: 0 },
  internal.actions.syncAll.scheduledDailySync,
);

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
