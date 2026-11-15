/**
 * Migrations (ENG-237): every one-shot migration in migrations.ts runs on
 * seeded data and is idempotent; the ones with a dry run report what they
 * would change and leave the data alone; the component migration runs
 * through the @convex-dev/migrations runner.
 */
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as migrationsModule from "../migrations";
import { NOW, OWNER, dumpAll, newTest, seedUser, type TestConvex } from "./setup.helpers";

type RegisteredMutation = { isMutation?: boolean; isInternal?: boolean; exportArgs?: () => string };

/** One-transaction internalMutations, by name, and whether they take dryRun. */
const ONE_SHOT = Object.entries(migrationsModule)
  .filter(([, fn]) => {
    const m = fn as RegisteredMutation;
    return m?.isMutation && m.isInternal;
  })
  .map(([name, fn]) => {
    const args = JSON.parse((fn as RegisteredMutation).exportArgs!()) as {
      value: Record<string, { optional: boolean }>;
    };
    return {
      name,
      takesDryRun: "dryRun" in args.value,
      componentMigration: "oneBatchOnly" in args.value,
      needsArgs: Object.values(args.value).some((arg) => !arg.optional),
    };
  })
  // Component migrations and the runner have their own tests below, and so
  // do the steps of migrations that need arguments (remapUserId.test.ts)
  .filter((m) => !m.componentMigration && !m.needsArgs && m.name !== "run");

const ref = (name: string) => makeFunctionReference<"mutation">(`migrations:${name}`);

/** Seeded data with something for each migration to do. */
async function seeded(): Promise<TestConvex> {
  const t = newTest();
  const owner = await seedUser(t, OWNER);
  await t.run(async (ctx) => {
    const loanId = owner.loans![0];
    // A scenario from before extraPerPeriod
    await ctx.db.insert("loanScenarios", {
      userId: OWNER,
      loanId,
      name: "Legacy",
      extraMonthlyPayment: 150,
      createdAt: NOW,
      updatedAt: NOW,
    });
    // Two rows for one day, from before the one-row-a-day upsert
    for (const hour of [8, 9]) {
      await ctx.db.insert("portfolioSnapshots", {
        userId: OWNER,
        timestamp: Date.UTC(2026, 10, 15, hour),
        date: "2026-11-15",
        totalAssets: 1,
        totalLiabilities: 0,
        netWorth: 1,
        source: "legacy",
      });
    }
    // A user with data but no onboarding row (markExistingUsersOnboarded)
    await ctx.db.insert("worldBankFavorites", {
      userId: "user_legacy",
      indicatorCode: "SP.POP.TOTL",
      indicatorName: "Population, total",
      addedAt: NOW,
    });
  });
  return t;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("one-shot migrations", () => {
  it("finds the migrations", () => {
    expect(ONE_SHOT.map((m) => m.name)).toEqual(
      expect.arrayContaining(["backfillSyncTargets", "collapseIntradaySnapshots"]),
    );
  });

  it.each(ONE_SHOT.map((m) => [m.name, m] as const))(
    "%s is idempotent",
    async (_, migration) => {
      const t = await seeded();
      const args = migration.takesDryRun ? { dryRun: false } : {};
      await t.mutation(ref(migration.name), args);
      const once = await dumpAll(t);
      await t.mutation(ref(migration.name), args);
      expect(await dumpAll(t)).toEqual(once);
    },
  );

  it.each(ONE_SHOT.filter((m) => m.takesDryRun).map((m) => [m.name, m] as const))(
    "%s changes nothing on a dry run",
    async (_, migration) => {
      const t = await seeded();
      const before = await dumpAll(t);
      await t.mutation(ref(migration.name), { dryRun: true });
      expect(await dumpAll(t)).toEqual(before);
    },
  );
});

describe("dry-run reports", () => {
  it("backfillSyncTargets lists the users the daily sync would miss", async () => {
    const t = await seeded();
    const dry = await t.mutation(ref("backfillSyncTargets"), { dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, inserted: [OWNER] });
    await t.mutation(ref("backfillSyncTargets"), { dryRun: false });
    expect(await t.mutation(ref("backfillSyncTargets"), { dryRun: true })).toMatchObject({
      inserted: [],
      alreadyRegistered: 1,
    });
  });

  it("collapseIntradaySnapshots keeps the newest row of the day", async () => {
    const t = await seeded();
    const dry = (await t.mutation(ref("collapseIntradaySnapshots"), {
      dryRun: true,
      userId: OWNER,
    })) as { dropped: { timestamp: number }[] };
    expect(dry.dropped.map((d) => d.timestamp)).toEqual([Date.UTC(2026, 10, 15, 8)]);
    await t.mutation(ref("collapseIntradaySnapshots"), { userId: OWNER });
    const today = await t.run((ctx) =>
      ctx.db
        .query("portfolioSnapshots")
        .withIndex("by_user_date", (q) => q.eq("userId", OWNER).eq("date", "2026-11-15"))
        .collect(),
    );
    expect(today.map((row) => row.timestamp)).toEqual([Date.UTC(2026, 10, 15, 9)]);
  });

  it("markExistingUsersOnboarded is a dry run unless told otherwise", async () => {
    const t = await seeded();
    const dry = await t.mutation(ref("markExistingUsersOnboarded"), {});
    expect(dry).toMatchObject({ dryRun: true, inserted: ["user_legacy"], alreadyCompleted: 1 });
    await t.mutation(ref("markExistingUsersOnboarded"), { dryRun: false });
    const progress = await t.run((ctx) =>
      ctx.db
        .query("onboardingProgress")
        .withIndex("by_user", (q) => q.eq("userId", "user_legacy"))
        .first(),
    );
    expect(progress?.onboardingCompleted).toBe(true);
  });

  it("backfillLoanBalanceAdjustment reports every loan without an adjustment", async () => {
    const t = await seeded();
    const dry = (await t.mutation(ref("backfillLoanBalanceAdjustment"), {
      dryRun: true,
    })) as { changed: unknown[] };
    expect(dry.changed).toHaveLength(1);
    await t.mutation(ref("backfillLoanBalanceAdjustment"), {});
    expect(
      await t.mutation(ref("backfillLoanBalanceAdjustment"), { dryRun: true }),
    ).toMatchObject({ changed: [] });
  });
});

describe("component migration: backfillLoanScenarioExtraPerPeriod", () => {
  const legacyScenarios = (t: TestConvex) =>
    t.run(async (ctx) =>
      (await ctx.db.query("loanScenarios").collect()).filter(
        (s) => s.extraMonthlyPayment !== undefined,
      ),
    );

  it("rolls a dry-run batch back", async () => {
    const t = await seeded();
    const before = await dumpAll(t);
    await expect(
      t.mutation(ref("backfillLoanScenarioExtraPerPeriod"), {
        oneBatchOnly: true,
        cursor: null,
        dryRun: true,
      }),
    ).rejects.toThrow(/DRY RUN/);
    expect(await dumpAll(t)).toEqual(before);
  });

  it("copies the legacy field through the runner, once", async () => {
    const t = await seeded();
    await t.mutation(ref("run"), { fn: "migrations:backfillLoanScenarioExtraPerPeriod" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [legacy] = await legacyScenarios(t);
    expect(legacy.extraPerPeriod).toBe(150);

    // A second run is a no-op: the component records the migration as done
    const after = await dumpAll(t);
    await t.mutation(ref("run"), { fn: "migrations:backfillLoanScenarioExtraPerPeriod" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await dumpAll(t)).toEqual(after);
  });
});
