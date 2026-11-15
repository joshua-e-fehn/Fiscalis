/**
 * Snapshot idempotency (ENG-237): takeSnapshot keeps one row per user and
 * day however often it runs, and the debounced and fallback runs skip when
 * today's row is already current.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { NOW, OWNER, newTest, seedUser, type TestConvex } from "./setup.helpers";

const HOUR = 60 * 60 * 1000;

const todaysRows = (t: TestConvex, userId = OWNER) =>
  t.run((ctx) =>
    ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", "2026-11-15"))
      .collect(),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("takeSnapshot", () => {
  it("upserts one row a day", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    const first = await t.mutation(internal.portfolioSnapshots.takeSnapshot, {
      userId: OWNER,
      source: "vault",
    });
    vi.setSystemTime(NOW + HOUR);
    const second = await t.mutation(internal.portfolioSnapshots.takeSnapshot, {
      userId: OWNER,
      source: "plaid",
    });

    const rows = await todaysRows(t);
    expect(rows).toHaveLength(1);
    expect(second).toEqual(first);
    expect(rows[0]).toMatchObject({ source: "plaid", timestamp: NOW + HOUR, netWorth: first.netWorth });
  });

  it("matches the live net worth of the seeded data", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    const snapshot = await t.mutation(internal.portfolioSnapshots.takeSnapshot, {
      userId: OWNER,
      source: "scheduled-daily",
    });
    expect(snapshot.totalAssets).toBeGreaterThan(0);
    expect(snapshot.totalLiabilities).toBeGreaterThan(0);
    expect(snapshot.netWorth).toBeCloseTo(snapshot.totalAssets - snapshot.totalLiabilities, 6);
  });

  it("skips a debounced request older than today's row", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    await t.mutation(internal.portfolioSnapshots.takeSnapshot, { userId: OWNER, source: "vault" });
    const [written] = await todaysRows(t);

    vi.setSystemTime(NOW + HOUR);
    await t.mutation(internal.portfolioSnapshots.takeSnapshot, {
      userId: OWNER,
      source: "loan",
      requestedAt: NOW - HOUR,
    });
    expect(await todaysRows(t)).toEqual([written]);
  });

  it("writes the daily fallback only when today has no row", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    await t.mutation(internal.portfolioSnapshots.takeSnapshot, {
      userId: OWNER,
      source: "scheduled-fallback",
      onlyIfMissing: true,
    });
    const [written] = await todaysRows(t);
    vi.setSystemTime(NOW + HOUR);
    await t.mutation(internal.portfolioSnapshots.takeSnapshot, {
      userId: OWNER,
      source: "scheduled-fallback",
      onlyIfMissing: true,
    });
    expect(await todaysRows(t)).toEqual([written]);
  });

  it("does not touch another user's rows", async () => {
    const t = newTest();
    await seedUser(t, OWNER);
    await seedUser(t, "user_other");
    await t.mutation(internal.portfolioSnapshots.takeSnapshot, { userId: OWNER, source: "vault" });
    expect(await todaysRows(t, "user_other")).toEqual([]);
  });
});
