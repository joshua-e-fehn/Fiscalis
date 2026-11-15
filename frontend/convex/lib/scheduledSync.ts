// ═══════════════════════════════════════════════════════════════
// Scheduled provider syncs are opt-in per deployment
// ═══════════════════════════════════════════════════════════════

/**
 * Whether this deployment's crons may call the account providers
 * (Plaid, SnapTrade, Bitpanda).
 *
 * Production sets SCHEDULED_SYNC_ENABLED=true. Dev deployments leave
 * it unset: they may hold a copy of real data and the same encryption
 * key, so unguarded crons there would sync the real accounts a second
 * time.
 */
export function scheduledSyncEnabled(): boolean {
  return process.env.SCHEDULED_SYNC_ENABLED === "true";
}

/**
 * Whether this deployment uploads finished days of metal price ticks to
 * object storage: the METAL_ARCHIVE_* settings archiveConfig in
 * convex/actions/metalPriceArchive.ts requires are all set. Without them
 * the archive cron skips, so its freshness check does not apply.
 */
export function metalArchiveEnabled(): boolean {
  return [
    "METAL_ARCHIVE_BUCKET",
    "METAL_ARCHIVE_REGION",
    "METAL_ARCHIVE_ACCESS_KEY_ID",
    "METAL_ARCHIVE_SECRET_ACCESS_KEY",
  ].every((name) => Boolean(process.env[name]));
}

/**
 * Whether this deployment must archive: METAL_ARCHIVE_REQUIRED=true, or a
 * production deployment (SCHEDULED_SYNC_ENABLED=true). There a missing
 * METAL_ARCHIVE_* setting fails /health/deep instead of skipping the check.
 */
export function metalArchiveRequired(): boolean {
  return process.env.METAL_ARCHIVE_REQUIRED === "true" || scheduledSyncEnabled();
}

/** Object key prefix of the metal price archive (METAL_ARCHIVE_PREFIX). */
export function metalArchivePrefix(): string {
  return process.env.METAL_ARCHIVE_PREFIX ?? "metal-prices";
}
