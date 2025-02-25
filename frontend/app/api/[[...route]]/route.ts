import { Hono } from "hono";
import { handle } from "hono/vercel";

import accounts from "./accounts";
import metals from "./metals";

export const runtime = "edge";

const app = new Hono().basePath("/api");

const routes = app.route("/accounts", accounts).route("/metals", metals);
export const GET = handle(app);
export const POST = handle(app);

export type AppType = typeof routes;
