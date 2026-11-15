> **Status (archived 2026-11-15):** Point-in-time audit of origin/main `bae2c24`. Its recommendations became the Linear initiative "Fiscalis" (projects M0 Stabilize, M1 Usable core, M2 Depth); most M0 items have shipped. Track work in Linear, not here.

# Fiscalis audit and roadmap (2026-11-14, origin/main `bae2c24`)

## 1. Executive summary

- **The finance core is in good shape.** Every server-side figure goes through one loader (`frontend/convex/lib/netWorth.ts:112`) and one aggregator (`services/portfolio/aggregate.ts:206`). Snapshots are flow-adjusted, and returns use Modified Dietz plus TWR. The `services/` suite passes: 743 tests across 26 files. ENG-160/174 closed out the "trust the numbers" phase.
- **Auth is sound after ENG-156.** No public Convex function takes `userId` from its arguments, and ownership checks go through `getOwnedDoc`. API keys and at-rest token encryption are well designed.
- **Releases are not gated.** There is no `.github/` directory, `main` is unprotected, and every merge to `main` deploys Convex prod (`frontend/package.json:8`). Backups are hand-made zips on a laptop, and the documented rollback would point prod at the empty dev deployment.
- **Two cheap high-severity bugs:**
  - Raw axios errors are logged in the Plaid and SnapTrade actions (`frontend/convex/actions/plaid.ts:263,350`). This probably writes `PLAID-SECRET`, access tokens and SnapTrade `userSecret` into the Convex logs.
  - SnapTrade reconnect sends the broker slug, not the authorization ID (`frontend/components/atomic/molecules/brokerReauthCard.tsx:94-96`). I re-checked both on `main`.
- **The product is about 60% real and 40% placeholder.** The account-connected net-worth spine works. Beyond it there are 23 stub pages, 45 of 46 drill-down cards say "Coming Soon", and 11 sidebar entries point at `#`. There is no way to enter manual assets, so net worth is understated. Onboarding is built but unreachable (`app/(auth)/sign-up/[[...sign-up]]/page.tsx:5` sends new users to `/dashboard`).
- **The price/FX feed depends on an out-of-band, deprecated Supabase function** that scrapes gold.de and reports success even when it fails. Nothing alerts on stale crons or feeds.
- **The backlog does not work as a roadmap.** All 41 open issues (ENG-177..217) are P4, with no project or milestone. They are about breadth: 8 languages, 12 stub pages, billing and teams. No issue covers CI, backups, monitoring, GDPR, or the bugs above.
- **Verdict: solid engine, unguarded factory, unfinished storefront.** This is fine for an operator-only tool. It is not ready for anyone else to sign up and connect a bank.

## 2. What is solid (keep doing)

- **Pure logic lives in `services/` with tests**, and Convex and the pages call it rather than re-implementing it. Keep the rule "testable logic goes to `services/`".
- **Strict money rules.** EUR-only aggregation. An amount that cannot be converted counts as 0, never 1:1. Unknown cost is `null`. Snapshots carry a `partial` flag, and stale spot prices fall back to cost basis.
- **Graceful degradation in sync.** The nightly sync fans out per user (`actions/syncAll.ts:350-397`). SnapTrade fetches before it writes. FX merges two sources and falls back to ECB (`convex/fxRates.ts:41-143`). Scheduled sync is opt-in per deployment.
- **A security posture that tooling can enforce.** `services/security/convexPublicArgs.test.ts` checks public function arguments. CSP is nonce-strict, and the API-key design is sound.
- **Traceable delivery discipline.** Work flows audit → Linear umbrella → branch per ticket. PR titles carry ENG IDs. The P1 security fix (ENG-156) landed the same day it was filed.
- **Precious metals and loans are complete verticals.** Use them as the template for manual assets.

## 3. Top risks

Duplicates across the seven dimensions are merged here. Severity is the verifier-corrected value.

| # | Sev | Title | Evidence | Fix | Effort |
|---|---|---|---|---|---|
| 1 | High | Provider SDK errors logged raw, probably leaking Plaid secret, access tokens and SnapTrade userSecret | `convex/actions/plaid.ts:21-38` (secret in default headers), `:263,350,518,571,651,740,837`; `actions/snaptrade.ts:110…1200`; `actions/syncAll.ts:108…314` | Add a `sanitizeProviderError()` helper and use it at every call site. Then audit prod logs and rotate secrets if anything leaked. | S |
| 2 | High | No CI and no branch protection; a merge to `main` deploys Convex prod | No `.github/`; `frontend/package.json:8`; branch protection check returns 404 | One GitHub Actions workflow (lint, both `tsc` projects, `vitest run`), a `main` ruleset, and Vercel Deployment Checks | S |
| 3 | High | No real backups; rollback runbook points at empty dev | `~/fiscalis-backups/` (newest from 2026-11-13); `memory/production-deployment.md:15,20` | Turn on Convex scheduled backups, keep an export off the laptop, rewrite the runbook, and run one restore drill | S |
| 4 | High | SnapTrade reconnect sends the broker slug instead of `authorizationId` | `brokerReauthCard.tsx:94-96`; `actions/snaptrade.ts:195,228-233`; `schema.ts:149` | Send `reconnect: connection.authorizationId`, then re-sync that connection | S |
| 5 | High | Price/FX writer is out-of-band, unversioned, scrapes an undocumented endpoint, and returns 200 on failure; Convex pulls it back from the prod domain | `backend/.../fetchAndSafe…/index.ts:74-77,146-181`; `convex/metalPrices.ts:21-22` | Short term: add an ok-check, validation and a freshness alert. Next: port the writer into a Convex cron and retire `backend/` and Supabase. | M |
| 6 | High | Onboarding is unreachable | `sign-up/[[...sign-up]]/page.tsx:5`; no guard in `(root)/layout.tsx`; local-only branch `claude/onboarding-gate` (migration not pushed) | Push the branch, run the migration first, then add the redirect and guard, plus a dashboard empty state | S |
| 7 | High | No generic manual assets (property, vehicle, private equity, offline cash), so net worth is understated | `schema.ts`: only loans (L307) and `vaultItems` (L583); `assets/real-estate/page.tsx:19` has `disabled: true` | Add a `manualAssets` table with valuation history, one add/edit UI, and wire it into the aggregator | L |
| 8 | Med | No operator monitoring: crons, metal and FX feeds, static `/health` | `convex/http.ts:21-38`; `syncAll.ts:262-314`; no Sentry or similar | Add a `syncRuns` table, `/health/deep` returning 503 on staleness, an uptime monitor and a cron heartbeat | M |
| 9 | Med | GDPR gap: no delete, export, Clerk `user.deleted` handling, privacy policy or Impressum; footer links are `#` | `convex/http.ts` (2 routes only); `app/(website)/page.tsx:496-505` | Add legal pages first, then delete-my-account (revoke at providers, then purge) and export | M |
| 10 | Med | Bank disconnect never calls Plaid `itemRemove`; unused public `getAuth`/`getIdentity` return account numbers and PII | `convex/banking.ts:213-255`; `actions/plaid.ts:675-840` | Make disconnect an action that calls `itemRemove`. Delete the unused actions and drop the `auth` product. | S |
| 11 | Med | No throttle on user-triggered paid provider actions; sign-up is open | `actions/syncAll.ts:49`, `actions/plaid.ts:71,455,583` | Add `@convex-dev/rate-limiter` and a Clerk waitlist until there is a reason to open sign-up | S |
| 12 | Med | Client totals bypass the aggregator, and monthly loan payment is computed two ways | `molecules/bankAccountsCard.tsx:95-99`; `BitpandaConnectionsCard.tsx:40-45`; `categorySummary.ts:490` vs `loans.ts:285-320` | One sweep using the `services` helpers, plus an equality test | S |
| 13 | Med | EUR cost basis uses today's FX, so P/L and the flow-adjusted return can disagree | `services/finance/currency.ts:425-447`; `netWorth.ts:116-120,209` | Use trade-date FX for EUR cost, and flag the cases where it is estimated | M |
| 14 | Med | FX stale/fallback flags never shown; `asOf` ignores FX age | `currency.ts:10-35,64-92`; `aggregate.ts:236-249` | Fold FX age into `asOf`/`dataAsOf` and show a badge | S |
| 15 | Med | Stale lockfile (Jan 2026), install not frozen, drizzle-kit/orm mismatch, SQL migrations forked despite `AGENTS.md:46` | `frontend/bun.lockb`; `vercel.json`; `diff -rq` of the two migration directories | Move to text `bun.lock` with `--frozen-lockfile`. Collapse to one migration directory, or remove it via #5. | S |
| 16 | Med | Retry helper is dead code; Bitpanda marks any blip as a broken key | `convex/lib/snaptrade.ts:256` (no callers); `actions/bitpanda.ts:322-335` | Wire up the retry helper and add timeouts. Split the "transient" status from "needs reauth". | S |
| 17 | Med | Unbounded `.collect()` calls and full-table scans in the cron's user discovery | `portfolioSnapshots.ts:246-272`; `banking.ts:160-172` | Use indexed `take`/`paginate` and add a `syncTargets` table. Do this before ENG-190. | M |
| 18 | Med | Dependabot alerts: critical maplibre, high zod (both judged not reachable); PR #6 open since September | `frontend/package.json:46,60` | Merge maplibre 6 after the lockfile migration. Ticket the zod 4 upgrade. | S/M |

**Notable refutations and corrections:**
- `classifySnaptradePosition` and Bitpanda `normalize.ts` do have tests (Q4 overstated this).
- PR #32 (NW-15) is merged, not open.
- Users do see per-connection errors. Only operator-side alerting is missing.
- The currency fallback to EUR is deliberate, so it is a UX gap, not wrong numbers.

## 4. The roadmap as it exists today

- **Done:** trust and correctness. ENG-152..176 cover security, valuation, FX, the performance engine, the prod/dev split and lint. Most of it landed 2026-11-11..14 as about 49 agent-stacked PRs.
- **Queued:** ENG-177..217, filed 2026-11-14 from a feature audit. All are Backlog/P4 with no project, milestone or cycle:
  - languages (ENG-179..188)
  - placeholder menus: docs, Pies, Teams, Billing, Limits, Upgrade, Notifications, footer (ENG-189..208)
  - "backend with no UI": transactions, category override, edit loan payment, delete vault entry, reset retirement, World Bank (ENG-190..210)
  - 12 collectible and commodity stub pages (ENG-201..217)
- **In flight but not ticketed:** Settings > General and EN/DE i18n (both described as "being built now" in ENG-177/178; I found no branch for either), and the onboarding gate (local branch only, migration not pushed).
- **What keeps getting deferred:**
  - frontend and Convex tests (M-C9)
  - duplicate `formatCurrency` and loan "USD" defaults (L-C1, M-A4; ENG-174 was closed with these still on `main`)
  - client-side totals (CF-11)
  - anything operational: CI, backups, monitoring, the price writer
- **Stale planning artifacts that compete with Linear:** `ToDo.md`, a README that still documents Vezgo and Supabase, 23+ plan docs with no status, and the untracked `VALUATION_RESOLUTION_PLAN.md` that `services/performance/config.ts:5` cites.
- **Pattern:** long dormancy, then audit-driven bursts. Each burst adds surface faster than it adds guardrails.

## 5. Recommended roadmap

### Product thesis

Fiscalis is **a private, EU/EUR-first net-worth and wealth tracker for one self-directed investor (the owner), later a small invite-only circle.** It is not a SaaS.

The wedge is everything mainstream aggregators do badly:
- precious metals at live spot with dealer premiums
- loans with real amortisation
- Bitpanda and broker positions
- honest flow-adjusted performance
- a retirement plan funded from real net worth
- an API for your own tools

Success means **"every asset I own, correctly valued, with no silent staleness."** On that basis:
- Breadth items (Teams, Billing, Plans, Upgrade, 8 more languages, 12 stub pages) are **cut or frozen**.
- Depth items (manual assets, transactions, data freshness) come next.

### Phase 0: Stabilize (next 1-2 weeks)

| Item | Deliverables | Why now | Effort | Linear |
|---|---|---|---|---|
| Secret-safe logging | `sanitizeProviderError`, about 25 call sites, a grep/lint ban; audit prod logs and rotate if needed | Can turn encryption at rest into plaintext | S | new (P1) |
| Quality gate | `check` script; services `vitest run`; GitHub Actions; `main` ruleset; Vercel Deployment Checks; text `bun.lock` with `--frozen-lockfile` | Every merge is currently a prod deploy | S | new (P1) |
| Backups and runbook | Convex scheduled backups, an export off the laptop, a corrected rollback doc, one restore drill | Vault, loans and snapshot history cannot be rebuilt | S | new (P1) |
| Re-auth bugs | SnapTrade `authorizationId`; Bitpanda transient vs needs-reauth status; wire up `withRetry`; Bitpanda timeouts | The only recovery path is broken | S | new (P2) |
| Feed freshness | ok-check and validation in the Deno writer; `/health/deep` with an uptime monitor for sync, metals and FX; FX age folded into `asOf` | The SPOF that nobody watches | S | new (P2) |
| Honesty pass | Hide the 11 `#` nav entries; point Liabilities at `/liabilities`; remove non-EUR and German options until they work; drop "thousands of users"; add Impressum, privacy and terms pages | A German public site with bank data needs them legally, and the app currently overpromises | S | ENG-208 → P1, ENG-178 |
| Onboarding live | Push `claude/onboarding-gate`, migrate, then add the redirect, guard and dashboard empty state | Finished code currently delivers nothing | S | new |
| Connection lifecycle | Plaid `itemRemove` on disconnect; delete `getAuth`/`getIdentity`; internalize `brokers.deleteConnection`; strip the secret from `getSnaptradeUser`; delete `convex/test.ts` | Revoked consent should actually be revoked | S | new |
| Docs reset | Rewrite the README, archive completed plans, remove the Vezgo dependency and CSP entries, fix `AGENTS.md:46`, commit a short valuation ADR (D-codes) and drop the draft, replace `ToDo.md` with a Linear pointer | Agents act on these files | S | new |

### Phase 1: Usable core (next ~month)

1. **Manual assets v1.** Add a `manualAssets` table with a `valuations[]` history and an optional linked loan. Build one add/edit UI and feed it into the aggregator and snapshots as a discrete source. Replace the stub pages and the 45 cards with one `/assets/[category]/[subcategory]` route driven by `categoryUI` that renders `UnifiedPositionsTable`, and fix the hrefs. This is the largest correctness gap. (L; replaces ENG-184 and ENG-201..217)
2. **Transactions and cash flow.** First switch Plaid to `/transactions/sync` with a cursor, make Bitpanda transaction sync incremental, and fix the indexed reads (risk #17). Then build a unified Transactions page and a monthly income/spend/savings-rate summary. The data is already synced. (M; ENG-190 → P2)
3. **Settings > General plus GDPR.** Currency, birth date, display preferences, export-my-data, and delete-my-account (revoke at providers, purge, Clerk webhook). Required before inviting anyone. (M; new, absorbs the "being built" note in ENG-178)
4. **Data freshness in the UI.** A dashboard `asOf` badge, per-provider "last good sync", and a banner when a connection needs reauth. (S; ENG-207 re-scoped to in-app first)
5. **Small core gaps.** Category override (ENG-195), edit loan payment (ENG-196), delete vault entry (ENG-200), reset retirement (ENG-205). Do these together with a client-total sweep: one `formatCurrency`, no USD defaults, and the bank/Bitpanda/loan totals moved onto the `services` helpers (risk #12). (M)
6. **Observability v2.** `syncRuns` ledger and a daily failure digest to the existing Mya Slack channel. (M; new)

### Phase 2: Depth and robustness (next quarter)

- **Own the price pipeline.** Run the gold.de and secondary-source fetch in a Convex cron and serve history from Convex. Retire `backend/`, Supabase, Drizzle and Neon, plus the dead SQL tables and forked migrations. (M-L; new)
- **Trust-boundary tests.** `convex-test` for ownership on every public mutation, snapshot idempotency, and migration dry runs. Add classification rule-table fixtures, and adopt `@convex-dev/migrations`. Add a seeded demo user on dev so previews are meaningful. (L; new)
- **FX-correct cost basis** at trade-date FX (risk #13), plus snapshot timezone handling. (M; new)
- **Continuous pricing** for equities and crypto through the `PRICE_FEEDS` seam, plus tier-3 per-asset overrides. (L; new)
- **Plaid and SnapTrade webhooks** with consent-expiry tracking, and encryption key versioning and rotation. (M each; new)
- **Real multi-currency display** on top of the EUR fxRates mirror, then EN/DE i18n. (M; ENG-177 umbrella, EN/DE only)

### Later / not doing

- **Frozen until the owner decides on SaaS:** Teams (ENG-197), Billing (ENG-198), Limits (ENG-199), Upgrade (ENG-203).
- **Cut:** the 8 extra languages (ENG-179..188) and Pies (ENG-189). Fold Docs ENG-191..194 into a single `docs/API.md` link.
- **Leave alone:** merging the two World Bank data paths (ENG-210 stays P4), the Turbopack build retry, and the PWA.
- **Evaluate only if the target user is a DE bank customer:** an EU PSD2 aggregator.

### Decisions the owner must make

1. **Personal tool or SaaS?** This decides whether ENG-197/198/199/203 are closed or frozen.
2. **Should the GitHub repo stay public?** It is a finance app. Turn on secret scanning either way.
3. **Sign-up policy:** open, waitlist or allowlist. I recommend a waitlist until Phase 1 item 3 ships.
4. **Is the main bank market DE?** If so, Plaid coverage needs checking (`PLAID_ENV`, `PLAID_COUNTRY_CODES` and `PLAID_PRODUCTS` in prod are unverified).
5. **Price source licensing:** keep scraping gold.de or pay for a feed.

## 6. Suggested Linear changes (not made)

- **Create a Fiscalis project** with three milestones: M0 Stabilize, M1 Usable core, M2 Depth.
- **New issues, P1:**
  - sanitize provider error logging and audit logs
  - CI, `main` ruleset and frozen lockfile
  - Convex backups and rollback runbook
- **New issues, P2:**
  - SnapTrade reconnect `authorizationId`
  - Bitpanda transient status and retries
  - feed and cron freshness health check
  - onboarding gate (link to the local branch and specify migration order)
  - Plaid `itemRemove`, plus removing `getAuth`/`getIdentity`
  - provider-action rate limit and Clerk waitlist
  - docs reset with Vezgo removal and a valuation ADR
- **New issues, P2/P3:**
  - `manualAssets` and a generic subcategory route
  - Settings > General
  - GDPR delete and export
  - client-total sweep with the ENG-174 residuals (USD defaults, `formatCurrency`)
  - own the price writer and retire `backend/`
  - `convex-test` trust-boundary suite
  - FX-correct cost basis
  - Plaid `/transactions/sync`, as a blocker of ENG-190
- **Reprioritise:**
  - ENG-208 → P1
  - ENG-190 → P2
  - ENG-195, ENG-196, ENG-200, ENG-205 → P3
  - ENG-207 → P3, re-scoped to an in-app connection-health banner
- **Close or merge:**
  - ENG-201..217: close and supersede with the generic manual-assets route (ENG-184 allows removal)
  - ENG-191..194: merge into one docs-link item
  - ENG-189 (Pies): cancel
- **Freeze (Backlog, labelled "needs SaaS decision"):** ENG-197, ENG-198, ENG-199, ENG-203.
- **Cancel or park:** ENG-179..188. Keep ENG-177 scoped to EN/DE.
- **Process:** reopen work rather than closing an umbrella with residuals (ENG-174). Every umbrella should spin out its leftovers into a new ticket before it closes.

Paths: audit worktree `/Users/atlas/Documents/Coding/Private/Fiscalis/Fiscalis.claude-audit-roadmap`; draft plan `/Users/atlas/Documents/Coding/Private/Fiscalis/Fiscalis/docs/VALUATION_RESOLUTION_PLAN.md`.