/**
 * Teams (ENG-197, docs/adr/0002-teams.md): Pro-gated creation and
 * invites, single-use hashed invite links, roles, opt-in sharing, and the
 * account-deletion hand-off. Team membership never loosens an owner check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { INTRUDER, NOW, OWNER, newTest, seedUser, type TestConvex } from "./setup.helpers";

const PARTNER = "user_partner";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function grantPro(t: TestConvex, userId: string) {
  await t.run((ctx) =>
    ctx.db.insert("planGrants", { userId, plan: "pro", reason: "complimentary", grantedAt: NOW }),
  );
}

async function setup() {
  const t = newTest();
  await grantPro(t, OWNER);
  const owner = t.withIdentity({ subject: OWNER, name: "Olivia Owner" });
  const partner = t.withIdentity({ subject: PARTNER, email: "pat@example.com" });
  const intruder = t.withIdentity({ subject: INTRUDER });
  return { t, owner, partner, intruder };
}

type Caller = Awaited<ReturnType<typeof setup>>["owner"];

/** A team owned by OWNER with PARTNER joined through an invite link. */
async function teamWithPartner() {
  const s = await setup();
  const teamId = await s.owner.mutation(api.teams.createTeam, { name: "  Household " });
  const { token } = await s.owner.action(api.teams.createInvite, { teamId, role: "member" });
  await s.partner.mutation(api.teams.acceptInvite, { token });
  return { ...s, teamId };
}

async function memberIdOf(caller: Caller, teamId: Id<"teams">, name: string | null) {
  const team = await caller.query(api.teams.getTeam, { teamId });
  return team!.members.find((m) => m.displayName === name)!.memberId;
}

describe("creating teams", () => {
  it("needs Pro", async () => {
    const { partner } = await setup();
    await expect(partner.mutation(api.teams.createTeam, { name: "Ours" })).rejects.toThrow(
      /planTeamsRequirePro/,
    );
  });

  it("makes the creator owner, not sharing until they opt in", async () => {
    const { owner } = await setup();
    const teamId = await owner.mutation(api.teams.createTeam, { name: "  Household " });
    const team = await owner.query(api.teams.getTeam, { teamId });
    expect(team).toMatchObject({ team: { name: "Household" }, myRole: "owner", mySharing: false });
    expect(team!.members).toEqual([
      expect.objectContaining({ displayName: "Olivia Owner", role: "owner", sharing: false, isMe: true }),
    ]);
    expect(await owner.query(api.teams.listMyTeams, {})).toEqual([
      expect.objectContaining({ teamId, role: "owner", memberCount: 1, sharingCount: 0 }),
    ]);
  });

  it("rejects an empty name", async () => {
    const { owner } = await setup();
    await expect(owner.mutation(api.teams.createTeam, { name: " " })).rejects.toThrow(
      /teamNameRequired/,
    );
  });
});

describe("invite links", () => {
  it("stores only the token's hash and joins once", async () => {
    const { t, owner, partner, intruder } = await setup();
    const teamId = await owner.mutation(api.teams.createTeam, { name: "Household" });
    const { token } = await owner.action(api.teams.createInvite, { teamId, role: "member" });

    const stored = await t.run((ctx) => ctx.db.query("teamInvites").collect());
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token);

    expect(await partner.query(api.teams.previewInvite, { token })).toEqual({
      teamName: "Household",
      role: "member",
      alreadyMember: false,
    });
    await partner.mutation(api.teams.acceptInvite, { token });
    // Used up: a second person cannot reuse it
    await expect(intruder.mutation(api.teams.acceptInvite, { token })).rejects.toThrow(
      /teamInviteInvalid/,
    );
    const team = await partner.query(api.teams.getTeam, { teamId });
    expect(team!.members.map((m) => [m.displayName, m.role, m.sharing])).toEqual([
      ["Olivia Owner", "owner", false],
      ["pat", "member", false],
    ]);
    // Members do not see open invites
    expect(team!.invites).toEqual([]);
  });

  it("expires after seven days", async () => {
    const { owner, partner } = await setup();
    const teamId = await owner.mutation(api.teams.createTeam, { name: "Household" });
    const { token } = await owner.action(api.teams.createInvite, { teamId, role: "member" });
    vi.setSystemTime(NOW + 7 * 24 * 60 * 60 * 1000 + 60_000);
    expect(await partner.query(api.teams.previewInvite, { token })).toBeNull();
    await expect(partner.mutation(api.teams.acceptInvite, { token })).rejects.toThrow(
      /teamInviteInvalid/,
    );
  });

  it("can be revoked", async () => {
    const { owner, partner } = await setup();
    const teamId = await owner.mutation(api.teams.createTeam, { name: "Household" });
    const { token, inviteId } = await owner.action(api.teams.createInvite, { teamId, role: "admin" });
    await owner.mutation(api.teams.revokeInvite, { inviteId });
    await expect(partner.mutation(api.teams.acceptInvite, { token })).rejects.toThrow(
      /teamInviteInvalid/,
    );
  });

  it("are created by owners and admins only, and need the owner's Pro", async () => {
    const { t, owner, partner, teamId } = await teamWithPartner();
    await expect(partner.action(api.teams.createInvite, { teamId, role: "member" })).rejects.toThrow(
      /teamPermissionDenied/,
    );
    const partnerId = await memberIdOf(owner, teamId, "pat");
    await owner.mutation(api.teams.changeRole, { memberId: partnerId, role: "admin" });
    // An admin (on Free) invites members into the Pro owner's team, but not admins
    await partner.action(api.teams.createInvite, { teamId, role: "member" });
    await expect(partner.action(api.teams.createInvite, { teamId, role: "admin" })).rejects.toThrow(
      /teamPermissionDenied/,
    );
    // Without the owner's Pro, no new invites
    await t.run(async (ctx) => {
      for (const g of await ctx.db.query("planGrants").collect()) await ctx.db.delete(g._id);
    });
    await expect(owner.action(api.teams.createInvite, { teamId, role: "member" })).rejects.toThrow(
      /planTeamsRequirePro/,
    );
  });

  it("are refused for a team the caller is not in", async () => {
    const { intruder, teamId } = await teamWithPartner();
    await expect(intruder.action(api.teams.createInvite, { teamId, role: "member" })).rejects.toThrow(
      /teamNotFound/,
    );
  });
});

describe("roles and membership", () => {
  it("transfers ownership through changeRole", async () => {
    const { t, owner, partner, teamId } = await teamWithPartner();
    const partnerId = await memberIdOf(owner, teamId, "pat");
    await owner.mutation(api.teams.changeRole, { memberId: partnerId, role: "owner" });
    expect((await t.run((ctx) => ctx.db.get(teamId)))!.userId).toBe(PARTNER);
    expect((await owner.query(api.teams.getTeam, { teamId }))!.myRole).toBe("admin");
    expect((await partner.query(api.teams.getTeam, { teamId }))!.myRole).toBe("owner");
  });

  it("lets members leave, but not the owner", async () => {
    const { owner, partner, teamId } = await teamWithPartner();
    await expect(owner.mutation(api.teams.leaveTeam, { teamId })).rejects.toThrow(
      /teamOwnerCannotLeave/,
    );
    await partner.mutation(api.teams.leaveTeam, { teamId });
    expect(await partner.query(api.teams.getTeam, { teamId })).toBeNull();
  });

  it("lets only the owner remove members and delete the team", async () => {
    const { t, owner, partner, teamId } = await teamWithPartner();
    const ownerId = await memberIdOf(owner, teamId, "Olivia Owner");
    await expect(partner.mutation(api.teams.removeMember, { memberId: ownerId })).rejects.toThrow(
      /teamPermissionDenied/,
    );
    await expect(partner.mutation(api.teams.deleteTeam, { teamId })).rejects.toThrow(
      /teamPermissionDenied/,
    );
    await owner.mutation(api.teams.removeMember, { memberId: await memberIdOf(owner, teamId, "pat") });
    expect(await partner.query(api.teams.listMyTeams, {})).toEqual([]);
    await owner.mutation(api.teams.deleteTeam, { teamId });
    expect(await t.run((ctx) => ctx.db.query("teamMembers").collect())).toEqual([]);
  });

  it("toggles the caller's own sharing only", async () => {
    const { owner, partner, teamId } = await teamWithPartner();
    await partner.mutation(api.teams.setSharing, { teamId, sharing: true });
    const team = await owner.query(api.teams.getTeam, { teamId });
    expect(team!.members.map((m) => m.sharing)).toEqual([false, true]);
    await partner.mutation(api.teams.setSharing, { teamId, sharing: false });
    expect((await owner.query(api.teams.listMyTeams, {}))[0].sharingCount).toBe(0);
  });

  it("hides a team and its members from non-members", async () => {
    const { intruder, teamId } = await teamWithPartner();
    expect(await intruder.query(api.teams.getTeam, { teamId })).toBeNull();
    await expect(intruder.mutation(api.teams.setSharing, { teamId, sharing: true })).rejects.toThrow(
      /teamNotFound/,
    );
  });
});

describe("a member cannot change another member's data", () => {
  it("keeps every owner check: a sharing member's loan stays theirs", async () => {
    const { t, owner, partner, teamId } = await teamWithPartner();
    const ownerData = await seedUser(t, OWNER);
    await owner.mutation(api.teams.setSharing, { teamId, sharing: true });
    const loanId = ownerData.loans![0] as Id<"loans">;
    await expect(partner.mutation(api.loans.deleteLoan, { loanId })).rejects.toThrow();
    await expect(
      partner.mutation(api.loans.updateLoan, { loanId, name: "Mine now" }),
    ).rejects.toThrow();
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan).toMatchObject({ userId: OWNER });
    expect(loan!.name).not.toBe("Mine now");
  });
});

describe("account deletion", () => {
  async function purge(t: TestConvex, userId: string) {
    await t.mutation(internal.account.purgeUserData, {
      userId,
      tableIndex: 0,
      deleteClerkUser: false,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  }

  it("hands an owned team to the longest-standing admin", async () => {
    const { t, owner, teamId } = await teamWithPartner();
    const { token } = await owner.action(api.teams.createInvite, { teamId, role: "admin" });
    vi.setSystemTime(NOW + 1000);
    await t.withIdentity({ subject: INTRUDER, name: "Ian" }).mutation(api.teams.acceptInvite, { token });

    await purge(t, OWNER);

    const team = await t.run((ctx) => ctx.db.get(teamId));
    expect(team!.userId).toBe(INTRUDER);
    const members = await t.run((ctx) => ctx.db.query("teamMembers").collect());
    expect(members.map((m) => [m.userId, m.role]).sort()).toEqual([
      [INTRUDER, "owner"],
      [PARTNER, "member"],
    ]);
  });

  it("deletes a team its owner was alone in, with its invites", async () => {
    const { t, owner } = await setup();
    const teamId = await owner.mutation(api.teams.createTeam, { name: "Solo" });
    await owner.action(api.teams.createInvite, { teamId, role: "member" });
    await purge(t, OWNER);
    expect(await t.run((ctx) => ctx.db.get(teamId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("teamInvites").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("teamMembers").collect())).toEqual([]);
  });

  it("removes a member's membership and leaves the team", async () => {
    const { t, teamId } = await teamWithPartner();
    await purge(t, PARTNER);
    const members = await t.run((ctx) => ctx.db.query("teamMembers").collect());
    expect(members.map((m) => m.userId)).toEqual([OWNER]);
    expect((await t.run((ctx) => ctx.db.get(teamId)))!.userId).toBe(OWNER);
  });
});
