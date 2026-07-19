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
  weekly World Bank sync.
- A second, SQL time-series store reached through a typed query builder, fronted
  by a small typed-RPC HTTP router mounted inside the app's route tree. It
  serves **only** precious-metal price history and FX rates, read-only, fetched
  through a request-cache client rather than the reactive store.
- Hosted auth guards every route except the marketing page and the public world
  data endpoints, and additionally owns the app's Content-Security-Policy.
- Three account-aggregation providers supply raw account/position/transaction
  data; a rule-priority classification engine maps each provider's vocabulary
  onto one shared category/subcategory taxonomy before anything is stored.
- A framework-free calculation package (loan amortisation, interest, retirement
  projection, time-range vocabulary, and three portfolio-performance strategies
  — discrete/continuous/hybrid) is consumed by both the app and the server
  functions, and is the only part of the repo with tests.

## Non-obvious structure

- `services/` is a standalone package with its own deps and test runner, but it
  is consumed by escaping the path alias: `@/../services/...`. There is no
  workspace link. `services/vitest.config.ts` re-implements that alias by hand,
  so moving `services/` or adding a real alias breaks both sides.
- Server functions import types *upward* out of `frontend/lib/types/`
  (classification is the main one). The backend depends on the app, not the
  reverse. Do not "fix" this by duplicating the types.
- The SQL schema still declares `plaidItems`, `plaidTransactions`,
  `brokerConnections`, `brokerPositions`. **Those tables are dead** — the live
  ones with the same names are document-store tables. Only
  `precious_metal_prices` and `currency_exchange_rates` are actually read.
- Nothing in this repo writes those price tables. The writer is the deprecated
  Deno edge function under `backend/`, deployed out-of-band. `frontend/drizzle/`
  and `backend/edge_functions/supabase/migrations/` are byte-identical copies
  and must be changed together.
- World Bank data has two independent paths: the public API route hits the
  upstream API live behind an in-memory TTL cache, while the document store
  separately mirrors indicators for search and favourites. Neither feeds the
  other.
- CSP is set in `proxy.ts` (nonce-based, auth-provider strict mode), never in
  `next.config.mjs` — a new third-party domain means editing `proxy.ts`. Strict
  mode is production-only on purpose: enabling it in dev sends HMR into a
  reload loop.
- `dev` runs Turbopack but `build` is pinned to `--webpack` deliberately.
- `categories.ts` casts Bitpanda holdings to the broker-position doc type so
  category queries can merge both into one `positions` array. The overlap only
  covers the fields consumers read (cost basis / P&L are absent by design).
- `README.md` is stale: it documents Vezgo crypto aggregation, which was
  removed in favour of Bitpanda. The dependency and its CSP entries still
  linger.

## Operational commands

```bash
cd frontend && bun install && bunx convex dev   # codegen + live backend, keep running
bun run dev                                     # app on :3000
bun run build                                   # convex codegen, then webpack build
bun run lint
bun run db:generate | db:migrate | db:studio    # SQL schema only
bunx convex deploy                              # backend deploy

cd services && bun install && bun run test      # vitest — the repo's only tests
```

There is no CI config. `frontend/` has no test runner; put testable logic in
`services/`.

- Third-party source is vendored under `.vibe/sources/`. To read a dependency's real implementation instead of guessing, run `vibe vendor <pkg>`. Prefer this over recalling the API from memory.
