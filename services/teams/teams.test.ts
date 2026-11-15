import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_MS,
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
  invitePath,
  inviteTokenFromHash,
  isInviteOpen,
  isWellFormedInviteToken,
  memberDisplayName,
  normalizeTeamName,
  pickSuccessor,
  type MemberLike,
} from "./teams";

describe("normalizeTeamName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeTeamName("  The   Household ")).toBe("The Household");
  });

  it("rejects empty and overlong names with a code", () => {
    expect(() => normalizeTeamName("   ")).toThrow(TeamNameError);
    try {
      normalizeTeamName("x".repeat(MAX_TEAM_NAME_LENGTH + 1));
    } catch (e) {
      expect((e as TeamNameError).code).toBe("teamNameTooLong");
    }
    expect(normalizeTeamName("x".repeat(MAX_TEAM_NAME_LENGTH))).toHaveLength(MAX_TEAM_NAME_LENGTH);
  });
});

describe("permissions", () => {
  it("lets owners and admins invite, members not", () => {
    expect(canInvite("owner")).toBe(true);
    expect(canInvite("admin")).toBe(true);
    expect(canInvite("member")).toBe(false);
  });

  it("lets only the owner invite admins", () => {
    expect(canGrantInviteRole("owner", "admin")).toBe(true);
    expect(canGrantInviteRole("admin", "admin")).toBe(false);
    expect(canGrantInviteRole("admin", "member")).toBe(true);
    expect(canGrantInviteRole("member", "member")).toBe(false);
  });

  it("never removes the owner; admins remove plain members only", () => {
    expect(canRemoveMember("owner", "admin")).toBe(true);
    expect(canRemoveMember("owner", "member")).toBe(true);
    expect(canRemoveMember("admin", "member")).toBe(true);
    expect(canRemoveMember("admin", "admin")).toBe(false);
    expect(canRemoveMember("admin", "owner")).toBe(false);
    expect(canRemoveMember("member", "member")).toBe(false);
  });

  it("lets only the owner change roles, never their own", () => {
    expect(canChangeRole("owner", "member", "admin")).toBe(true);
    expect(canChangeRole("owner", "admin", "owner")).toBe(true);
    expect(canChangeRole("owner", "owner", "admin")).toBe(false);
    expect(canChangeRole("owner", "member", "member")).toBe(false);
    expect(canChangeRole("admin", "member", "admin")).toBe(false);
  });

  it("makes the owner transfer or delete instead of leaving", () => {
    expect(canLeave("owner")).toBe(false);
    expect(canLeave("admin")).toBe(true);
    expect(canLeave("member")).toBe(true);
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(false);
  });
});

describe("pickSuccessor", () => {
  const members: MemberLike[] = [
    { userId: "owner", role: "owner", joinedAt: 1 },
    { userId: "late-admin", role: "admin", joinedAt: 30 },
    { userId: "early-member", role: "member", joinedAt: 2 },
    { userId: "early-admin", role: "admin", joinedAt: 20 },
  ];

  it("prefers the longest-standing admin", () => {
    expect(pickSuccessor(members, "owner")?.userId).toBe("early-admin");
  });

  it("falls back to the longest-standing member", () => {
    const noAdmins = members.filter((m) => m.role !== "admin");
    expect(pickSuccessor(noAdmins, "owner")?.userId).toBe("early-member");
  });

  it("is null when the owner is alone", () => {
    expect(pickSuccessor([members[0]], "owner")).toBeNull();
  });
});

describe("invite tokens", () => {
  it("generates distinct well-formed tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(isWellFormedInviteToken(a)).toBe(true);
    expect(isWellFormedInviteToken("fis_" + a.slice(4))).toBe(false);
    expect(isWellFormedInviteToken(a + "x")).toBe(false);
  });

  it("hashes to hex SHA-256", async () => {
    const hash = await hashInviteToken("fti_abc");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashInviteToken("fti_abc")).toBe(hash);
  });

  it("expires after the TTL", () => {
    const expiresAt = inviteExpiry(1000);
    expect(expiresAt).toBe(1000 + INVITE_TTL_MS);
    expect(isInviteOpen({ expiresAt }, expiresAt - 1)).toBe(true);
    expect(isInviteOpen({ expiresAt }, expiresAt)).toBe(false);
  });

  it("puts the token in the link's fragment and reads it back", () => {
    const token = generateInviteToken();
    const path = invitePath(token);
    expect(path).toBe(`/settings/team/join#${token}`);
    expect(inviteTokenFromHash(`#${token}`)).toBe(token);
    expect(inviteTokenFromHash("#nonsense")).toBeNull();
    expect(inviteTokenFromHash("")).toBeNull();
  });
});

describe("memberDisplayName", () => {
  it("uses the name, else the email's local part", () => {
    expect(memberDisplayName({ name: " Alex Doe ", email: "a@x.de" })).toBe("Alex Doe");
    expect(memberDisplayName({ email: "sam@example.com" })).toBe("sam");
    expect(memberDisplayName({})).toBeNull();
  });
});
