import { Hono } from "hono";
import { handle } from "hono/vercel";

import fx from "./fx";
import metals from "./metals";
import worlddata from "./worlddata";
import worldbankSync from "./worldbank-sync";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

const routes = app
  .route("/fx", fx)
  .route("/metals", metals)
  .route("/world-data", worlddata)
  .route("/worldbank", worldbankSync);

export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
