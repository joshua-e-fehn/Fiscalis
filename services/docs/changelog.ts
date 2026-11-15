/**
 * Builds the in-app changelog (/docs/changelog) from the squash-merge
 * commits on main. Every merged pull request lands as one commit titled
 * "[Feature] | Title (#123)"; only features and fixes are user-facing, so
 * chores, refactors, dependency bumps and direct commits are left out.
 *
 * frontend/scripts/changelog.ts feeds `git log` into this and commits the
 * result as frontend/lib/docs/changelog.json; the page never calls GitHub.
 */

export const CHANGELOG_TYPES = ["feature", "fix"] as const;
export type ChangelogType = (typeof CHANGELOG_TYPES)[number];

export interface ChangelogEntry {
  type: ChangelogType;
  title: string;
  /** Pull request number */
  pr: number;
  /** Merge date, YYYY-MM-DD (UTC) */
  date: string;
}

export interface ChangelogMonth {
  /** YYYY-MM */
  month: string;
  entries: ChangelogEntry[];
}

export interface Changelog {
  months: ChangelogMonth[];
}

/** One commit as `git log --format=%cI%x09%s` prints it. */
export interface CommitLine {
  date: string;
  subject: string;
}

const SUBJECT = /^\[(Feature|Fix)\]\s*\|\s*(.+?)\s*\(#(\d+)\)\s*$/;

/** Ticket references read as noise to users: "(ENG-232)", "(PF-10, CF-15)". */
const TICKET_REFS = /\s*\((?:[A-Z]+-\d+(?:\s*[,/]\s*)?)+\)/g;

/** The entry a merged PR's commit subject describes, or null if it is not one. */
export function parseCommitSubject(
  subject: string,
  isoDate: string,
): ChangelogEntry | null {
  const match = SUBJECT.exec(subject.trim());
  if (!match) return null;
  const [, kind, rawTitle, pr] = match;
  const title = rawTitle.replace(TICKET_REFS, "").trim();
  const date = new Date(isoDate);
  if (!title || Number.isNaN(date.getTime())) return null;
  return {
    type: kind === "Feature" ? "feature" : "fix",
    title,
    pr: Number(pr),
    date: date.toISOString().slice(0, 10),
  };
}

/** Parses `%cI<TAB>%s` lines; blank and malformed lines are skipped. */
export function parseGitLog(output: string): CommitLine[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const tab = line.indexOf("\t");
      if (tab < 0) return [];
      return [{ date: line.slice(0, tab), subject: line.slice(tab + 1) }];
    });
}

/**
 * Newest month first, newest entry first within a month (by date, then PR
 * number). A PR that appears twice (a revert and re-land) is listed once.
 */
export function buildChangelog(commits: readonly CommitLine[]): Changelog {
  const byPr = new Map<number, ChangelogEntry>();
  for (const commit of commits) {
    const entry = parseCommitSubject(commit.subject, commit.date);
    if (!entry) continue;
    const seen = byPr.get(entry.pr);
    if (!seen || seen.date < entry.date) byPr.set(entry.pr, entry);
  }
  const sorted = [...byPr.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.pr - a.pr,
  );
  const months: ChangelogMonth[] = [];
  for (const entry of sorted) {
    const month = entry.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) last.entries.push(entry);
    else months.push({ month, entries: [entry] });
  }
  return { months };
}
