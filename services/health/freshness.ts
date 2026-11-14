/**
 * Feed and cron freshness for GET /health/deep (frontend/convex/http.ts).
 *
 * Each check compares the age of the newest record a scheduled job writes
 * with a threshold a little above the job's cadence:
 *
 * - metal-price-ticks: the minutely gold.de ingest (convex/metalPrices.ts)
 * - metal-price-archive: the 00:15 UTC upload of the finished day
 *   (convex/actions/metalPriceArchive.ts); yesterday must be archived by
 *   01:00 UTC, which is the same as the newest archived day having ended at
 *   most 25 hours ago
 * - fx-rates: the last successful refresh (convex/fxRates.ts, every 6 hours
 *   at 05:30, 11:30, 17:30 and 23:30 UTC)
 * - provider-sync: the last successful scheduled provider sync
 *   (convex/actions/syncAll.ts, daily at 06:00 UTC); only on deployments
 *   with SCHEDULED_SYNC_ENABLED=true
 *
 * Only aggregate ages leave here, never user data. Framework-free: imported
 * by Convex functions and vitest.
 */

import { utcDayEnd } from "../finance/currency";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The ingest runs every minute; ten missed minutes is an outage. */
export const METAL_TICK_MAX_AGE_MS = 10 * MINUTE_MS;
/** The archive runs at 00:15 UTC; yesterday must be in by 01:00 UTC. */
export const METAL_ARCHIVE_GRACE_MS = 1 * HOUR_MS;
/** The FX refresh runs every 6 hours; one missed run is tolerated briefly. */
export const FX_REFRESH_MAX_AGE_MS = 8 * HOUR_MS;
/** The provider sync runs daily; two hours of slack for a slow fan-out. */
export const PROVIDER_SYNC_MAX_AGE_MS = 26 * HOUR_MS;

export const HEALTH_CHECK_NAMES = [
  "metal-price-ticks",
  "metal-price-archive",
  "fx-rates",
  "provider-sync",
] as const;
export type HealthCheckName = (typeof HEALTH_CHECK_NAMES)[number];

export interface HealthCheck {
  name: HealthCheckName;
  ok: boolean;
  /** Seconds since the newest record; null when there is none */
  ageSeconds: number | null;
  /** Largest healthy age, in seconds */
  threshold: number;
  /** Set when the check does not apply to this deployment (ok is true) */
  skipped?: true;
}

export interface HealthReport {
  ok: boolean;
  checks: HealthCheck[];
}

/** The newest record behind each check (epoch ms), read with indexes. */
export interface FreshnessInputs {
  /** timestamp of the newest metalPriceTicks row */
  newestTickAt: number | null;
  /** day (YYYY-MM-DD) of the newest metalPriceArchive row */
  newestArchivedDay: string | null;
  /** Last successful FX refresh */
  fxRefreshedAt: number | null;
  /** Last successful scheduled provider sync */
  providerSyncedAt: number | null;
}

/** Which checks apply to this deployment (from its env vars). */
export interface FreshnessConfig {
  /** METAL_ARCHIVE_* set: the archive cron uploads */
  archiveEnabled: boolean;
  /** SCHEDULED_SYNC_ENABLED=true: the provider sync cron runs */
  scheduledSyncEnabled: boolean;
}

function ageCheck(
  name: HealthCheckName,
  at: number | null,
  maxAgeMs: number,
  now: number,
): HealthCheck {
  const threshold = Math.round(maxAgeMs / 1000);
  if (at === null || !Number.isFinite(at)) {
    return { name, ok: false, ageSeconds: null, threshold };
  }
  // A clock-skewed future record counts as fresh, not negative
  const ageMs = Math.max(0, now - at);
  return {
    name,
    ok: ageMs <= maxAgeMs,
    ageSeconds: Math.round(ageMs / 1000),
    threshold,
  };
}

function skippedCheck(name: HealthCheckName, maxAgeMs: number): HealthCheck {
  return {
    name,
    ok: true,
    ageSeconds: null,
    threshold: Math.round(maxAgeMs / 1000),
    skipped: true,
  };
}

/** Evaluate every check at `now` (epoch ms); ok only when all are. */
export function evaluateFreshness(
  inputs: FreshnessInputs,
  config: FreshnessConfig,
  now: number,
): HealthReport {
  // The archive's age runs from the end of its newest day: yesterday's
  // entry is at most a day old, the day before's passes 25 hours at 01:00.
  const archiveMaxAgeMs = DAY_MS + METAL_ARCHIVE_GRACE_MS;
  const checks: HealthCheck[] = [
    ageCheck("metal-price-ticks", inputs.newestTickAt, METAL_TICK_MAX_AGE_MS, now),
    config.archiveEnabled
      ? ageCheck(
          "metal-price-archive",
          inputs.newestArchivedDay === null
            ? null
            : utcDayEnd(inputs.newestArchivedDay),
          archiveMaxAgeMs,
          now,
        )
      : skippedCheck("metal-price-archive", archiveMaxAgeMs),
    ageCheck("fx-rates", inputs.fxRefreshedAt, FX_REFRESH_MAX_AGE_MS, now),
    config.scheduledSyncEnabled
      ? ageCheck("provider-sync", inputs.providerSyncedAt, PROVIDER_SYNC_MAX_AGE_MS, now)
      : skippedCheck("provider-sync", PROVIDER_SYNC_MAX_AGE_MS),
  ];
  return { ok: checks.every((c) => c.ok), checks };
}
