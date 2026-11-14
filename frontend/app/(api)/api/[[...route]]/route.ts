import { Hono } from "hono";
import { handle } from "hono/vercel";

import worlddata from "./worlddata";
import worldbankSync from "./worldbank-sync";

export const runtime = "nodejs";

// Metal prices and FX rates are served by Convex (convex/metalPrices.ts,
// convex/fxRates.ts); only the World Bank routes remain here.
const app = new Hono()
  .basePath("/api")
  .route("/world-data", worlddata)
  .route("/worldbank", worldbankSync);

export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);
