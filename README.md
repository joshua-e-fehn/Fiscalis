# Fiscalis

A private, EUR-first net worth and wealth tracker. Fiscalis pulls bank,
broker and Bitpanda accounts together with a manually kept precious-metals
vault and loans, values everything in one currency, and shows honest,
flow-adjusted performance and a retirement plan funded from real net worth.

Sign-up is waitlist-only. The backlog is in Linear (see [ToDo.md](./ToDo.md)).

## What it does

- **Banking** via Plaid: balances and an incrementally synced transaction
  history (`/transactions/sync`).
- **Brokers** via SnapTrade: accounts, positions, cash and activities.
- **Bitpanda** via a read-only API key: crypto, metals, stocks/ETFs and fiat
  wallets, synced every 6 hours.
- **Metals vault**: coins and bars entered by hand, valued at live spot
  (a minutely gold.de feed) with calibrated dealer premiums
  ([docs/METAL_PREMIUMS.md](./docs/METAL_PREMIUMS.md)).
- **Loans**: amortisation for every repayment type, recorded payments,
  What-If scenarios.
- **Net worth and performance**: one server-side aggregator for the
  dashboard, daily snapshots and the API. Investment categories are
  flow-adjusted (Modified Dietz chained into TWR); see
  [docs/adr/0001-valuation-resolution.md](./docs/adr/0001-valuation-resolution.md).
- **Retirement planner** funded from the current net worth.
- **World Bank data**: map and per-country indicator views.
- **Display currency** EUR, USD, GBP or CHF. Everything is stored in EUR and
  converted at the presentation boundary (latest daily rate for totals,
  each day's rate for charts).
- **Languages**: English and German (next-intl).
- **Read-only API**: `GET /api/v1/net-worth` with user-scoped API keys
  ([docs/API.md](./docs/API.md)).

## Architecture

```
Next.js 16 app (frontend/)  ──WebSocket──▶  Convex (frontend/convex/)
  React 19, Clerk auth,                      system of record: user data,
  next-intl, shadcn/ui                       snapshots, metal prices, FX,
  Hono route: World Bank only                crons, HTTP routes (/health,
                                             /health/deep, /api/v1/net-worth)
            │                                        │
            └── services/ (pure TS + vitest) ◀───────┘
                calculations used by both sides
```

- **Convex is the only backend.** Supabase, its SQL price tables and drizzle
  were retired on 2026-11-14. Metal prices are ingested by a Convex cron
  every minute and kept as hour/day closes; finished days of raw ticks are
  archived to S3.
- **Providers:** Plaid (banking), SnapTrade (brokers), Bitpanda (mixed
  assets). A rule-priority engine in `services/classification/` maps each
  provider's vocabulary onto one category/subcategory taxonomy; users can
  override a holding's category.
- **Scheduled jobs** (`frontend/convex/crons.ts`): daily provider sync and
  snapshot (06:00 UTC), Bitpanda every 6 h, FX every 6 h, metal prices every
  minute, tick archive and prune daily, World Bank weekly. Provider-syncing
  crons run only where `SCHEDULED_SYNC_ENABLED=true` (production).
- **Security:** provider tokens and Bitpanda keys are AES-256-GCM encrypted
  at rest and API keys are stored only as a SHA-256 hash; every Convex function derives the user from auth and checks document
  ownership; CSP is nonce-based and set in `frontend/proxy.ts`
  ([docs/SECURITY_CSP_GUIDE.md](./docs/SECURITY_CSP_GUIDE.md)).

## Repository layout

```
frontend/        Next.js app, Convex functions (convex/), messages/ (en, de)
services/        Framework-free calculations and their vitest suite
ops/             Health monitor that runs on the Mya VPS
docs/            Current reference docs, ADRs (adr/), archived plans (archive/)
.github/         CI (one "check" job, required on main)
```

## Development

Requires [Bun](https://bun.sh/) and access to the Convex dev deployment.

```bash
cd frontend && bun install --frozen-lockfile
cd ../services && bun install --frozen-lockfile

cd ../frontend
bunx convex dev        # codegen + push to the dev deployment; keep running
bun run dev            # app on http://localhost:3000 (Turbopack)
```

Environment variables are listed in [frontend/README.md](./frontend/README.md).

| Command (in `frontend/`) | What it does |
| --- | --- |
| `bun run check` | lint (0 warnings) + `tsc` for app and Convex + services tests. CI runs exactly this. |
| `bun run lint` | ESLint, including the repo's own rules in `eslint-rules/` |
| `bun run typecheck` | `tsc` for the app and for `convex/` |
| `bun run test:services` | the `services/` vitest suite |
| `bun run build` | `convex codegen`, then `next build --webpack` |

`build` is pinned to webpack on purpose; `dev` uses Turbopack. Testable
logic goes in `services/`; `frontend/` has no test runner of its own.

## CI and deployments

- **CI** (`.github/workflows/ci.yml`): frozen installs of both lockfiles,
  `convex codegen` against the dev deployment, then `bun run check`. The
  `check` job is a required status on `main`. Commit the regenerated
  `bun.lock` after any dependency change.
- **Production:** Convex `handsome-gecko-941`, deployed only by the Vercel
  production build (`build:vercel` runs `convex deploy`). Every merge to
  `main` ships matching frontend and backend. Never push functions to
  production by hand.
- **Dev:** Convex `blessed-ermine-693`. `bunx convex dev` pushes there, and
  Vercel preview builds use it for codegen.
- **Monitoring:** a VPS job polls `/health/deep` every five minutes and
  audits the S3 price archive daily, alerting in Slack
  ([ops/health-monitor/README.md](./ops/health-monitor/README.md)).

## Documentation

| Document | What it covers |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | Contract for coding agents: structure gotchas, deploy rules |
| [frontend/README.md](./frontend/README.md) | App layout, environment variables, conventions |
| [services/README.md](./services/README.md) | The calculation package |
| [docs/](./docs/README.md) | API, metal premiums, CSP, ADRs, archived plans |

## License

Private and proprietary.
