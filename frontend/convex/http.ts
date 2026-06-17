import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
// Convex HTTP Router
// Handles webhook callbacks from external services
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

export default http;
