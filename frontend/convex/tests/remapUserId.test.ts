/**
 * migrations:remapUserId: moves every document of one Clerk user ID to
 * another (Clerk development -> production instance), in self-scheduling
 * batches, and refuses unsafe arguments.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import {
  REMAP_BATCH_SIZE,
  REMAP_COUNT_PAGE_SIZE,
} from "../../../services/auth/clerkUserIdRemap";
import { USER_DATA_TABLE_NAMES } from "../../../services/privacy/userData";
import { INTRUDER, NOW, OWNER, dumpAll, newTest, seedUser, type TestConvex } from "./setup.helpers";

const NEW_ID = "user_2prodInstanceIdABCDEF";

type Report = {
  dryRun: boolean;
  total: number;
  counts: Record<string, number>;
  collisions: Record<string, number>;
  scheduled: boolean;
};

const remap = (t: TestConvex, args: { from: string; to: string; dryRun?: boolean; force?: boolean }) =>
  t.action(internal.migrations.remapUserId, args) as Promise<Report>;

/** `userId`'s documents per user data table. */
const owned = (t: TestConvex, userId: string) =>
  t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of USER_DATA_TABLE_NAMES) {
      const docs = await ctx.db.query(table).collect();
      counts[table] = docs.filter((doc) => doc.userId === userId).length;
    }
    return counts;
  });

const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

/** Demo data for OWNER and INTRUDER, plus rows in the tables the demo skips. */
async function seeded(): Promise<TestConvex> {
  const t = newTest();
  await seedUser(t, OWNER);
  await seedUser(t, INTRUDER);
  await t.run(async (ctx) => {
    for (const userId of [OWNER, INTRUDER]) {
      await ctx.db.insert("syncTargets", { userId, createdAt: NOW });
      await ctx.db.insert("apiKeys", {
        userId,
        name: "CLI",
        keyHash: `hash-${userId}`,
        keyPrefix: "fis_test",
        scopes: ["networth:read"],
        createdAt: NOW,
      });
      await ctx.db.insert("worldBankFavorites", {
        userId,
        indicatorCode: "SP.POP.TOTL",
        indicatorName: "Population, total",
        addedAt: NOW,
      });
    }
  });
  return t;
}

async function runToEnd(t: TestConvex, from: string, to: string, force?: boolean) {
  const report = await remap(t, { from, to, dryRun: false, force });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return report;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("remapUserId", () => {
  it("is a dry run by default and counts the user's documents per table", async () => {
    const t = await seeded();
    const before = await dumpAll(t);
    const expected = await owned(t, OWNER);

    const report = await remap(t, { from: OWNER, to: NEW_ID });

    expect(report).toMatchObject({ dryRun: true, scheduled: false, collisions: {} });
    expect(report.counts).toEqual(expected);
    expect(report.total).toBe(total(expected));
    expect(report.total).toBeGreaterThan(20);
    expect(await dumpAll(t)).toEqual(before);
  });

  it("moves every document of the user and nothing else", async () => {
    const t = await seeded();
    const ownerBefore = await owned(t, OWNER);
    const intruderBefore = await owned(t, INTRUDER);
    const snaptradeIds = await t.run(async (ctx) =>
      (await ctx.db.query("snaptradeUsers").collect()).map((u) => u.snaptradeUserId).sort(),
    );

    const report = await runToEnd(t, OWNER, NEW_ID);

    expect(report).toMatchObject({ dryRun: false, scheduled: true });
    expect(total(await owned(t, OWNER))).toBe(0);
    expect(await owned(t, NEW_ID)).toEqual(ownerBefore);
    expect(await owned(t, INTRUDER)).toEqual(intruderBefore);
    // SnapTrade's own user ID is its key for the user; it is not ours to change
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("snaptradeUsers").collect()).map((u) => u.snaptradeUserId).sort(),
      ),
    ).toEqual(snaptradeIds);
    // A second run finds nothing left
    expect((await remap(t, { from: OWNER, to: NEW_ID })).total).toBe(0);
  });

  it("works through tables larger than one batch or count page", async () => {
    const t = newTest();
    const indexedRows = REMAP_BATCH_SIZE * 2 + 7;
    const scannedRows = REMAP_COUNT_PAGE_SIZE + 30;
    await t.run(async (ctx) => {
      for (let i = 0; i < indexedRows; i++) {
        await ctx.db.insert("portfolioSnapshots", {
          userId: OWNER,
          timestamp: NOW + i,
          date: "2026-11-15",
          totalAssets: i,
          totalLiabilities: 0,
          netWorth: i,
          source: "test",
        });
      }
      for (let i = 0; i < scannedRows; i++) {
        await ctx.db.insert("syncRuns", {
          provider: "plaid",
          userId: i % 3 === 0 ? INTRUDER : OWNER,
          trigger: "scheduled",
          startedAt: NOW + i,
          status: "success",
        });
      }
    });
    const ownerRuns = scannedRows - Math.ceil(scannedRows / 3);

    const dry = await remap(t, { from: OWNER, to: NEW_ID });
    expect(dry.counts).toMatchObject({ portfolioSnapshots: indexedRows, syncRuns: ownerRuns });

    await runToEnd(t, OWNER, NEW_ID);
    expect(await owned(t, NEW_ID)).toMatchObject({
      portfolioSnapshots: indexedRows,
      syncRuns: ownerRuns,
    });
    expect(total(await owned(t, OWNER))).toBe(0);
    expect((await owned(t, INTRUDER)).syncRuns).toBe(scannedRows - ownerRuns);
  });

  it("refuses the same ID and a target that is not a Clerk user ID", async () => {
    const t = await seeded();
    await expect(remap(t, { from: OWNER, to: OWNER })).rejects.toThrow(/same/);
    await expect(remap(t, { from: OWNER, to: "user_" })).rejects.toThrow(/Clerk user ID/);
    await expect(
      remap(t, { from: OWNER, to: "https://clerk.example.com|user_2abcDEFghiJKL" }),
    ).rejects.toThrow(/Clerk user ID/);
  });

  it("refuses when the target already owns documents, unless forced", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: NEW_ID,
        defaultCurrency: "EUR",
        theme: "system",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const before = await dumpAll(t);

    const dry = await remap(t, { from: OWNER, to: NEW_ID });
    expect(dry.collisions).toEqual({ userSettings: 1 });
    await expect(remap(t, { from: OWNER, to: NEW_ID, dryRun: false })).rejects.toThrow(
      /already belong to user_2prodInstanceIdABCDEF: userSettings: 1/,
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await dumpAll(t)).toEqual(before);

    const ownerSettings = (await owned(t, OWNER)).userSettings;
    await runToEnd(t, OWNER, NEW_ID, true);
    expect((await owned(t, NEW_ID)).userSettings).toBe(ownerSettings + 1);
    expect(total(await owned(t, OWNER))).toBe(0);
  });
});
