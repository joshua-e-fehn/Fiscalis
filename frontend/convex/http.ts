import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  hashApiKey,
  parseBearerApiKey,
} from "../../services/apiKeys/apiKeyService";
import { netWorthApiCurrency } from "../../services/portfolio/aggregate";
import { DISPLAY_CURRENCIES } from "../../services/finance/displayCurrency";
import { evaluateFreshness } from "../../services/health/freshness";
import { monitorSecretMatches } from "../../services/health/syncRuns";
import {
  metalArchiveEnabled,
  metalArchivePrefix,
  metalArchiveRequired,
  scheduledSyncEnabled,
} from "./lib/scheduledSync";

// ═══════════════════════════════════════════════════════════════
// Convex HTTP Router
// Health checks + the public, API-key authenticated REST API.
// Served from https://<deployment>.convex.site
// ═══════════════════════════════════════════════════════════════

const http = httpRouter();

/** The /health/deep report at `now`, with this deployment's settings. */
async function deepHealthReport(ctx: ActionCtx, now: number) {
  const inputs = await ctx.runQuery(internal.health.freshnessInputs, {});
  return evaluateFreshness(
    inputs,
    {
      archiveEnabled: metalArchiveEnabled(),
      archiveRequired: metalArchiveRequired(),
      scheduledSyncEnabled: scheduledSyncEnabled(),
    },
    now,
  );
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }),
});

// Feed and cron freshness, polled by the uptime monitor
// (ops/health-monitor/): 200 when every check passes, 503 otherwise. The
// body holds only check names and ages (services/health/freshness.ts),
// never user data, so it needs no auth.
http.route({
  path: "/health/deep",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    };
    try {
      const report = await deepHealthReport(ctx, Date.now());
      return new Response(JSON.stringify(report), {
        status: report.ok ? 200 : 503,
        headers,
      });
    } catch {
      console.error("GET /health/deep failed");
      return new Response(JSON.stringify({ ok: false, critical: true, checks: [] }), {
        status: 503,
        headers,
      });
    }
  }),
});

// The newest ?days=N (default 30, 1..1000) entries of the metal price
// archive log, newest first, so the off-site monitor can check each S3
// object's size and checksum. Public price metadata only (day, key, rows,
// bytes, sha256 plus bucket and prefix), never credentials or user data.
http.route({
  path: "/health/metal-archive-ledger",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    };
    try {
      const param = new URL(request.url).searchParams.get("days");
      const requested = param === null || param === "" ? Number.NaN : Number(param);
      const days = Number.isFinite(requested) ? requested : undefined;
      const archiveEnabled = metalArchiveEnabled();
      const entries = await ctx.runQuery(internal.health.metalArchiveLedger, { days });
      return new Response(
        JSON.stringify({
          archiveEnabled,
          prefix: archiveEnabled ? metalArchivePrefix() : null,
          bucket: archiveEnabled ? (process.env.METAL_ARCHIVE_BUCKET ?? null) : null,
          days: entries,
        }),
        { status: 200, headers },
      );
    } catch {
      console.error("GET /health/metal-archive-ledger failed");
      return new Response(JSON.stringify({ error: "ledger unavailable" }), {
        status: 503,
        headers,
      });
    }
  }),
});

// The last 24 hours of provider syncs (convex/syncRuns.ts failureDigest)
// plus the /health/deep checks, for the monitor's daily Slack digest
// (ops/health-monitor/, --digest). Counts and error codes per provider, no
// user ids, but still operational detail: only the monitor may read it,
// with the FISCALIS_MONITOR_SECRET env var in the X-Fiscalis-Monitor-Secret
// header. Unset or wrong, it answers 401 like any other bad request.
http.route({
  path: "/health/sync-digest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    };
    const authorized = await monitorSecretMatches(
      request.headers.get("X-Fiscalis-Monitor-Secret"),
      process.env.FISCALIS_MONITOR_SECRET,
    );
    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers,
      });
    }
    try {
      const now = Date.now();
      const [digest, health] = await Promise.all([
        ctx.runQuery(internal.syncRuns.failureDigest, { now }),
        deepHealthReport(ctx, now),
      ]);
      return new Response(JSON.stringify({ ...digest, health }), {
        status: 200,
        headers,
      });
    } catch {
      console.error("GET /health/sync-digest failed");
      return new Response(JSON.stringify({ error: "digest unavailable" }), {
        status: 503,
        headers,
      });
    }
  }),
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC API v1 (API key auth)
// ═══════════════════════════════════════════════════════════════
//
// Security notes:
//  - Keys are accepted only in the Authorization header, never in the URL,
//    so they do not end up in access logs, browser history or Referer headers.
//  - No CORS headers are sent: the API is for server-side/programmatic use, and
//    browsers will refuse to expose responses to other origins.
//  - Every auth failure (missing, malformed, unknown, revoked, expired key)
//    returns the same 401 body so the response is not an oracle.
//  - Responses are marked no-store so financial data is never cached.

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;

function apiError(
  status: number,
  code: string,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...API_HEADERS, ...extraHeaders },
  });
}

const unauthorized = () =>
  apiError(401, "unauthorized", "Missing or invalid API key.", {
    "WWW-Authenticate": 'Bearer realm="fiscalis"',
  });

const invalidCurrency = () =>
  apiError(
    400,
    "invalid_currency",
    `currency must be one of ${DISPLAY_CURRENCIES.join(", ")}.`,
  );

http.route({
  path: "/api/v1/net-worth",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const key = parseBearerApiKey(request.headers.get("Authorization"));
    if (!key) return unauthorized();

    // Optional ?currency=USD|GBP|CHF (EUR when absent); the code is never
    // echoed back, so a bad value cannot be reflected
    const currencyParam = new URL(request.url).searchParams.get("currency");
    const currency = netWorthApiCurrency(currencyParam);
    if (!currency) return invalidCurrency();

    try {
      const result = await ctx.runMutation(
        internal.apiKeys.readNetWorthWithKey,
        { keyHash: await hashApiKey(key), currency },
      );

      switch (result.status) {
        case "ok":
          return new Response(JSON.stringify(result.body), {
            status: 200,
            headers: API_HEADERS,
          });
        case "invalid_currency":
          return invalidCurrency();
        case "rate_limited":
          return apiError(429, "rate_limited", "Too many requests.", {
            "Retry-After": String(result.retryAfterSeconds),
          });
        default:
          return unauthorized();
      }
    } catch {
      // Never echo internal errors (they may contain data) to API clients.
      console.error("GET /api/v1/net-worth failed");
      return apiError(500, "internal_error", "Internal error.");
    }
  }),
});

export default http;
