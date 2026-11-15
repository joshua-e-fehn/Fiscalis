import { v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getUserId, requireUserId } from "./lib/auth";
import { requirePlanFeature } from "./lib/plan";
import {
  deleteTeamCascade,
  getTeamAccess,
  listTeamMembers,
  requireTeamMember,
  requireTeamPermission,
  revokeInvitesCreatedBy,
  touchTeam,
  transferOwnership,
} from "./lib/teams";
import { userError } from "./lib/userError";
import {
  MAX_OPEN_INVITES,
  MAX_OWNED_TEAMS,
  MAX_TEAM_MEMBERS,
  MAX_TEAM_NAME_LENGTH,
  TeamNameError,
  canChangeRole,
  canGrantInviteRole,
  canInvite,
  canLeave,
  canManageTeam,
  canRemoveMember,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  isInviteOpen,
  isWellFormedInviteToken,
  memberDisplayName,
  normalizeTeamName,
} from "../../services/teams/teams";

/**
 * Teams and membership (ENG-197, docs/adr/0002-teams.md). Membership and
 * invites are Convex tables, not Clerk Organizations, so the auth config
 * and JWT template stay as they are. The team aggregate queries live in
 * teamViews.ts. Every function derives the caller from the auth token.
 */

const roleValidator = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
const inviteRoleValidator = v.union(v.literal("admin"), v.literal("member"));

function teamName(name: string): string {
  try {
    return normalizeTeamName(name);
  } catch (err) {
    if (err instanceof TeamNameError) userError(err.code, { max: MAX_TEAM_NAME_LENGTH });
    throw err;
  }
}

async function callerDisplayName(ctx: MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity ? memberDisplayName(identity) : null;
}

// ─── Queries ───────────────────────────────────────────────────

/** The caller's teams with their role, for the workspace switcher. */
export const listMyTeams = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teams = await Promise.all(
      memberships.map(async (m) => {
        const team = await ctx.db.get(m.teamId);
        if (!team) return null;
        const members = await listTeamMembers(ctx, m.teamId);
        return {
          teamId: team._id,
          name: team.name,
          role: m.role,
          sharing: m.sharing,
          memberCount: members.length,
          sharingCount: members.filter((x) => x.sharing).length,
        };
      }),
    );
    return teams
      .filter((t) => t !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * One team for Settings > Team: its members (by display name, never their
 * user IDs) and, for those who may invite, its open invites. Null for a
 * non-member.
 */
export const getTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const access = await getTeamAccess(ctx, userId, teamId);
    if (!access) return null;
    const role = access.membership.role;
    const members = (await listTeamMembers(ctx, teamId))
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({
        memberId: m._id,
        displayName: m.displayName,
        role: m.role,
        sharing: m.sharing,
        joinedAt: m.joinedAt,
        isMe: m.userId === userId,
      }));
    const now = Date.now();
    const invites = canInvite(role)
      ? (
          await ctx.db
            .query("teamInvites")
            .withIndex("by_team", (q) => q.eq("teamId", teamId))
            .collect()
        )
          .filter((i) => isInviteOpen(i, now))
          .map((i) => ({
            inviteId: i._id,
            role: i.role,
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
          }))
      : [];
    return {
      team: { _id: access.team._id, name: access.team.name, createdAt: access.team.createdAt },
      myRole: role,
      mySharing: access.membership.sharing,
      members,
      invites,
    };
  },
});

/** What an invite link joins, for the join page; null when it is not usable. */
export const previewInvite = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getUserId(ctx);
    if (!userId || !isWellFormedInviteToken(token)) return null;
    const tokenHash = await hashInviteToken(token);
    const invite = await ctx.db
      .query("teamInvites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite || !isInviteOpen(invite, Date.now())) return null;
    const team = await ctx.db.get(invite.teamId);
    if (!team) return null;
    const access = await getTeamAccess(ctx, userId, team._id);
    return { teamName: team.name, role: invite.role, alreadyMember: access !== null };
  },
});

// ─── Team lifecycle ────────────────────────────────────────────

/** Creates a team owned by the caller (Pro). The owner does not share until they opt in. */
export const createTeam = mutation({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<Id<"teams">> => {
    const userId = await requireUserId(ctx);
    await requirePlanFeature(ctx, userId, "teams");
    const name = teamName(args.name);
    const owned = await ctx.db
      .query("teams")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (owned.length >= MAX_OWNED_TEAMS) userError("teamOwnedLimit", { max: MAX_OWNED_TEAMS });
    const now = Date.now();
    const teamId = await ctx.db.insert("teams", { userId, name, createdAt: now, updatedAt: now });
    await ctx.db.insert("teamMembers", {
      teamId,
      userId,
      role: "owner",
      displayName: await callerDisplayName(ctx),
      sharing: false,
      joinedAt: now,
    });
    return teamId;
  },
});

export const renameTeam = mutation({
  args: { teamId: v.id("teams"), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTeamPermission(ctx, userId, args.teamId, canManageTeam);
    await ctx.db.patch(args.teamId, { name: teamName(args.name), updatedAt: Date.now() });
  },
});

/** Deletes the team, its memberships and invites. Nobody's own data is touched. */
export const deleteTeam = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await requireUserId(ctx);
    await requireTeamPermission(ctx, userId, teamId, canManageTeam);
    await deleteTeamCascade(ctx, teamId);
  },
});

// ─── Own membership ────────────────────────────────────────────

/** Opts the caller's data in to (or out of) the team aggregate; takes effect at once. */
export const setSharing = mutation({
  args: { teamId: v.id("teams"), sharing: v.boolean() },
  handler: async (ctx, { teamId, sharing }) => {
    const userId = await requireUserId(ctx);
    const { membership } = await requireTeamMember(ctx, userId, teamId);
    await ctx.db.patch(membership._id, { sharing });
    await touchTeam(ctx, teamId);
  },
});

export const leaveTeam = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await requireUserId(ctx);
    const { membership } = await requireTeamMember(ctx, userId, teamId);
    if (!canLeave(membership.role)) userError("teamOwnerCannotLeave");
    await ctx.db.delete(membership._id);
    await revokeInvitesCreatedBy(ctx, teamId, userId);
    await touchTeam(ctx, teamId);
  },
});

// ─── Managing members ──────────────────────────────────────────

/** A membership of a team the caller belongs to, with the caller's own. */
async function memberInCallersTeam(
  ctx: MutationCtx,
  userId: string,
  memberId: Id<"teamMembers">,
) {
  const target = await ctx.db.get(memberId);
  if (!target) userError("teamMemberNotFound");
  const access = await getTeamAccess(ctx, userId, target.teamId);
  // A membership of someone else's team reads like a missing one
  if (!access) userError("teamMemberNotFound");
  return { target, ...access };
}

export const removeMember = mutation({
  args: { memberId: v.id("teamMembers") },
  handler: async (ctx, { memberId }) => {
    const userId = await requireUserId(ctx);
    const { target, membership } = await memberInCallersTeam(ctx, userId, memberId);
    if (!canRemoveMember(membership.role, target.role)) userError("teamPermissionDenied");
    await ctx.db.delete(target._id);
    // Otherwise a removed admin could rejoin through a link they created
    await revokeInvitesCreatedBy(ctx, target.teamId, target.userId);
    await touchTeam(ctx, target.teamId);
  },
});

/** Changes a member's role; "owner" transfers ownership (the caller becomes an admin). */
export const changeRole = mutation({
  args: { memberId: v.id("teamMembers"), role: roleValidator },
  handler: async (ctx, { memberId, role }) => {
    const userId = await requireUserId(ctx);
    const { target, membership, team } = await memberInCallersTeam(ctx, userId, memberId);
    if (!canChangeRole(membership.role, target.role, role)) userError("teamPermissionDenied");
    if (role === "owner") {
      await transferOwnership(ctx, team, target);
    } else {
      await ctx.db.patch(target._id, { role });
      if (!canInvite(role)) await revokeInvitesCreatedBy(ctx, team._id, target.userId);
      await touchTeam(ctx, team._id);
    }
  },
});

// ─── Invites ───────────────────────────────────────────────────

/**
 * Creates a shareable invite link (email sending is off until Resend is
 * set up). The token comes from the runtime CSPRNG, so this is an action;
 * only its hash is stored and the token is returned once.
 */
export const createInvite = action({
  args: { teamId: v.id("teams"), role: inviteRoleValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ inviteId: Id<"teamInvites">; token: string; expiresAt: number }> => {
    const userId = await requireUserId(ctx);
    const token = generateInviteToken();
    const { inviteId, expiresAt } = await ctx.runMutation(internal.teams.insertInvite, {
      userId,
      teamId: args.teamId,
      role: args.role,
      tokenHash: await hashInviteToken(token),
    });
    return { inviteId, token, expiresAt };
  },
});

export const insertInvite = internalMutation({
  args: {
    userId: v.string(),
    teamId: v.id("teams"),
    role: inviteRoleValidator,
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const { team, membership } = await requireTeamMember(ctx, args.userId, args.teamId);
    if (!canGrantInviteRole(membership.role, args.role)) userError("teamPermissionDenied");
    // Teams are the owner's Pro feature: an admin invites while the owner is on Pro
    await requirePlanFeature(ctx, team.userId, "teams");

    const now = Date.now();
    const invites = await ctx.db
      .query("teamInvites")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    let open = 0;
    for (const invite of invites) {
      if (isInviteOpen(invite, now)) open++;
      else await ctx.db.delete(invite._id);
    }
    if (open >= MAX_OPEN_INVITES) userError("teamInviteLimit", { max: MAX_OPEN_INVITES });

    const expiresAt = inviteExpiry(now);
    const inviteId = await ctx.db.insert("teamInvites", {
      teamId: args.teamId,
      userId: args.userId,
      tokenHash: args.tokenHash,
      role: args.role,
      createdAt: now,
      expiresAt,
    });
    await touchTeam(ctx, args.teamId);
    return { inviteId, expiresAt };
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("teamInvites") },
  handler: async (ctx, { inviteId }) => {
    const userId = await requireUserId(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite) userError("teamInviteInvalid");
    const access = await getTeamAccess(ctx, userId, invite.teamId);
    if (!access) userError("teamInviteInvalid");
    if (!canInvite(access.membership.role)) userError("teamPermissionDenied");
    await ctx.db.delete(inviteId);
    await touchTeam(ctx, invite.teamId);
  },
});

/**
 * Joins the team of an invite link. The invite is used up; the new member
 * does not share until they opt in. Joining needs no Pro plan.
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<Id<"teams">> => {
    const userId = await requireUserId(ctx);
    if (!isWellFormedInviteToken(token)) userError("teamInviteInvalid");
    const tokenHash = await hashInviteToken(token);
    const invite = await ctx.db
      .query("teamInvites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite || !isInviteOpen(invite, Date.now())) userError("teamInviteInvalid");
    const team = await ctx.db.get(invite.teamId);
    if (!team) userError("teamInviteInvalid");
    if (await getTeamAccess(ctx, userId, team._id)) userError("teamAlreadyMember");
    const members = await listTeamMembers(ctx, team._id);
    if (members.length >= MAX_TEAM_MEMBERS) userError("teamMemberLimit", { max: MAX_TEAM_MEMBERS });

    await ctx.db.insert("teamMembers", {
      teamId: team._id,
      userId,
      role: invite.role,
      displayName: await callerDisplayName(ctx),
      sharing: false,
      joinedAt: Date.now(),
    });
    await ctx.db.delete(invite._id);
    await touchTeam(ctx, team._id);
    return team._id;
  },
});
