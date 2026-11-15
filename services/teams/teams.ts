/**
 * Teams (ENG-197, docs/adr/0002-teams.md): a household or small group that
 * views the aggregate of its members' shared data, read-only. Data stays
 * owned by each user; a team only grants other members read access to the
 * data of members who opted in to share it.
 *
 * The rules here (roles, limits, names, invite tokens, ownership hand-off)
 * are enforced by frontend/convex/teams.ts and frontend/convex/lib/teams.ts.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */
import { hashApiKey, toBase64Url } from "../apiKeys/apiKeyService";

export const TEAM_ROLES = ["owner", "admin", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Roles an invite can grant: ownership is only ever transferred. */
export const INVITE_ROLES = ["admin", "member"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** Teams one user may own. */
export const MAX_OWNED_TEAMS = 5;
/** Members of one team, the owner included. */
export const MAX_TEAM_MEMBERS = 10;
/** Open (unexpired) invites of one team. */
export const MAX_OPEN_INVITES = 10;
/** Upper bound on a team's name. */
export const MAX_TEAM_NAME_LENGTH = 48;
/** An invite link works for seven days, once. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Names ─────────────────────────────────────────────────────

export class TeamNameError extends Error {
  constructor(readonly code: "teamNameRequired" | "teamNameTooLong") {
    super(code);
    this.name = "TeamNameError";
  }
}

/** The trimmed name, or a TeamNameError. */
export function normalizeTeamName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new TeamNameError("teamNameRequired");
  if (trimmed.length > MAX_TEAM_NAME_LENGTH) throw new TeamNameError("teamNameTooLong");
  return trimmed;
}

// ─── Permissions ───────────────────────────────────────────────

const RANK: Record<TeamRole, number> = { owner: 3, admin: 2, member: 1 };

/** Owners and admins invite (and revoke invites). */
export function canInvite(role: TeamRole): boolean {
  return RANK[role] >= RANK.admin;
}

/** An invite may grant at most the inviter's own role below owner. */
export function canGrantInviteRole(actor: TeamRole, granted: InviteRole): boolean {
  return canInvite(actor) && (actor === "owner" || granted === "member");
}

/**
 * Whether `actor` may remove `target` from the team: the owner removes
 * anyone else, an admin removes plain members. Leaving is separate.
 */
export function canRemoveMember(actor: TeamRole, target: TeamRole): boolean {
  if (target === "owner") return false;
  return actor === "owner" || (actor === "admin" && target === "member");
}

/**
 * Whether `actor` may change `target`'s role to `next`. Only the owner
 * changes roles; making someone owner transfers ownership (the owner
 * becomes an admin).
 */
export function canChangeRole(actor: TeamRole, target: TeamRole, next: TeamRole): boolean {
  return actor === "owner" && target !== "owner" && next !== target;
}

/** The owner hands the team over (or deletes it) instead of leaving. */
export function canLeave(role: TeamRole): boolean {
  return role !== "owner";
}

/** Only the owner renames or deletes the team. */
export function canManageTeam(role: TeamRole): boolean {
  return role === "owner";
}

// ─── Ownership hand-off (account deletion) ─────────────────────

export interface MemberLike {
  userId: string;
  role: TeamRole;
  joinedAt: number;
}

/**
 * Who takes over a team when its owner's account is deleted: the
 * longest-standing admin, else the longest-standing member; null when the
 * owner is alone, and the team is deleted.
 */
export function pickSuccessor<M extends MemberLike>(
  members: readonly M[],
  leavingUserId: string,
): M | null {
  const others = members
    .filter((m) => m.userId !== leavingUserId)
    .sort((a, b) => RANK[b.role] - RANK[a.role] || a.joinedAt - b.joinedAt);
  return others[0] ?? null;
}

// ─── Invite tokens ─────────────────────────────────────────────

/** Marks an invite token (and keeps it apart from API keys). */
export const INVITE_TOKEN_PREFIX = "fti_";
const INVITE_TOKEN_BYTES = 32;
const INVITE_TOKEN_PATTERN = new RegExp(
  `^${INVITE_TOKEN_PREFIX}[A-Za-z0-9_-]{${Math.ceil((INVITE_TOKEN_BYTES * 4) / 3)}}$`,
);

/** A new invite token from the platform CSPRNG (call it in an action). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return INVITE_TOKEN_PREFIX + toBase64Url(bytes);
}

export function isWellFormedInviteToken(value: string): boolean {
  return INVITE_TOKEN_PATTERN.test(value);
}

/**
 * Hex SHA-256 of a token, the only form stored. 256 bits of entropy make a
 * fast hash enough, as for API keys (apiKeyService.ts hashApiKey).
 */
export const hashInviteToken: (token: string) => Promise<string> = hashApiKey;

export function inviteExpiry(nowMs: number): number {
  return nowMs + INVITE_TTL_MS;
}

export function isInviteOpen(invite: { expiresAt: number }, nowMs: number): boolean {
  return invite.expiresAt > nowMs;
}

/** The invite link's path; the token sits in the fragment, never sent to a server. */
export function invitePath(token: string): string {
  return `/settings/team/join#${token}`;
}

/** The token of an invite link's fragment ("#fti_..."), or null. */
export function inviteTokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/, "").trim();
  return isWellFormedInviteToken(token) ? token : null;
}

// ─── Labels ────────────────────────────────────────────────────

/**
 * The name other members see, from the identity at join time: the full
 * name, else the email's local part; null when the token has neither (the
 * app then shows a generic label).
 */
export function memberDisplayName(identity: {
  name?: string;
  email?: string;
}): string | null {
  const name = identity.name?.trim();
  if (name) return name.slice(0, 80);
  const local = identity.email?.split("@")[0]?.trim();
  return local ? local.slice(0, 80) : null;
}
