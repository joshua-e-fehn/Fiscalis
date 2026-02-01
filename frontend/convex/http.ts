import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════════
// Convex HTTP Router
// Handles webhook callbacks from external services
// ═══════════════════════════════════════════════════════════════

const http = httpRouter();

// ═══════════════════════════════════════════════════════════════
// VEZGO WEBHOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Vezgo Webhook Handler
 *
 * Handles webhook events from Vezgo:
 * - connection.synced: Account successfully synced
 * - connection.error: Sync failed
 * - connection.disconnected: User disconnected account
 *
 * Webhook URL: https://<your-convex-deployment>.convex.site/webhooks/vezgo
 */
http.route({
  path: "/webhooks/vezgo",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();

      // Log webhook event for debugging
      console.log("Vezgo webhook received:", {
        event: body.event,
        accountId: body.account_id,
      });

      // Verify webhook signature if Vezgo provides one
      // const signature = request.headers.get("x-vezgo-signature");
      // if (!verifyWebhookSignature(body, signature)) {
      //   return new Response("Invalid signature", { status: 401 });
      // }

      switch (body.event) {
        case "connection.synced":
          // Account was successfully synced by Vezgo
          // Find and update the connection, then trigger a position sync
          if (body.account_id) {
            const connection = await ctx.runQuery(
              internal.crypto.getConnectionByAccountId,
              { accountId: body.account_id },
            );

            if (connection) {
              // Schedule a sync to fetch the latest data
              await ctx.scheduler.runAfter(
                0,
                internal.actions.vezgo.syncConnectionInternal,
                {
                  userId: connection.userId,
                  connectionId: connection._id,
                  accountId: body.account_id,
                },
              );

              // Also sync transactions
              await ctx.scheduler.runAfter(
                1000, // 1 second delay to let positions sync first
                internal.actions.vezgo.syncTransactionsInternal,
                {
                  userId: connection.userId,
                  connectionId: connection._id,
                  accountId: body.account_id,
                },
              );
            }
          }
          break;

        case "connection.error":
          // Sync failed for this account
          if (body.account_id) {
            const connection = await ctx.runQuery(
              internal.crypto.getConnectionByAccountId,
              { accountId: body.account_id },
            );

            if (connection) {
              await ctx.runMutation(internal.crypto.updateConnectionStatus, {
                connectionId: connection._id,
                status: "error",
                errorMessage:
                  body.error?.message || "Sync failed (webhook notification)",
              });
            }
          }
          break;

        case "connection.disconnected":
          // User disconnected the account from Vezgo
          // We could either mark as disconnected or delete
          if (body.account_id) {
            const connection = await ctx.runQuery(
              internal.crypto.getConnectionByAccountId,
              { accountId: body.account_id },
            );

            if (connection) {
              await ctx.runMutation(internal.crypto.updateConnectionStatus, {
                connectionId: connection._id,
                status: "disconnected",
                errorMessage: "Disconnected by provider",
              });
            }
          }
          break;

        default:
          console.log("Unhandled Vezgo webhook event:", body.event);
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Vezgo webhook error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }),
});

/**
 * Vezgo Webhook Health Check
 *
 * GET endpoint for webhook verification/testing
 */
http.route({
  path: "/webhooks/vezgo",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "vezgo-webhook",
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
