import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { registerRoutes as registerStripeRoutes } from "@convex-dev/stripe";
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
import { verifySvixSignature } from "../../services/security/svixSignature";
import { deletedClerkUserId } from "../../services/privacy/userData";
import { billingNotification } from "../../services/notifications/notifications";

// ═══════════════════════════════════════════════════════════════
// Convex HTTP Router
// Health checks, provider webhooks (Plaid, SnapTrade, Clerk) and the public,
// API-key authenticated
// REST API.
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
// CLERK WEBHOOK
// ═══════════════════════════════════════════════════════════════
//
// user.deleted (registered in the Clerk dashboard) purges the user's data,
// whether the account was deleted in the app (account.deleteMyAccount, whose
// purge this repeats harmlessly) or in Clerk directly. Deliveries are signed
// by Svix under CLERK_WEBHOOK_SECRET; anything unsigned is rejected before
// the body is parsed. Other event types are acknowledged and ignored.

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error("POST /clerk-webhook: CLERK_WEBHOOK_SECRET is not set");
      return new Response(null, { status: 500 });
    }

    const body = await request.text();
    const verified = await verifySvixSignature(
      secret,
      {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      },
      body,
      Date.now(),
    );
    if (!verified.ok) {
      console.warn(`POST /clerk-webhook rejected: ${verified.reason}`);
      return new Response(null, { status: 401 });
    }

    let event: unknown;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response(null, { status: 400 });
    }

    const userId = deletedClerkUserId(event);
    if (userId) {
      await ctx.scheduler.runAfter(0, internal.account.deleteUserData, {
        userId,
        deleteClerkUser: false,
      });
    }
    return new Response(null, { status: 204 });
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
        case "plan_required":
          return apiError(403, "plan_required", "API access requires the Pro plan.");
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

// ═══════════════════════════════════════════════════════════════
// PROVIDER WEBHOOKS (ENG-240)
// ═══════════════════════════════════════════════════════════════
//
// Unauthenticated by design: each provider signs its requests, and the
// signature is checked before anything is read from the body (Plaid: ES256
// JWT in Plaid-Verification, SnapTrade: HMAC in Signature). The response
// carries no body, so it reveals nothing.

/** Larger bodies are refused unread; real webhooks are a few KB. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

async function readWebhookBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return null;
  const body = await request.text();
  return body.length > MAX_WEBHOOK_BYTES ? null : body;
}

const webhookResponse = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

// Registered per item: link tokens carry it (actions/plaid.ts createLinkToken),
// older items get it from actions/plaid.ts updateItemWebhooks
http.route({
  path: "/plaid-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await readWebhookBody(request);
    if (body === null) return webhookResponse(413);
    try {
      const { status } = await ctx.runAction(internal.actions.plaid.receiveWebhook, {
        body,
        verification: request.headers.get("Plaid-Verification") ?? undefined,
      });
      return webhookResponse(status);
    } catch {
      // A 5xx makes Plaid retry
      console.error("POST /plaid-webhook failed");
      return webhookResponse(500);
    }
  }),
});

// Registered once in the SnapTrade dashboard
http.route({
  path: "/snaptrade-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await readWebhookBody(request);
    if (body === null) return webhookResponse(413);
    try {
      const { status } = await ctx.runAction(internal.actions.snaptrade.receiveWebhook, {
        body,
        signature: request.headers.get("Signature") ?? undefined,
      });
      return webhookResponse(status);
    } catch {
      console.error("POST /snaptrade-webhook failed");
      return webhookResponse(500);
    }
  }),
});

// ═══════════════════════════════════════════════════════════════
// STRIPE WEBHOOK (ENG-198)
// ═══════════════════════════════════════════════════════════════
//
// POST /stripe/webhook, registered in the Stripe dashboard. The component
// verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET before
// it reads the event, then syncs customers, subscriptions and invoices into
// its tables (billing.ts reads them for the plan).
// After its own syncing, a plan start or end and a failed payment notify
// the user (services/notifications/notifications.ts billingNotification).
registerStripeRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  onEvent: async (ctx, event) => {
    const billing = billingNotification(event);
    if (!billing) return;
    try {
      await ctx.runMutation(internal.notifications.notifyUser, {
        userId: billing.userId,
        ...billing.content,
      });
    } catch {
      // The webhook's own work is done; a lost notification is not a retry
      console.error(`POST /stripe/webhook: ${event.type} notification not written`);
    }
  },
});

export default http;
