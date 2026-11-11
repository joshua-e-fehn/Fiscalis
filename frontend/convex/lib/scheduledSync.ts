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
