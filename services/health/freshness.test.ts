import { describe, expect, it } from "vitest";
import {
  evaluateFreshness,
  FX_REFRESH_MAX_AGE_MS,
  HEALTH_CHECK_NAMES,
  METAL_COVERAGE_MIN_ROWS,
  METAL_TICK_MAX_AGE_MS,
  PROVIDER_SYNC_MAX_AGE_MS,
  type FreshnessInputs,
} from "./freshness";
import { utcDayEnd } from "../finance/currency";

const now = Date.UTC(2026, 10, 14, 12, 0, 0); // Sat 14 Nov 2026 12:00 UTC
const allOn = { archiveEnabled: true, archiveRequired: true, scheduledSyncEnabled: true };
const fresh: FreshnessInputs = {
  newestTickAt: now - 60_000,
  newestArchivedDay: "2026-11-13",
  newestArchivedRows: 1440,
  fxRefreshedAt: now - 30 * 60_000,
  providerSyncedAt: now - 6 * 3_600_000,
};
const check = (report: ReturnType<typeof evaluateFreshness>, name: string) =>
  report.checks.find((c) => c.name === name)!;

describe("evaluateFreshness", () => {
  it("is ok when every record is within its threshold", () => {
    const report = evaluateFreshness(fresh, allOn, now);
    expect(report.ok).toBe(true);
    expect(report.critical).toBe(false);
    expect(report.checks.map((c) => c.name)).toEqual([...HEALTH_CHECK_NAMES]);
    expect(check(report, "metal-price-ticks")).toEqual({
      name: "metal-price-ticks",
      ok: true,
      severity: "critical",
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
    expect(report.critical).toBe(false);
    expect(check(report, "fx-rates")).toEqual({
      name: "fx-rates",
      ok: false,
      severity: "warning",
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

    it("fails critical where the archive is required but not configured", () => {
      const report = evaluateFreshness(
        { ...fresh, newestArchivedDay: null },
        { ...allOn, archiveEnabled: false },
        now,
      );
      expect(report).toMatchObject({ ok: false, critical: true });
      expect(check(report, "metal-price-archive")).toMatchObject({
        ok: false,
        severity: "critical",
        ageSeconds: null,
        detail: "archive not configured",
      });
      expect(check(report, "metal-price-archive").skipped).toBeUndefined();
      expect(check(report, "metal-price-coverage")).toMatchObject({ ok: true, skipped: true });
    });

    it("is skipped where the archive is not configured", () => {
      const report = evaluateFreshness(
        { ...fresh, newestArchivedDay: null },
        { ...allOn, archiveEnabled: false, archiveRequired: false },
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

  describe("severity", () => {
    it("labels the tick and archive checks critical, the rest warnings", () => {
      const report = evaluateFreshness(fresh, allOn, now);
      expect(Object.fromEntries(report.checks.map((c) => [c.name, c.severity]))).toEqual({
        "metal-price-ticks": "critical",
        "metal-price-archive": "critical",
        "metal-price-coverage": "warning",
        "fx-rates": "warning",
        "provider-sync": "warning",
      });
    });

    it("is critical when the tick feed is stale", () => {
      const report = evaluateFreshness(
        { ...fresh, newestTickAt: now - METAL_TICK_MAX_AGE_MS - 60_000 },
        allOn,
        now,
      );
      expect(report).toMatchObject({ ok: false, critical: true });
    });

    it("is critical when yesterday is not archived by 01:00 UTC", () => {
      const report = evaluateFreshness(
        { ...fresh, newestArchivedDay: "2026-11-12" },
        allOn,
        Date.parse("2026-11-14T01:30:00Z"),
      );
      expect(report).toMatchObject({ ok: false, critical: true });
    });

    it("is not critical when only warnings fail", () => {
      const report = evaluateFreshness(
        { ...fresh, fxRefreshedAt: null, providerSyncedAt: null, newestArchivedRows: 10 },
        allOn,
        now,
      );
      expect(report).toMatchObject({ ok: false, critical: false });
    });
  });

  describe("metal price coverage", () => {
    const coverage = (overrides: Partial<FreshnessInputs>, config = allOn, at = now) => {
      const report = evaluateFreshness({ ...fresh, ...overrides }, config, at);
      return { report, check: check(report, "metal-price-coverage") };
    };

    it("is ok with a full day of 1440 rows", () => {
      expect(coverage({ newestArchivedRows: 1440 }).check).toEqual({
        name: "metal-price-coverage",
        ok: true,
        severity: "warning",
        ageSeconds: null,
        threshold: 1380,
        detail: "2026-11-13: 1440 rows",
      });
    });

    it("passes at exactly the minimum, fails one row short", () => {
      expect(METAL_COVERAGE_MIN_ROWS).toBe(1380);
      expect(coverage({ newestArchivedRows: 1380 }).check.ok).toBe(true);
      const short = coverage({ newestArchivedRows: 1379 });
      expect(short.check).toMatchObject({ ok: false, detail: "2026-11-13: 1379 rows" });
      expect(short.report).toMatchObject({ ok: false, critical: false });
    });

    it("is skipped when the newest archived day is older than yesterday", () => {
      // 00:30 UTC: yesterday's upload is still within its grace period
      const { report, check: c } = coverage(
        { newestArchivedDay: "2026-11-12", newestArchivedRows: 5 },
        allOn,
        Date.parse("2026-11-14T00:30:00Z"),
      );
      expect(c).toMatchObject({ ok: true, skipped: true, threshold: 1380 });
      expect(c.detail).toBeUndefined();
      expect(report.ok).toBe(true);
    });

    it("is skipped where the archive is not configured", () => {
      const { report, check: c } = coverage(
        { newestArchivedDay: null, newestArchivedRows: null },
        { ...allOn, archiveEnabled: false, archiveRequired: false },
      );
      expect(c).toMatchObject({ ok: true, skipped: true, severity: "warning" });
      expect(report.ok).toBe(true);
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
        severity: "warning",
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
