import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";

export const runtime = "edge";

const app = new Hono().get("/", clerkMiddleware(), (c) => {
  const user = getAuth(c);
  return c.json({
    message: "Hello accounts ;)",
    userId: user?.userId,
  });
});

export default app;
