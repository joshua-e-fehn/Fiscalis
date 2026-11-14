/**
 * proxy.ts — Next.js 16 Proxy (middleware)
 *
 * Handles two concerns:
 *  1. Auth: Clerk protects all routes except explicitly public ones.
 *  2. CSP:  Clerk's strict mode generates a per-request nonce and injects a
 *           full Content-Security-Policy header. Custom directives below are
 *           merged with Clerk's built-in ones (img.clerk.com, challenges.cloudflare.com, etc.).
 *
 * Related files:
 *  - next.config.mjs  — non-CSP security headers (HSTS, X-Frame-Options, etc.)
 *  - app/layout.tsx    — <ClerkProvider dynamic> required for nonce propagation
 *
 * @ai-agents
 * When adding new external services or third-party scripts:
 *  - Add the domain to the correct CSP directive below (connect-src, script-src, frame-src, etc.)
 *  - Wildcard `*.x.com` does NOT match `x.com` itself — add both if needed.
 *  - Schemeless domains (e.g. `*.convex.cloud`) only match `https://` — for WebSocket
 *    connections you MUST also add `wss://*.convex.cloud`.
 *  - Explicitly setting a directive (e.g. font-src) overrides the default-src 'self'
 *    fallback — always include `'self'` if same-origin resources are needed.
 *  - If the new service loads scripts at runtime, it MUST be in script-src.
 *  - If it opens an iframe, it MUST be in frame-src.
 *  - Never add 'unsafe-inline' or 'unsafe-eval' to script-src — the strict nonce policy
 *    eliminates the need. If inline scripts are required, use the nonce from
 *    `headers().get('x-nonce')` instead.
 *  - Test CSP changes in the browser console — blocked resources show as CSP violations.
 *  - Clerk's `contentSecurityPolicy` option requires @clerk/nextjs >=6.14.0.
 *  - `strict: true` MUST be production-only — Turbopack/webpack HMR injects inline
 *    scripts that don't carry the nonce, causing an infinite reload loop in dev.
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProd = process.env.NODE_ENV === "production";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/world-data(.*)", // Public World Bank data API
  "/api/worldbank/sync(.*)", // Public World Bank sync API (for cron jobs)
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  {
    // Clerk automatic CSP — strict (nonce-based) in production, default ('unsafe-inline') in dev.
    // Strict mode in dev breaks Turbopack HMR because its injected scripts lack the nonce.
    contentSecurityPolicy: {
      ...(isProd && { strict: true }),
      directives: {
        // Convex real-time (WebSocket + HTTP), Clerk FAPI, World Bank API, CARTO tiles, Vezgo
        // Note: both bare domain and wildcard are needed — *.x.com only matches subdomains, not x.com itself
        // wss: scheme is required separately — schemeless entries only match https:
        "connect-src": [
          "*.convex.cloud",
          "wss://*.convex.cloud",
          "api.worldbank.org",
          "basemaps.cartocdn.com",
          "*.basemaps.cartocdn.com",
          "connect.vezgo.com",
          // Dev tools (e.g. console-ninja) connect via WebSocket on random local ports.
          // 'self' only matches the exact dev server origin, not other ports or 127.0.0.1.
          ...(!isProd ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
        ],
        // Plaid Link script loaded at runtime
        "script-src": ["cdn.plaid.com"],
        // Plaid Link iframe, Vezgo Connect widget, SnapTrade portal, Cloudflare challenges
        "frame-src": ["*.plaid.com", "connect.vezgo.com", "app.snaptrade.com"],
        // Clerk avatars, CARTO map sprites, data URIs (inline SVGs), blob URLs (MapLibre)
        "img-src": [
          "data:",
          "blob:",
          "basemaps.cartocdn.com",
          "*.basemaps.cartocdn.com",
        ],
        // CARTO map glyph/font PBFs + 'self' for Next.js self-hosted Inter font files
        // (explicitly setting font-src overrides the default-src 'self' fallback)
        "font-src": [
          "'self'",
          "basemaps.cartocdn.com",
          "*.basemaps.cartocdn.com",
        ],
        // MapLibre Web Workers use blob URLs for tile parsing
        "worker-src": ["blob:"],
      },
    },
  },
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
