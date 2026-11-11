import { Hono } from "hono";
import { handle } from "hono/vercel";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "drizzle-orm";

import { db } from "@/db/drizzle/drizzle";
import type { FxDailyRate } from "@/../services/finance/currency";

import metals from "./metals";
import worlddata from "./worlddata";
import worldbankSync from "./worldbank-sync";

export const runtime = "nodejs";

/**
 * Public, read-only FX market data from the SQL `currency_exchange_rates`
 * store (EUR base). The Convex cron in convex/fxRates.ts mirrors it into the
 * `fxRates` table, the single rate source for base-currency conversion.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const MAX_RANGE_DAYS = 4000;
const DAY_MS = 86_400_000;

const dailyQuery = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .transform(({ from, to }) => {
    const toDate = to ?? new Date().toISOString().slice(0, 10);
    const fromDate =
      from ??
      new Date(Date.parse(toDate) - 14 * DAY_MS).toISOString().slice(0, 10);
    return { from: fromDate, to: toDate };
  })
  .refine(
    ({ from, to }) =>
      from <= to && Date.parse(to) - Date.parse(from) <= MAX_RANGE_DAYS * DAY_MS,
    { message: `from must be on or before to, at most ${MAX_RANGE_DAYS} days` },
  );

const fx = new Hono()
  // ═══════════════════════════════════════════════════════════════
  // DAILY RATES - last observation per UTC day, one row per currency
  // ═══════════════════════════════════════════════════════════════
  .get("/rates/daily", zValidator("query", dailyQuery), async (c) => {
    const { from, to } = c.req.valid("query");
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT ON (date_trunc('day', timestamp))
          to_char(date_trunc('day', timestamp), 'YYYY-MM-DD') AS day,
          from_eur_to_usd,
          from_eur_to_chf
        FROM currency_exchange_rates
        WHERE timestamp >= ${from}::date
          AND timestamp < ${to}::date + INTERVAL '1 day'
        ORDER BY date_trunc('day', timestamp), timestamp DESC
      `);

      const rates: FxDailyRate[] = [];
      for (const row of result.rows as Array<{
        day: string;
        from_eur_to_usd: string | null;
        from_eur_to_chf: string | null;
      }>) {
        const usd = Number(row.from_eur_to_usd);
        const chf = Number(row.from_eur_to_chf);
        if (row.from_eur_to_usd != null && usd > 0)
          rates.push({ date: row.day, currency: "USD", unitsPerEur: usd });
        if (row.from_eur_to_chf != null && chf > 0)
          rates.push({ date: row.day, currency: "CHF", unitsPerEur: chf });
      }

      // Public market data: let the CDN absorb repeated reads.
      c.header(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=3600",
      );
      return c.json({ base: "EUR", from, to, rates }, 200);
    } catch (error) {
      console.error("Error fetching daily FX rates:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  });

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
