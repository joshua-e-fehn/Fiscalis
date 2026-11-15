import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Tables whose rows make a user a target of the daily sync: a provider
 * connection to refresh, or manual assets/liabilities whose value moves
 * (vault spot prices, loan schedules, exchange rates of a foreign manual
 * asset) and so needs a daily snapshot.
 */
export const SYNC_SOURCE_TABLES = [
  "plaidItems",
  "brokerConnections",
  "bitpandaConnections",
  "vaultItems",
  "loans",
  "manualAssets",
] as const;

type UserTable =
  | (typeof SYNC_SOURCE_TABLES)[number]
  | "userSettings"
  | "retirementPlans"
  | "portfolioSnapshots"
  | "apiKeys"
  | "worldBankFavorites"
  | "onboardingProgress";

/**
 * Register a user for the daily sync. Called wherever a row of a
 * SYNC_SOURCE_TABLES table is inserted; idempotent.
 */
export async function ensureSyncTarget(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  const existing = await ctx.db
    .query("syncTargets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!existing) {
    await ctx.db.insert("syncTargets", { userId, createdAt: Date.now() });
  }
}

/** Whether the user still has a row in any SYNC_SOURCE_TABLES table. */
export async function hasSyncableData(
  ctx: QueryCtx,
  userId: string,
): Promise<boolean> {
  for (const table of SYNC_SOURCE_TABLES) {
    const row = await ctx.db
      .query(table)
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) return true;
  }
  return false;
}

/**
 * Distinct userIds of the given tables via a skip scan over each by_user
 * index: one read per (table, user) instead of a full .collect(), so large
 * tables such as portfolioSnapshots stay inside the per-transaction read
 * limits. For migrations; the cron reads syncTargets instead.
 */
export async function distinctUserIds(
  ctx: QueryCtx,
  tables: readonly UserTable[],
): Promise<Set<string>> {
  const userIds = new Set<string>();
  for (const table of tables) {
    let row = await ctx.db.query(table).withIndex("by_user").first();
    while (row) {
      const userId = row.userId;
      userIds.add(userId);
      row = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.gt("userId", userId))
        .first();
    }
  }
  return userIds;
}
