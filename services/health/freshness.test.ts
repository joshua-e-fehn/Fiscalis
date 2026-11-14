import { describe, expect, it } from "vitest";
import {
  evaluateFreshness,
  FX_REFRESH_MAX_AGE_MS,
  HEALTH_CHECK_NAMES,
  METAL_TICK_MAX_AGE_MS,
  PROVIDER_SYNC_MAX_AGE_MS,
  type FreshnessInputs,
} from "./freshness";
import { utcDayEnd } from "../finance/currency";

const now = Date.UTC(2026, 10, 14, 12, 0, 0); // Sat 14 Nov 2026 12:00 UTC
const allOn = { archiveEnabled: true, scheduledSyncEnabled: true };
const fresh: FreshnessInputs = {
  newestTickAt: now - 60_000,
  newestArchivedDay: "2026-11-13",
  fxRefreshedAt: now - 30 * 60_000,
  providerSyncedAt: now - 6 * 3_600_000,
};
const check = (report: ReturnType<typeof evaluateFreshness>, name: string) =>
  report.checks.find((c) => c.name === name)!;

describe("evaluateFreshness", () => {
  it("is ok when every record is within its threshold", () => {
    const report = evaluateFreshness(fresh, allOn, now);
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual([...HEALTH_CHECK_NAMES]);
    expect(check(report, "metal-price-ticks")).toEqual({
      name: "metal-price-ticks",
      ok: true,
      ageSeconds: 60,
      threshold: 600,
    });
  });

  it("fails the tick check past ten minutes, inclusive at the threshold", () => {
    const at = (age: number) =>
      evaluateFreshness({ ...fresh, newestTickAt: now - age }, allOn, now);
    expect(at(METAL_TICK_MAX_AGE_MS).ok).toBe(true);
    const stale = at(METAL_TICK_MAX_AGE_MS + 1_000);
    expect(stale.ok).toBe(false);
    expect(check(stale, "metal-price-ticks")).toMatchObject({ ok: false, ageSeconds: 601 });
  });

  it("fails a check with no record at all, with a null age", () => {
    const report = evaluateFreshness({ ...fresh, fxRefreshedAt: null }, allOn, now);
    expect(report.ok).toBe(false);
    expect(check(report, "fx-rates")).toEqual({
      name: "fx-rates",
      ok: false,
      ageSeconds: null,
      threshold: FX_REFRESH_MAX_AGE_MS / 1000,
    });
  });

  it("treats a future timestamp as age zero", () => {
    const report = evaluateFreshness({ ...fresh, newestTickAt: now + 5_000 }, allOn, now);
    expect(check(report, "metal-price-ticks")).toMatchObject({ ok: true, ageSeconds: 0 });
  });

  describe("metal price archive", () => {
    const at = (iso: string, newestArchivedDay: string | null) =>
      check(
        evaluateFreshness({ ...fresh, newestArchivedDay }, allOn, Date.parse(iso)),
        "metal-price-archive",
      );

    it("allows yesterday to be missing until 01:00 UTC", () => {
      expect(at("2026-11-14T00:59:00Z", "2026-11-12").ok).toBe(true);
      expect(at("2026-11-14T01:00:00Z", "2026-11-12").ok).toBe(true);
      expect(at("2026-11-14T01:01:00Z", "2026-11-12").ok).toBe(false);
    });

    it("is ok all day once yesterday is archived", () => {
      expect(at("2026-11-14T00:16:00Z", "2026-11-13").ok).toBe(true);
      expect(at("2026-11-14T23:59:00Z", "2026-11-13").ok).toBe(true);
    });

    it("measures the age from the end of the archived day", () => {
      expect(at("2026-11-14T02:00:00Z", "2026-11-13")).toMatchObject({
        ageSeconds: 7_200,
        threshold: 25 * 3_600,
      });
    });

    it("fails with an empty archive or a malformed day", () => {
      expect(at("2026-11-14T12:00:00Z", null)).toMatchObject({ ok: false, ageSeconds: null });
      expect(at("2026-11-14T12:00:00Z", "13.11.2026")).toMatchObject({ ok: false, ageSeconds: null });
    });

    it("is skipped where the archive is not configured", () => {
      const report = evaluateFreshness(
        { ...fresh, newestArchivedDay: null },
        { ...allOn, archiveEnabled: false },
        now,
      );
      expect(report.ok).toBe(true);
      expect(check(report, "metal-price-archive")).toMatchObject({
        ok: true,
        ageSeconds: null,
        skipped: true,
      });
    });
  });

  describe("provider sync", () => {
    it("fails past 26 hours", () => {
      const report = evaluateFreshness(
        { ...fresh, providerSyncedAt: now - PROVIDER_SYNC_MAX_AGE_MS - 60_000 },
        allOn,
        now,
      );
      expect(report.ok).toBe(false);
      expect(check(report, "provider-sync")).toMatchObject({
        ok: false,
        threshold: 26 * 3_600,
      });
    });

    it("is skipped where scheduled syncs are off, even with no record", () => {
      const report = evaluateFreshness(
        { ...fresh, providerSyncedAt: null },
        { ...allOn, scheduledSyncEnabled: false },
        now,
      );
      expect(report.ok).toBe(true);
      expect(check(report, "provider-sync")).toEqual({
        name: "provider-sync",
        ok: true,
        ageSeconds: null,
        threshold: 26 * 3_600,
        skipped: true,
      });
    });
  });
});

describe("utcDayEnd", () => {
  it("is the next UTC midnight", () => {
    expect(utcDayEnd("2026-11-13")).toBe(Date.UTC(2026, 10, 14));
  });

  it("is NaN for anything but YYYY-MM-DD", () => {
    expect(utcDayEnd("2026-11-13T00:00")).toBeNaN();
    expect(utcDayEnd("")).toBeNaN();
  });
});
