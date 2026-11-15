import { defineApp } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";

const app = defineApp();
// Per-user throttles on user-triggered paid provider calls (lib/rateLimit.ts)
app.use(rateLimiter);
// Batched, resumable data migrations (migrations.ts `migrations.define`)
app.use(migrations);
// Stripe customers, subscriptions and invoices, synced by the verified
// webhook at /stripe/webhook (http.ts, billing.ts)
app.use(stripe);

export default app;
