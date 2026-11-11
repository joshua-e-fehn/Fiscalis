// ═══════════════════════════════════════════════════════════════
// Convex Scheduled Jobs (Cron)
// ═══════════════════════════════════════════════════════════════

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ═══════════════════════════════════════════════════════════════
// Daily Portfolio Sync & Snapshot
// Runs every day at 6:00 AM UTC
// Syncs all providers (Plaid, Snaptrade, Bitpanda) for all users
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
// Bitpanda Connection Sync
// Runs every 6 hours to keep Bitpanda holdings fresh
// ═══════════════════════════════════════════════════════════════
crons.interval(
  "sync-bitpanda-connections",
  { hours: 6 },
  internal.actions.bitpanda.scheduledSyncAllAction,
);

// ═══════════════════════════════════════════════════════════════
// Metal Spot Prices
// Every 15 minutes: mirror latest spot prices so server-side net worth
// (snapshots + public API) values vault items at market
// ═══════════════════════════════════════════════════════════════
crons.interval(
  "refresh-metal-spot-prices",
  { minutes: 15 },
  internal.metalPrices.refreshSpotPrices,
);

// ═══════════════════════════════════════════════════════════════
// FX Rates
// Every 6 hours from 05:30 UTC: mirror the last days of EUR-base rates used
// to convert every provider value to the base currency. Fails softly and
// keeps the stored rates when the app's FX route is unreachable. The 05:30
// run precedes the 6:00 daily sync, so the sync converts at the latest rate.
// ═══════════════════════════════════════════════════════════════
crons.cron(
  "refresh-fx-rates",
  "30 5,11,17,23 * * *",
  internal.fxRates.refreshFxRates,
  {},
);

export default crons;
