import { Hono } from "hono";
import { handle } from "hono/vercel";

import metals from "./metals";
import worlddata from "./worlddata";
import worldbankSync from "./worldbank-sync";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

const routes = app
  .route("/metals", metals)
  .route("/world-data", worlddata)
  .route("/worldbank", worldbankSync);

export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
