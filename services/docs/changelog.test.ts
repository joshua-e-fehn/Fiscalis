import { describe, expect, it } from "vitest";

import { buildChangelog, parseCommitSubject, parseGitLog } from "./changelog";

describe("parseCommitSubject", () => {
  it("reads a feature PR and drops ticket references", () => {
    expect(
      parseCommitSubject(
        "[Feature] | GDPR: export my data and delete my account (ENG-232) (#125)",
        "2026-11-14T22:10:00+01:00",
      ),
    ).toEqual({
      type: "feature",
      title: "GDPR: export my data and delete my account",
      pr: 125,
      date: "2026-11-14",
    });
  });

  it("reads a fix and uses the UTC date", () => {
    expect(
      parseCommitSubject("[Fix] | Unify the German waitlist button label (#135)", "2026-11-15T00:30:00+01:00"),
    ).toMatchObject({ type: "fix", pr: 135, date: "2026-11-14" });
  });

  it("drops several ticket references in one group", () => {
    expect(
      parseCommitSubject("[Fix] | Dead code (PF-10, CF-15) (#16)", "2026-11-11T10:00:00Z")?.title,
    ).toBe("Dead code");
  });

  it.each([
    "[Chore] | Upgrade zod to 4 (#98)",
    "[Refactor] | Move valuation logic into services (#17)",
    "Bump drizzle-orm (#1)",
    "[Feature] | Bitpanda Integration without a PR number",
    "chore: vibe init",
    "[Fix] | Clear lint warnings: loans, header (#57)",
    "[Fix] | Address PR-bot review findings on the valuation stack (1/2) (#29)",
    "[Feature] | Trust-boundary tests with convex-test (#133)",
    "[Feature] | Weekly Convex prod backups to S3, corrected rollback runbook (#127)",
    "[Feature] | Display-currency foundation (no visible change) (#63)",
    "[Fix] | Stop logging provider secrets; reconnect SnapTrade by authorization ID (#62)",
  ])("ignores %s", (subject) => {
    expect(parseCommitSubject(subject, "2026-11-11T10:00:00Z")).toBeNull();
  });
});

describe("parseGitLog", () => {
  it("splits date and subject at the first tab", () => {
    expect(parseGitLog("2026-11-14T10:00:00Z\t[Fix] | A\tB (#1)\n\nbroken line\n")).toEqual([
      { date: "2026-11-14T10:00:00Z", subject: "[Fix] | A\tB (#1)" },
    ]);
  });
});

describe("buildChangelog", () => {
  it("groups by month, newest first, without chores or duplicates", () => {
    const changelog = buildChangelog([
      { date: "2026-11-14T10:00:00Z", subject: "[Feature] | Newest (#20)" },
      { date: "2026-11-14T09:00:00Z", subject: "[Fix] | Same day, lower PR (#19)" },
      { date: "2026-11-02T09:00:00Z", subject: "[Chore] | Housekeeping (#18)" },
      { date: "2026-10-06T09:00:00Z", subject: "[Fix] | October (#9)" },
      { date: "2026-10-05T09:00:00Z", subject: "[Fix] | October (#9)" },
    ]);
    expect(changelog.months.map((m) => m.month)).toEqual(["2026-11", "2026-10"]);
    expect(changelog.months[0].entries.map((e) => e.pr)).toEqual([20, 19]);
    expect(changelog.months[1].entries).toEqual([
      { type: "fix", title: "October", pr: 9, date: "2026-10-06" },
    ]);
  });

  it("is empty without merged PRs", () => {
    expect(buildChangelog([])).toEqual({ months: [] });
  });
});
