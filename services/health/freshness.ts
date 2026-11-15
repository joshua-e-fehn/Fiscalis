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
 *   most 25 hours ago. Where the archive is required (production) but its
 *   METAL_ARCHIVE_* settings are missing, it fails: nothing leaves Convex.
 * - metal-price-coverage: once yesterday is archived, its file must hold
 *   at least METAL_COVERAGE_MIN_ROWS of the day's 1440 minutes
 * - fx-rates: the last successful refresh (convex/fxRates.ts, every 6 hours
 *   at 05:30, 11:30, 17:30 and 23:30 UTC)
 * - provider-sync: the last successful scheduled provider sync
 *   (convex/actions/syncAll.ts, daily at 06:00 UTC); only on deployments
 *   with SCHEDULED_SYNC_ENABLED=true
 *
 * The tick and archive checks are critical: when they fail, minutes of
 * price history are being lost or are at risk of being pruned unarchived.
 * The others are warnings.
 *
 * Only aggregate ages and counts leave here, never user data. Framework-free: imported
 * by Convex functions and vitest.
 */

import { utcDayEnd } from "../finance/currency";
import { utcDay } from "../finance/metalPriceFeed";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The ingest runs every minute; ten missed minutes is an outage. */
export const METAL_TICK_MAX_AGE_MS = 10 * MINUTE_MS;
/** The archive runs at 00:15 UTC; yesterday must be in by 01:00 UTC. */
export const METAL_ARCHIVE_GRACE_MS = 1 * HOUR_MS;
/** A full UTC day has 1440 minutes; 60 or more missing is a gap. */
export const METAL_COVERAGE_MIN_ROWS = 1380;
/** The FX refresh runs every 6 hours; one missed run is tolerated briefly. */
export const FX_REFRESH_MAX_AGE_MS = 8 * HOUR_MS;
/** The provider sync runs daily; two hours of slack for a slow fan-out. */
export const PROVIDER_SYNC_MAX_AGE_MS = 26 * HOUR_MS;

export const HEALTH_CHECK_NAMES = [
  "metal-price-ticks",
  "metal-price-archive",
  "metal-price-coverage",
  "fx-rates",
  "provider-sync",
] as const;
export type HealthCheckName = (typeof HEALTH_CHECK_NAMES)[number];

export type HealthSeverity = "critical" | "warning";

/** Critical checks guard against price history being lost. */
export const HEALTH_CHECK_SEVERITY: Readonly<Record<HealthCheckName, HealthSeverity>> = {
  "metal-price-ticks": "critical",
  "metal-price-archive": "critical",
  "metal-price-coverage": "warning",
  "fx-rates": "warning",
  "provider-sync": "warning",
};

export interface HealthCheck {
  name: HealthCheckName;
  ok: boolean;
  severity: HealthSeverity;
  /** Seconds since the newest record; null when there is none or n/a */
  ageSeconds: number | null;
  /** Largest healthy age in seconds (coverage: fewest healthy rows) */
  threshold: number;
  /** Set when the check does not apply right now (ok is true) */
  skipped?: true;
  /** Short human-readable context, e.g. "2026-11-13: 1379 rows" */
  detail?: string;
}

export interface HealthReport {
  ok: boolean;
  /** Some critical check is failing */
  critical: boolean;
  checks: HealthCheck[];
}

/** The newest record behind each check (epoch ms), read with indexes. */
export interface FreshnessInputs {
  /** timestamp of the newest metalPriceTicks row */
  newestTickAt: number | null;
  /** day (YYYY-MM-DD) of the newest metalPriceArchive row */
  newestArchivedDay: string | null;
  /** rows of that metalPriceArchive row */
  newestArchivedRows: number | null;
  /** Last successful FX refresh */
  fxRefreshedAt: number | null;
  /** Last successful scheduled provider sync */
  providerSyncedAt: number | null;
}

/** Which checks apply to this deployment (from its env vars). */
export interface FreshnessConfig {
  /** METAL_ARCHIVE_* set: the archive cron uploads */
  archiveEnabled: boolean;
  /** This deployment must archive (production): a missing config fails */
  archiveRequired: boolean;
  /** SCHEDULED_SYNC_ENABLED=true: the provider sync cron runs */
  scheduledSyncEnabled: boolean;
}

const seconds = (ms: number) => Math.round(ms / 1000);

function ageCheck(
  name: HealthCheckName,
  at: number | null,
  maxAgeMs: number,
  now: number,
): HealthCheck {
  const threshold = seconds(maxAgeMs);
  const severity = HEALTH_CHECK_SEVERITY[name];
  if (at === null || !Number.isFinite(at)) {
    return { name, ok: false, severity, ageSeconds: null, threshold };
  }
  // A clock-skewed future record counts as fresh, not negative
  const ageMs = Math.max(0, now - at);
  return {
    name,
    ok: ageMs <= maxAgeMs,
    severity,
    ageSeconds: seconds(ageMs),
    threshold,
  };
}

function skippedCheck(name: HealthCheckName, threshold: number): HealthCheck {
  return {
    name,
    ok: true,
    severity: HEALTH_CHECK_SEVERITY[name],
    ageSeconds: null,
    threshold,
    skipped: true,
  };
}

/**
 * Yesterday archived by 01:00 UTC. Without the METAL_ARCHIVE_* settings the
 * check is skipped, unless the deployment requires the archive: then the
 * off-site copy has silently stopped, which is critical.
 */
function archiveCheck(
  inputs: FreshnessInputs,
  config: FreshnessConfig,
  maxAgeMs: number,
  now: number,
): HealthCheck {
  const name = "metal-price-archive";
  if (!config.archiveEnabled) {
    if (!config.archiveRequired) return skippedCheck(name, seconds(maxAgeMs));
    return {
      name,
      ok: false,
      severity: HEALTH_CHECK_SEVERITY[name],
      ageSeconds: null,
      threshold: seconds(maxAgeMs),
      detail: "archive not configured",
    };
  }
  return ageCheck(
    name,
    inputs.newestArchivedDay === null ? null : utcDayEnd(inputs.newestArchivedDay),
    maxAgeMs,
    now,
  );
}

/**
 * Rows in yesterday's archive file. Only judged once yesterday is the
 * newest archived day: before that the archive check reports the delay.
 */
function coverageCheck(
  inputs: FreshnessInputs,
  archiveEnabled: boolean,
  now: number,
): HealthCheck {
  const name = "metal-price-coverage";
  const threshold = METAL_COVERAGE_MIN_ROWS;
  const yesterday = utcDay(now - DAY_MS);
  if (!archiveEnabled || inputs.newestArchivedDay !== yesterday) {
    return skippedCheck(name, threshold);
  }
  const rows = inputs.newestArchivedRows ?? 0;
  return {
    name,
    ok: rows >= threshold,
    severity: HEALTH_CHECK_SEVERITY[name],
    ageSeconds: null,
    threshold,
    detail: `${yesterday}: ${rows} rows`,
  };
}

/**
 * Evaluate every check at `now` (epoch ms); ok only when all are, critical
 * when a critical one fails.
 */
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
    archiveCheck(inputs, config, archiveMaxAgeMs, now),
    coverageCheck(inputs, config.archiveEnabled, now),
    ageCheck("fx-rates", inputs.fxRefreshedAt, FX_REFRESH_MAX_AGE_MS, now),
    config.scheduledSyncEnabled
      ? ageCheck("provider-sync", inputs.providerSyncedAt, PROVIDER_SYNC_MAX_AGE_MS, now)
      : skippedCheck("provider-sync", seconds(PROVIDER_SYNC_MAX_AGE_MS)),
  ];
  return {
    ok: checks.every((c) => c.ok),
    critical: checks.some((c) => !c.ok && c.severity === "critical"),
    checks,
  };
}
