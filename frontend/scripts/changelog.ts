/**
 * Regenerates lib/docs/changelog.json, the data behind /docs/changelog, from
 * the merged pull requests on main (squash commits "[Feature] | … (#n)").
 * Run after merges and commit the result; the page reads only the JSON.
 *
 *   cd frontend && bun run changelog            # from origin/main
 *   cd frontend && bun run changelog -- main    # from another ref
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { buildChangelog, parseGitLog } from "../../services/docs/changelog";

const ref = process.argv[2] ?? "origin/main";
const out = path.resolve(__dirname, "../lib/docs/changelog.json");

const log = execFileSync(
  "git",
  ["log", ref, "--first-parent", "--format=%cI%x09%s"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

const changelog = buildChangelog(parseGitLog(log));
writeFileSync(out, `${JSON.stringify(changelog, null, 2)}\n`);

const count = changelog.months.reduce((n, m) => n + m.entries.length, 0);
console.log(`changelog: ${count} entries in ${changelog.months.length} months from ${ref} → ${path.relative(process.cwd(), out)}`);
