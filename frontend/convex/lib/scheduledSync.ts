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
