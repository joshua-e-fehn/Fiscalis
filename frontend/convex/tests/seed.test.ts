/**
 * seedDemoUser (ENG-237): dev only, idempotent, and the dataset it writes
 * reads back through the app's own queries.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { DEMO_TABLES, DEMO_USER_ID } from "../lib/demoData";
import { newTest, type TestConvex } from "./setup.helpers";

const rowsOf = (t: TestConvex, userId: string) =>
  t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of DEMO_TABLES) {
      counts[table] = (
        await ctx.db
          .query(table)
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      ).length;
    }
    return counts;
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seedDemoUser", () => {
  it("refuses without the dev opt-in", async () => {
    const t = newTest();
    await expect(t.mutation(internal.seed.seedDemoUser, {})).rejects.toThrow(/dev deployment only/);
    vi.stubEnv("DEMO_SEED_ENABLED", "1");
    await expect(t.mutation(internal.seed.seedDemoUser, {})).rejects.toThrow(/dev deployment only/);
  });

  it("refuses on the production deployment even when opted in", async () => {
    const t = newTest();
    vi.stubEnv("DEMO_SEED_ENABLED", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://handsome-gecko-941.convex.cloud");
    await expect(t.mutation(internal.seed.seedDemoUser, {})).rejects.toThrow(/production/);
  });

  it("writes a row in every user table, once", async () => {
    const t = newTest();
    vi.stubEnv("DEMO_SEED_ENABLED", "true");
    const first = await t.mutation(internal.seed.seedDemoUser, {});
    expect(first).toMatchObject({ userId: DEMO_USER_ID, created: true });
    const counts = await rowsOf(t, DEMO_USER_ID);
    expect(Object.entries(counts).filter(([, n]) => n === 0)).toEqual([]);

    const second = await t.mutation(internal.seed.seedDemoUser, {});
    expect(second).toMatchObject({ created: false, inserted: 0 });
    expect(await rowsOf(t, DEMO_USER_ID)).toEqual(counts);
  });

  it("rewrites the dataset on reset, for the given user only", async () => {
    const t = newTest();
    vi.stubEnv("DEMO_SEED_ENABLED", "true");
    await t.mutation(internal.seed.seedDemoUser, {});
    await t.mutation(internal.seed.seedDemoUser, { userId: "user_clerk_demo" });
    const counts = await rowsOf(t, DEMO_USER_ID);

    const reset = await t.mutation(internal.seed.seedDemoUser, {
      userId: "user_clerk_demo",
      reset: true,
    });
    expect(reset).toMatchObject({ created: true });
    expect((reset as { deleted: number }).deleted).toBe((reset as { inserted: number }).inserted);
    expect(await rowsOf(t, "user_clerk_demo")).toEqual(counts);
    expect(await rowsOf(t, DEMO_USER_ID)).toEqual(counts);
  });

  it("shows up in the app's own queries", async () => {
    const t = newTest();
    vi.stubEnv("DEMO_SEED_ENABLED", "true");
    await t.mutation(internal.seed.seedDemoUser, {});
    const demo = t.withIdentity({ subject: DEMO_USER_ID });

    expect(await demo.query(api.onboarding.hasCompletedOnboarding, {})).toBe(true);
    const overview = await demo.query(api.portfolio.getOverview, {});
    expect(overview).not.toBeNull();
    expect(await demo.query(api.loans.getLoans, {})).toHaveLength(1);
    expect(await demo.query(api.vault.getUserVaultItems, {})).toHaveLength(1);
    expect(await demo.query(api.portfolioSnapshots.getSnapshots, {})).not.toHaveLength(0);
  });
});
