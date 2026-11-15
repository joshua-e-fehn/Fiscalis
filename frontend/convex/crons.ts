// ═══════════════════════════════════════════════════════════════
// Convex Scheduled Jobs (Cron)
// ═══════════════════════════════════════════════════════════════

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import {
  BITPANDA_TICKER_REFRESH_MINUTES,
  SNAPTRADE_QUOTES_CRON,
} from "../../services/pricing/livePrices";

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
// Live Provider Prices (ENG-239, services/pricing/livePrices.ts)
// Every 10 minutes: Bitpanda's public ticker into assetPrices, then the
// Bitpanda holdings a live feed covers (no key, every deployment).
// Hourly 07:05-20:05 UTC on weekdays: SnapTrade quotes for held symbols,
// within a per-user token bucket, only with SCHEDULED_SYNC_ENABLED=true.
// ═══════════════════════════════════════════════════════════════
crons.interval(
  "refresh-bitpanda-ticker",
  { minutes: BITPANDA_TICKER_REFRESH_MINUTES },
  internal.actions.livePrices.refreshBitpandaTicker,
);

crons.cron(
  "refresh-snaptrade-quotes",
  SNAPTRADE_QUOTES_CRON,
  internal.actions.livePrices.refreshSnaptradeQuotes,
  {},
);

// ═══════════════════════════════════════════════════════════════
// Metal Prices
// Every minute: record a gold.de snapshot (all metals in EUR/USD/CHF plus
// the EUR/USD and EUR/CHF rates) as a tick, the hour/day closes every
// chart reads, and the spot mirror server-side net worth values vault
// items with. Daily at 00:15 UTC: upload each finished day's ticks to the
// object-storage archive. Daily at 04:00 UTC: prune archived ticks past
// their retention window (unarchived ticks are never pruned).
// ═══════════════════════════════════════════════════════════════
crons.interval(
  "ingest-metal-prices",
  { minutes: 1 },
  internal.metalPrices.ingestGoldDe,
);

crons.daily(
  "archive-metal-price-ticks",
  { hourUTC: 0, minuteUTC: 15 },
  internal.actions.metalPriceArchive.archiveTicks,
);

crons.daily(
  "prune-metal-price-ticks",
  { hourUTC: 4, minuteUTC: 0 },
  internal.metalPrices.pruneTicks,
);

// ═══════════════════════════════════════════════════════════════
// FX Rates
// Every 6 hours from 05:30 UTC: mirror the last days of EUR-base rates used
// to convert every provider value to the base currency. Fails softly and
// keeps the stored rates when a source is unreachable. The 05:30
// run precedes the 6:00 daily sync, so the sync converts at the latest rate.
// ═══════════════════════════════════════════════════════════════
crons.cron(
  "refresh-fx-rates",
  "30 5,11,17,23 * * *",
  internal.fxRates.refreshFxRates,
  {},
);

// ═══════════════════════════════════════════════════════════════
// Sync Run Ledger
// Daily at 04:30 UTC: delete syncRuns rows older than 90 days
// (services/health/syncRuns.ts SYNC_RUN_RETENTION_MS)
// ═══════════════════════════════════════════════════════════════
crons.daily(
  "prune-sync-runs",
  { hourUTC: 4, minuteUTC: 30 },
  internal.syncRuns.pruneRuns,
);

export default crons;
