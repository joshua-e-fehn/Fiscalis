import { Hono } from "hono";
import { handle } from "hono/vercel";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";

export const runtime = "edge";

const app = new Hono().basePath("/api");

app.get("/hello", clerkMiddleware(), (c) => {
  const user = getAuth(c);
  if (!user?.userId) {
    return c.json({
      message: "Hello Next.js! ;)",
    });
  } else {
    return c.json({
      message: "Hello Next.js! ;)",
      userId: user.userId,
    });
  }
});

export const GET = handle(app);
export const POST = handle(app);
