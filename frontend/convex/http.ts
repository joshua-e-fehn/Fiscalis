import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  hashApiKey,
  parseBearerApiKey,
} from "../../services/apiKeys/apiKeyService";

// ═══════════════════════════════════════════════════════════════
// Convex HTTP Router
// Health check + the public, API-key authenticated REST API.
// Served from https://<deployment>.convex.site
// ═══════════════════════════════════════════════════════════════

const http = httpRouter();

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

http.route({
  path: "/api/v1/net-worth",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const key = parseBearerApiKey(request.headers.get("Authorization"));
    if (!key) return unauthorized();

    try {
      const result = await ctx.runMutation(
        internal.apiKeys.readNetWorthWithKey,
        { keyHash: await hashApiKey(key) },
      );

      switch (result.status) {
        case "ok":
          return new Response(JSON.stringify(result.body), {
            status: 200,
            headers: API_HEADERS,
          });
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
