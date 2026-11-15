# AGENTS.md

> Repo-specific contract for any coding agent working here. `CLAUDE.md` is a
> symlink to this file. The shared vibe protocol lives in `.vibe/PROTOCOL.md`
> and is imported below — keep this file for what is true of *this repo only*.

@.vibe/PROTOCOL.md

## Techstack

- A reactive document store with colocated server functions is the **system of
  record** for everything a user owns — bank items, broker positions, crypto
  holdings, loans, vault, portfolio snapshots, World Bank indicators. Queries
  push over WebSocket, so there is no cache to invalidate. Scheduled jobs live
  here too: nightly full-provider sync + snapshot, 6-hourly Bitpanda refresh,
  weekly World Bank sync, and the minutely precious-metal price ingest.
- It also holds the market data: a minutely scrape of an undocumented public
  gold-price JSON feed (all four metals in EUR/USD/CHF plus EUR/USD and
  EUR/CHF), stored as raw ticks pruned after 7 days and as hour/day closes kept
  forever, plus daily FX rates merged from those closes and the ECB. Every
  finished UTC day of ticks is archived to S3 (one gzipped JSON-lines file per
  day, all the old SQL columns) before the ticks are pruned, so the S3 bucket
  is the minutely history for backtesting. There is no SQL store any more
  (retired 2026-11-14; the Supabase history is in the same bucket).
- Hosted auth guards every route except the marketing page and the public world
  data endpoints, and additionally owns the app's Content-Security-Policy.
- Three account-aggregation providers supply raw account/position/transaction
  data; a rule-priority classification engine maps each provider's vocabulary
  onto one shared category/subcategory taxonomy before anything is stored.
- A framework-free calculation package (loan amortisation, interest, retirement
  projection, time-range vocabulary, and three portfolio-performance strategies
  — discrete/continuous/hybrid) is consumed by both the app and the server
  functions, and holds the repo's only TypeScript tests (`ops/health-monitor`
  has its own Python test). How a holding is valued, and the owner decisions
  D1–D4 behind the numbers, are in `docs/adr/0001-valuation-resolution.md`.

## Non-obvious structure

- `services/` is a standalone package with its own deps and test runner, but it
  is consumed by escaping the path alias: `@/../services/...`. There is no
  workspace link. `services/vitest.config.ts` re-implements that alias by hand,
  so moving `services/` or adding a real alias breaks both sides.
- Server functions import types *upward* out of `frontend/lib/types/`
  (classification is the main one). The backend depends on the app, not the
  reverse. Do not "fix" this by duplicating the types.
- Every price chart and performance range reads the stored **closes**, never
  the ticks: `services/finance/metalPriceFeed.ts` turns them into the slot
  series (daily/weekly/quarterly, gaps kept as null). Close subscriptions stop
  at the current bucket and end at the `latest` query, so the minutely write
  only re-runs that one-row query. Keep it that way when adding a range.
- The remaining Hono router in `app/(api)/api/[[...route]]` serves only the
  World Bank routes.
- World Bank data has two independent paths: the public API route hits the
  upstream API live behind an in-memory TTL cache, while the document store
  separately mirrors indicators for search and favourites. Neither feeds the
  other.
- CSP is set in `proxy.ts` (nonce-based, auth-provider strict mode), never in
  `next.config.mjs` — a new third-party domain means editing `proxy.ts`. Strict
  mode is production-only on purpose: enabling it in dev sends HMR into a
  reload loop.
- `dev` runs Turbopack but `build` is pinned to `--webpack` deliberately.
- `categories.ts` merges SnapTrade positions and Bitpanda holdings into one
  `positions` array typed `CategoryPosition`, a union discriminated by
  `provider`. Bitpanda rows have no native cost basis or P&L by design.
- Every category query and the server-side net worth read holdings through
  one loader (`convex/lib/netWorth.ts` `loadHoldings`) and one aggregator
  (`services/portfolio/aggregate.ts`). Do not add a second sum.
- User-facing text is next-intl only: keys in `frontend/messages/en|de/<ns>.json`
  (registered in `frontend/i18n/messages.ts`; `services/i18n/i18n.test.ts`
  enforces parity). Errors a user sees are `userError(code, params)` from
  `convex/lib/userError.ts`, codes in `services/i18n/userErrorCodes.ts`.
- `eslint-rules/no-raw-error-log.mjs` forbids logging a caught error raw
  (provider errors carry credentials); pass it through `describeError()` or
  `redactSecrets()` from `services/security/providerError.ts` first.
- `docs/` holds current reference docs and ADRs; finished plans are in
  `docs/archive/` with a status line and are not instructions. The backlog is
  in Linear (`ToDo.md` points there), not in the repo.

## Operational commands

```bash
cd frontend && bun install --frozen-lockfile && bunx convex dev   # codegen + dev backend, keep running
bun run dev                                     # app on :3000
bun run build                                   # convex codegen, then webpack build
bun run lint
bun run check                                   # lint + tsc (app, convex) + services tests = CI
# (no manual backend deploy: Vercel production builds run `convex deploy`)

cd services && bun install --frozen-lockfile && bun run test   # vitest
```

## Deployments

- **Production:** Convex deployment `handsome-gecko-941`. Only the Vercel
  production build deploys it: `bun run build:vercel` runs
  `convex deploy --cmd 'bun run build'` when `VERCEL_ENV=production`, with the
  production `CONVEX_DEPLOY_KEY` from Vercel. Every merge to `main` therefore
  ships matching frontend and backend. Never push functions to prod by hand.
- `build:vercel` (prod branch) goes through `frontend/scripts/vercel-build.sh`,
  which retries `convex deploy` up to twice (30s, 60s) only on `RaceDetected`
  (concurrent push from near-simultaneous merges); other failures exit as-is.
  It skips the retry once `main` has moved past the build's commit, so an
  older build never pushes its functions over a newer one.
- **Dev:** Convex deployment `blessed-ermine-693` (`frontend/.env.local`).
  `bunx convex dev` pushes there; Vercel preview builds also use it, for
  codegen only.
- Provider-syncing crons (daily sync, Bitpanda) run only where
  `SCHEDULED_SYNC_ENABLED=true`, which is set on prod alone.
- A deploy key in `.env.local` silently overrides `--prod`. To run a command
  against prod, pass the prod key explicitly (for example
  `--env-file <prod env file>`).

CI is `.github/workflows/ci.yml`: frozen installs (text `bun.lock` in both
`frontend/` and `services/`), `convex codegen` against the **dev** deployment
(secret `CONVEX_DEPLOY_KEY_DEV`), then `bun run check`. The `check` job is a
required status on `main`. After changing dependencies, commit the regenerated
`bun.lock` or CI and Vercel (`--frozen-lockfile`) fail. `frontend/` has no test
runner; put testable logic in `services/`.

- Third-party source is vendored under `.vibe/sources/`. To read a dependency's real implementation instead of guessing, run `vibe vendor <pkg>`. Prefer this over recalling the API from memory.
