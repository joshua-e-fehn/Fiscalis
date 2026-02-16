# Security & CSP Guide

> **For AI agents and developers** — rules and gotchas for the XSS/CSRF security setup.

## Architecture Overview

Security is split across three files:

| File                       | Responsibility                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| `frontend/proxy.ts`        | Auth (Clerk) + **CSP header** (nonce-based strict in prod, default in dev) |
| `frontend/next.config.mjs` | Non-CSP security headers (HSTS, X-Frame-Options, etc.)                     |
| `frontend/app/layout.tsx`  | `<ClerkProvider dynamic>` — required for nonce propagation to the client   |

### How It Works

- **Production:** Clerk's `contentSecurityPolicy: { strict: true }` generates a unique **nonce per request**, injects a full `Content-Security-Policy` header, and passes the nonce to `<ClerkProvider dynamic>` automatically. Inline scripts without the nonce are blocked.
- **Development:** `strict: true` is disabled (`isProd` guard). Clerk falls back to its `default` CSP mode which uses `'unsafe-inline'` — this is necessary because Turbopack/webpack HMR injects inline scripts that don't carry the nonce and would otherwise cause an infinite reload loop.

---

## CSP Directives (proxy.ts)

Custom directives in `proxy.ts` are **merged** with Clerk's built-in ones (`img.clerk.com`, `challenges.cloudflare.com`, `clerk-telemetry.com`, etc.).

### Current Directives

| Directive                | Domains                                                                                                                                | Reason                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `connect-src`            | `*.convex.cloud`, `wss://*.convex.cloud`, `api.worldbank.org`, `basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`, `connect.vezgo.com` | Convex real-time, World Bank API, CARTO map tiles, Vezgo  |
| `connect-src` (dev only) | `ws://localhost:*`, `ws://127.0.0.1:*`                                                                                                 | Dev tools (console-ninja etc.) WebSocket connections      |
| `script-src`             | `cdn.plaid.com`                                                                                                                        | Plaid Link loads scripts at runtime                       |
| `frame-src`              | `*.plaid.com`, `connect.vezgo.com`, `app.snaptrade.com`                                                                                | Plaid Link iframe, Vezgo Connect widget, SnapTrade portal |
| `img-src`                | `data:`, `blob:`, `basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`                                                                   | Inline SVGs, MapLibre blob images, CARTO sprites          |
| `font-src`               | `'self'`, `basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`                                                                           | Next.js self-hosted Inter font + CARTO map label glyphs   |
| `worker-src`             | `blob:`                                                                                                                                | MapLibre Web Workers for tile parsing                     |

### Non-CSP Security Headers (next.config.mjs)

| Header                      | Value                                                          | Purpose                         |
| --------------------------- | -------------------------------------------------------------- | ------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                                      | Prevent MIME-sniffing XSS       |
| `X-Frame-Options`           | `DENY`                                                         | Prevent clickjacking            |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                              | Limit referrer leakage          |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                          | Enforce HTTPS for 1 year        |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disable unused browser features |
| `poweredByHeader`           | `false`                                                        | Hide `X-Powered-By: Next.js`    |

---

## Rules for AI Agents

### Adding a New External Service

1. **Identify the resource type** — is it a script, iframe, fetch/XHR, WebSocket, image, font, or worker?
2. **Add the domain to the correct directive** in `proxy.ts` → `contentSecurityPolicy.directives`:
   - Fetch / XHR → `connect-src`
   - WebSocket → `connect-src` (with `wss://` scheme prefix)
   - Script loaded at runtime → `script-src`
   - Iframe → `frame-src`
   - Image → `img-src`
   - Font → `font-src`
   - Web Worker → `worker-src`
3. **Never edit `next.config.mjs` for CSP changes** — CSP is exclusively managed in `proxy.ts`.

### Critical Gotchas

| Gotcha                         | Detail                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wildcard scope**             | `*.x.com` does **NOT** match `x.com` itself — add both `x.com` and `*.x.com` if needed.                                                                                                     |
| **Schemeless = https only**    | A schemeless domain like `*.convex.cloud` only matches `https://`. For WebSocket connections you **MUST** also add `wss://*.convex.cloud`.                                                  |
| **Overriding default-src**     | Explicitly setting a directive (e.g. `font-src`) overrides the `default-src 'self'` fallback. Always include `'self'` if same-origin resources are needed for that type.                    |
| **No unsafe-inline/eval**      | Never add `'unsafe-inline'` or `'unsafe-eval'` to `script-src`. The strict nonce policy eliminates the need. If inline scripts are required, use the nonce from `headers().get('x-nonce')`. |
| **strict: true is prod-only**  | `strict: true` **MUST** remain behind the `isProd` guard. Turbopack/webpack HMR injects inline scripts without the nonce → infinite reload loop in dev.                                     |
| **Dev-only localhost entries** | `ws://localhost:*` and `ws://127.0.0.1:*` in `connect-src` are gated behind `!isProd` — they allow dev tools to open WebSocket connections. Never add these to production.                  |
| **ClerkProvider dynamic**      | `<ClerkProvider dynamic>` in `app/layout.tsx` is required for the nonce to propagate to the client. Removing `dynamic` breaks strict CSP in production.                                     |
| **Clerk version**              | `contentSecurityPolicy` option requires `@clerk/nextjs >=6.14.0`.                                                                                                                           |

### Testing CSP Changes

1. **Dev mode** — run `bun run dev`, open the browser console, check for `Refused to load/connect/execute` CSP violation errors.
2. **Production mode** — run `bun run build && bun run start`, inspect the `Content-Security-Policy` response header in DevTools → Network, and verify it contains `nonce-...` (not `'unsafe-inline'`).
3. **Key flows to test** — Plaid Link, SnapTrade connect, Vezgo connect, World Map (CARTO tiles + MapLibre workers), any page loading Convex data (WebSocket).

### CSRF Protection (Already Handled)

| Vector           | Protection                                                   |
| ---------------- | ------------------------------------------------------------ |
| Convex mutations | WebSocket + JWT auth (not cookie-based)                      |
| Hono API routes  | Clerk middleware calls `auth.protect()` on non-public routes |
| Form submissions | Clerk's CSP includes `form-action 'self'` by default         |
| Session cookies  | Clerk manages with `HttpOnly`, `Secure`, `SameSite=Lax`      |

### Open Items

- **Vezgo webhook signature verification** — commented out in `convex/http.ts` (lines 42-44). Enable when Vezgo provides signing keys.
- **Rate limiting** on public API routes (`/api/world-data`, `/api/worldbank/sync`) — consider Vercel WAF or middleware-based rate limiter.
