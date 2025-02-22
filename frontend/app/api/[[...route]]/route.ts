import { Hono } from "hono";
import { handle } from "hono/vercel";
import { z } from "zod";

import accounts from "./accounts";
import rawMaterials from "./rawMaterials";

export const runtime = "edge";

const app = new Hono().basePath("/api");

const routes = app
  .route("/accounts", accounts)
  .route("/raw-materials", rawMaterials);
export const GET = handle(app);
export const POST = handle(app);

export type AppType = typeof routes;
