# Fiscalis frontend

The Next.js 16 app (App Router, React 19) and its Convex backend in
`convex/`. Product overview, CI and deployments: [../README.md](../README.md).
Agent rules and structure gotchas: [../AGENTS.md](../AGENTS.md).

## Run it

```bash
bun install --frozen-lockfile
bunx convex dev    # codegen + push to the dev deployment, keep running
bun run dev        # http://localhost:3000
bun run check      # what CI runs: lint, both tsc projects, services tests
```

## Environment

**Next.js** (`frontend/.env.local`, Vercel project settings):

| Variable | Purpose |
| --- | --- |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` | Convex deployment (written by `convex dev`) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Optional: Convex HTTP origin for the API-key settings; derived from the `.convex.cloud` URL when unset |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk auth |
| `NEXT_PUBLIC_FEATURES` | Comma-separated flags for unbuilt menu entries (`services/features/featureFlags.ts`); all off by default |
| `NEXT_PUBLIC_I18N_PREVIEW` | `1` offers every language before it is released |
| `CONVEX_DEPLOY_KEY` | Vercel only: production key for prod builds, dev key for previews |

**Convex** (set with `bunx convex env set`, per deployment):

| Variable | Purpose |
| --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk issuer for `auth.config.ts` |
| `CONVEX_ENCRYPTION_KEY` | AES-256-GCM key for provider tokens and Bitpanda keys |
| `PLAID_CLIENT_ID`, `PLAID_SANDBOX_SECRET`, `PLAID_PRODUCTION_SECRET`, `PLAID_ENV` | Plaid |
| `PLAID_PRODUCTS`, `PLAID_COUNTRY_CODES` | Plaid Link products and countries |
| `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_SECRET` | SnapTrade |
| `SCHEDULED_SYNC_ENABLED` | `true` only on production: enables the provider-syncing crons |
| `METAL_PRICES_URL` | Optional override of the gold.de price feed |
| `METAL_ARCHIVE_BUCKET`, `METAL_ARCHIVE_REGION`, `METAL_ARCHIVE_ENDPOINT`, `METAL_ARCHIVE_ACCESS_KEY_ID`, `METAL_ARCHIVE_SECRET_ACCESS_KEY`, `METAL_ARCHIVE_PREFIX`, `METAL_ARCHIVE_REQUIRED` | S3 archive of minutely metal prices (`convex/actions/metalPriceArchive.ts`) |

Bitpanda needs no app credentials: each user enters a read-only API key.

## Layout

```
app/
  (website)/       public landing, privacy, terms, impressum
  (auth)/          Clerk sign-in, sign-up, waitlist
  (onboarding)/    onboarding flow (the app is gated behind it)
  (root)/          signed-in app: dashboard, assets/*, liabilities, integrations,
                   retirement, tools (calculators, world map), settings
  (api)/api/       Hono catch-all: public World Bank routes only
convex/
  schema.ts, crons.ts, http.ts   tables, scheduled jobs, HTTP routes
  actions/         provider calls: plaid, snaptrade, bitpanda, syncAll, price archive
  lib/             auth, encryption, netWorth (the one holdings loader), userError
  *.ts             queries and mutations per domain
components/atomic/ atoms, molecules, organisms; ui/ holds shadcn/ui
hooks/convex/      one hook module per domain, returning display-currency values
hooks/performance/ useCategoryPerformance and friends
i18n/, messages/   next-intl setup; messages/{en,de}/<namespace>.json
proxy.ts           Clerk middleware and the Content-Security-Policy
eslint-rules/      repo-specific lint rules
```

## Conventions

- **Logic lives in `services/`** with tests and is imported as
  `@/../services/...`. Pages and Convex functions call it rather than
  re-implementing it.
- **Money:** format with `formatCurrency`; aggregate in EUR and convert at
  the presentation boundary via the `hooks/convex/*` hooks.
- **Text:** every user-facing string goes through next-intl
  (`useTranslations` on the client, `getTranslations` on the server). Add
  keys to both `messages/en/<ns>.json` and `messages/de/<ns>.json` (German
  uses "du"); `services/i18n/i18n.test.ts` checks parity. Category names come
  from `useCategoryLabels()`.
- **Errors shown to users** are thrown from Convex as
  `userError(code, params)` (`convex/lib/userError.ts`) and rendered with
  `useErrorMessage()`; codes are in `services/i18n/userErrorCodes.ts`.
- **CSP:** a new third-party origin means editing `proxy.ts`, never
  `next.config.mjs`.
