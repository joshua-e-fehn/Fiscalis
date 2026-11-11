import type { GenericId } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, TableNames } from "../_generated/dataModel";

/**
 * Identity helpers for public functions. The user is always derived from the
 * auth token (Clerk `subject`), never taken from client-supplied args — the
 * same pattern as `portfolio.ts` / `apiKeys.ts`.
 */

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;

/** The signed-in user's ID, or null when the request is unauthenticated. */
export async function getUserId(ctx: AuthCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/** The signed-in user's ID; throws when the request is unauthenticated. */
export async function requireUserId(ctx: AuthCtx): Promise<string> {
  const userId = await getUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

type OwnedTable = {
  [T in TableNames]: Doc<T> extends { userId: string } ? T : never;
}[TableNames];

/**
 * Loads a document only if it belongs to `userId`. A foreign document is
 * indistinguishable from a missing one, so callers can't probe other users'
 * IDs.
 */
export async function getOwnedDoc<T extends OwnedTable>(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  id: GenericId<T>,
): Promise<Doc<T> | null> {
  const doc = (await ctx.db.get(id)) as (Doc<T> & { userId: string }) | null;
  if (!doc || doc.userId !== userId) return null;
  return doc;
}
