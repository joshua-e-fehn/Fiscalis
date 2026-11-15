/**
 * Team workspace reads (ENG-197): the aggregate covers exactly the sharing
 * members, rows name their owner and carry no edit handle, and a
 * non-member reads nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
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

async function household() {
  const t = newTest();
  await seedUser(t, OWNER);
  await seedUser(t, PARTNER);
  await seedUser(t, INTRUDER);
  await t.run((ctx) =>
    ctx.db.insert("planGrants", { userId: OWNER, plan: "pro", reason: "complimentary", grantedAt: NOW }),
  );
  const owner = t.withIdentity({ subject: OWNER, name: "Olivia" });
  const partner = t.withIdentity({ subject: PARTNER, name: "Pat" });
  const intruder = t.withIdentity({ subject: INTRUDER });
  const teamId = await owner.mutation(api.teams.createTeam, { name: "Household" });
  const { token } = await owner.action(api.teams.createInvite, { teamId, role: "member" });
  await partner.mutation(api.teams.acceptInvite, { token });
  return { t, owner, partner, intruder, teamId };
}

async function share(caller: ReturnType<TestConvex["withIdentity"]>, teamId: Id<"teams">, sharing = true) {
  await caller.mutation(api.teams.setSharing, { teamId, sharing });
}

describe("team aggregate", () => {
  it("sums the net worth of the sharing members only", async () => {
    const { owner, partner, teamId } = await household();
    const mine = (await owner.query(api.portfolio.getOverview, {}))!;
    const theirs = (await partner.query(api.portfolio.getOverview, {}))!;

    // Nobody shares yet
    expect((await owner.query(api.teamViews.getOverview, { teamId }))!.netWorth).toBe(0);

    await share(owner, teamId);
    const one = (await partner.query(api.teamViews.getOverview, { teamId }))!;
    expect(one.netWorth).toBeCloseTo(mine.netWorth, 6);
    expect(one.members).toEqual([
      expect.objectContaining({ displayName: "Olivia", isMe: false }),
    ]);

    await share(partner, teamId);
    const both = (await owner.query(api.teamViews.getOverview, { teamId }))!;
    expect(both.netWorth).toBeCloseTo(mine.netWorth + theirs.netWorth, 6);
    expect(both.totalAssets).toBeCloseTo(mine.totalAssets + theirs.totalAssets, 6);
    expect(both.team.name).toBe("Household");

    // Revoking takes effect at once
    await share(partner, teamId, false);
    expect((await owner.query(api.teamViews.getOverview, { teamId }))!.netWorth).toBeCloseTo(
      mine.netWorth,
      6,
    );
  });

  it("labels positions by owner and drops edit handles", async () => {
    const { owner, partner, teamId } = await household();
    await share(owner, teamId);
    await share(partner, teamId);
    const rows = await owner.query(api.teamViews.getUnifiedPositions, { teamId });
    const personal = await owner.query(api.portfolio.getUnifiedPositions, {});
    expect(rows.length).toBe(personal.length * 2);
    const names = new Set(rows.map((r) => r.owner?.displayName));
    expect(names).toEqual(new Set(["Olivia", "Pat"]));
    for (const row of rows) {
      expect(row.classification).toBeUndefined();
      if (row.valuation) expect(row.valuation.canOverride).toBe(false);
    }
    const mineInTeam = rows.filter((r) => r.owner?.isMe).map((r) => r._id).sort();
    expect(mineInTeam).toEqual(personal.map((p) => p._id).sort());
  });

  it("serves the category pages over all sharing members", async () => {
    const { owner, partner, teamId } = await household();
    await share(owner, teamId);
    await share(partner, teamId);
    const mine = (await owner.query(api.categories.getEquities, {}))!;
    const team = (await partner.query(api.teamViews.getCategoryPositions, { teamId, category: "equities" }))!;
    expect(team.summary.value).toBeCloseTo(mine.summary.value * 2, 6);
    expect(team.positions).toHaveLength(mine.positions.length * 2);
    expect(team.positions.every((p) => p.owner !== null)).toBe(true);

    const cash = (await owner.query(api.teamViews.getCashHoldings, { teamId }))!;
    const myCash = (await owner.query(api.categories.getCashHoldings, {}))!;
    expect(cash.summary.totalValue).toBeCloseTo(myCash.summary.totalValue * 2, 6);
    expect(cash.bankAccounts.every((a) => a.owner !== null)).toBe(true);

    const debts = (await owner.query(api.teamViews.getLiabilities, { teamId }))!;
    const myDebts = (await owner.query(api.categories.getLiabilities, {}))!;
    expect(debts.summary.totalLiabilities).toBeCloseTo(myDebts.summary.totalLiabilities * 2, 6);
    expect(debts.rows.every((r) => r.owner !== null)).toBe(true);
  });

  it("sums the members' snapshot histories per day", async () => {
    const { t, owner, partner, teamId } = await household();
    await share(owner, teamId);
    await share(partner, teamId);
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query("portfolioSnapshots").collect()) await ctx.db.delete(s._id);
      const row = (userId: string, day: number, netWorth: number) =>
        ctx.db.insert("portfolioSnapshots", {
          userId,
          timestamp: NOW - (3 - day) * 86_400_000,
          date: new Date(NOW - (3 - day) * 86_400_000).toISOString().slice(0, 10),
          totalAssets: netWorth,
          totalLiabilities: 0,
          netWorth,
          source: "test",
        });
      await row(OWNER, 0, 100);
      await row(OWNER, 2, 130);
      await row(PARTNER, 1, 40);
    });
    const series = await owner.query(api.teamViews.getSnapshots, { teamId });
    expect(series.map((s) => s.netWorth)).toEqual([100, 140, 170]);
  });
});

describe("non-members", () => {
  it("cannot read any team view", async () => {
    const { owner, intruder, teamId } = await household();
    await share(owner, teamId);
    const calls = [
      intruder.query(api.teamViews.getOverview, { teamId }),
      intruder.query(api.teamViews.getUnifiedPositions, { teamId }),
      intruder.query(api.teamViews.getSnapshots, { teamId }),
      intruder.query(api.teamViews.getCashHoldings, { teamId }),
      intruder.query(api.teamViews.getLiabilities, { teamId }),
      intruder.query(api.teamViews.getCategoryPositions, { teamId, category: "equities" }),
    ];
    for (const call of calls) await expect(call).rejects.toThrow(/teamNotFound/);
  });

  it("lose access when removed", async () => {
    const { owner, partner, teamId } = await household();
    await share(owner, teamId);
    const team = (await owner.query(api.teams.getTeam, { teamId }))!;
    const pat = team.members.find((m) => m.displayName === "Pat")!;
    await owner.mutation(api.teams.removeMember, { memberId: pat.memberId });
    await expect(partner.query(api.teamViews.getOverview, { teamId })).rejects.toThrow(/teamNotFound/);
  });
});
