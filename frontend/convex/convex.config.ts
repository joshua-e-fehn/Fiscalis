import { defineApp } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp();
// Per-user throttles on user-triggered paid provider calls (lib/rateLimit.ts)
app.use(rateLimiter);
// Batched, resumable data migrations (migrations.ts `migrations.define`)
app.use(migrations);

export default app;
