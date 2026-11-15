/**
 * Rules for migrations:remapUserId (frontend/convex/migrations.ts), which
 * moves one user's documents from one Clerk user ID (the auth token's
 * `subject`, `user_...`) to another when the same person signs in through
 * a different Clerk instance (development -> production gives them a new
 * ID).
 *
 * The tables it rewrites are services/privacy/userData.ts USER_DATA_TABLES
 * (every table with a `userId`, each with a by_user index; userData.test.ts
 * and convex/account.ts check that list against the schema).
 * clerkUserIdRemap.test.ts additionally fails when the schema gains a field
 * with an identity-like name (owner, createdBy, subject, tokenIdentifier,
 * issuer, clerk, ...UserId) that is neither `userId` nor listed in
 * KEPT_CLERK_ID_FIELDS, so a Clerk ID stored under another name cannot be
 * missed.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

/**
 * Fields that hold a Clerk user ID but must NOT be remapped. SnapTrade's
 * user was registered with the Clerk ID as its identifier
 * (actions/snaptrade.ts registerUser); it is SnapTrade's key for that user
 * from then on, so it stays the old ID. The app reaches it through
 * snaptradeUsers.userId, which is remapped.
 */
export const KEPT_CLERK_ID_FIELDS = [
  { table: "snaptradeUsers", field: "snaptradeUserId" },
  { table: "brokerConnections", field: "snaptradeUserId" },
] as const;

/** Documents patched per remap mutation. */
export const REMAP_BATCH_SIZE = 100;

/** Documents read per page when counting. */
export const REMAP_COUNT_PAGE_SIZE = 500;

/** Whether `id` has the shape of a Clerk user ID (`user_` + base62). */
export function isClerkUserId(id: string): boolean {
  return /^user_[A-Za-z0-9]{10,}$/.test(id);
}

/**
 * Why a remap from `from` to `to` must not start, or null when it may.
 * Collisions (documents that already belong to `to`) are checked
 * separately, since they need the database.
 */
export function remapArgsRefusal(from: string, to: string): string | null {
  if (from.trim() === "") return "`from` is empty";
  if (from === to) return "`from` and `to` are the same ID";
  if (!isClerkUserId(to)) {
    return `\`to\` (${JSON.stringify(to)}) does not look like a Clerk user ID (user_...)`;
  }
  return null;
}

/** Tables with at least one document, as `table: count`, for messages. */
export function describeCounts(counts: Record<string, number>): string {
  const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
  if (nonEmpty.length === 0) return "none";
  return nonEmpty.map(([table, n]) => `${table}: ${n}`).join(", ");
}
