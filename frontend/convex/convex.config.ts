import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp();
// Per-user throttles on user-triggered paid provider calls (lib/rateLimit.ts)
app.use(rateLimiter);

export default app;
