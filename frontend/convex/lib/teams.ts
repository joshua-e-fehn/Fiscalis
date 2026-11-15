import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { userError } from "./userError";
import {
  pickSuccessor,
  type TeamRole,
} from "../../../services/teams/teams";

/**
 * Team read access (ENG-197, docs/adr/0002-teams.md). These helpers are
 * the only way a function reaches another user's data: through a team the
 * caller belongs to, read-only, and only for members who share. They sit
 * beside lib/auth.ts getOwnedDoc and never replace it; every mutation of
 * user data keeps its owner check.
 */

type DbCtx = QueryCtx | MutationCtx;

export interface TeamAccess {
  team: Doc<"teams">;
  membership: Doc<"teamMembers">;
}

/** The caller's membership of `teamId`, or null (a missing team reads the same). */
export async function getTeamAccess(
  ctx: DbCtx,
  userId: string,
  teamId: Id<"teams">,
): Promise<TeamAccess | null> {
  const team = await ctx.db.get(teamId);
  if (!team) return null;
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
    .unique();
  return membership ? { team, membership } : null;
}

/** As getTeamAccess; throws teamNotFound for a non-member. */
export async function requireTeamMember(
  ctx: DbCtx,
  userId: string,
  teamId: Id<"teams">,
): Promise<TeamAccess> {
  const access = await getTeamAccess(ctx, userId, teamId);
  if (!access) userError("teamNotFound");
  return access;
}

/** As requireTeamMember; throws teamPermissionDenied when `allowed` says no. */
export async function requireTeamPermission(
  ctx: DbCtx,
  userId: string,
  teamId: Id<"teams">,
  allowed: (role: TeamRole) => boolean,
): Promise<TeamAccess> {
  const access = await requireTeamMember(ctx, userId, teamId);
  if (!allowed(access.membership.role)) userError("teamPermissionDenied");
  return access;
}

export async function listTeamMembers(
  ctx: DbCtx,
  teamId: Id<"teams">,
): Promise<Doc<"teamMembers">[]> {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
}

/**
 * The members whose data a member of `teamId` may read: those who opted in
 * to share. Throws teamNotFound unless `viewerId` is a member, so a
 * non-member learns nothing, not even who shares.
 */
export async function readableTeamMembers(
  ctx: QueryCtx,
  viewerId: string,
  teamId: Id<"teams">,
): Promise<{ team: Doc<"teams">; members: Doc<"teamMembers">[] }> {
  const { team } = await requireTeamMember(ctx, viewerId, teamId);
  const members = (await listTeamMembers(ctx, teamId)).filter((m) => m.sharing);
  return { team, members };
}

/** Marks a membership change on the team, so its owner's document records it. */
export async function touchTeam(ctx: MutationCtx, teamId: Id<"teams">): Promise<void> {
  await ctx.db.patch(teamId, { updatedAt: Date.now() });
}

/**
 * Deletes the open invites `userId` created for `teamId`. Called when they
 * lose the right to invite (removed, left, demoted to member), so a link
 * they still hold cannot bring them, or anyone they gave it to, back in.
 */
export async function revokeInvitesCreatedBy(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  userId: string,
): Promise<void> {
  const invites = await ctx.db
    .query("teamInvites")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  for (const i of invites) if (i.userId === userId) await ctx.db.delete(i._id);
}

/** Deletes a team with its memberships and invites. */
export async function deleteTeamCascade(
  ctx: MutationCtx,
  teamId: Id<"teams">,
): Promise<void> {
  for (const m of await listTeamMembers(ctx, teamId)) await ctx.db.delete(m._id);
  const invites = await ctx.db
    .query("teamInvites")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  for (const i of invites) await ctx.db.delete(i._id);
  await ctx.db.delete(teamId);
}

/** Makes `next` the owner of `team`; the previous owner becomes an admin. */
export async function transferOwnership(
  ctx: MutationCtx,
  team: Doc<"teams">,
  next: Doc<"teamMembers">,
): Promise<void> {
  const previous = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) => q.eq("teamId", team._id).eq("userId", team.userId))
    .unique();
  if (previous) await ctx.db.patch(previous._id, { role: "admin" });
  await ctx.db.patch(next._id, { role: "owner" });
  await ctx.db.patch(team._id, { userId: next.userId, updatedAt: Date.now() });
}

/**
 * Account deletion (account.ts purgeUserData): every team the user owns
 * goes to its longest-standing admin, else member (services/teams
 * pickSuccessor), or is deleted when the user is alone in it. The user's
 * memberships and invites are then removed by the regular purge.
 */
export async function releaseOwnedTeams(ctx: MutationCtx, userId: string): Promise<void> {
  const owned = await ctx.db
    .query("teams")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const team of owned) {
    const successor = pickSuccessor(await listTeamMembers(ctx, team._id), userId);
    if (successor) await transferOwnership(ctx, team, successor);
    else await deleteTeamCascade(ctx, team._id);
  }
}
