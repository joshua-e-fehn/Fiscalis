import { Hono } from "hono";

import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { db } from "@/db/drizzle/drizzle";
import { precious_metal_prices } from "@/db/drizzle/schema";
import { desc, gte, asc, sql } from "drizzle-orm";

import {
  getTimePeriodInMilliseconds,
  PeriodDuration,
} from "@/../services/finance/financeService";

const periodDurationEnum = z.enum([
  "Hour",
  "Day",
  "Week",
  "Month",
  "Year",
  "YTD",
  "ALL",
] as const satisfies readonly PeriodDuration[]);

const currencyEnum = z.enum(["EUR", "USD"] as const);

const ParamsSchema = {
  price: z.object({
    currency: currencyEnum,
  }),
  priceChart: z.object({
    timeRange: periodDurationEnum,
    currency: currencyEnum,
  }),
};

function getAggregationInterval(range: string) {
  if (range === "Hour") return "minute";
  if (range === "Day") return "hour";
  if (range === "Week") return "day";
  if (range === "Month") return "day";
  if (range === "Year") return "week";
  if (range === "YTD") return "week";
  if (range === "ALL") return "quarter";
  return "day";
}

const app = new Hono()
  .get("/", (c) => {
    return c.json({
      message: "Hello gold ;)",
    });
  })
  .get(
    "/gold/price/:currency",
    zValidator("param", ParamsSchema.price),
    async (c) => {
      const currency = c.req.valid("param").currency;
      try {
        const result = await db
          .select({
            price:
              currency === "EUR"
                ? precious_metal_prices.gold_eur
                : precious_metal_prices.gold_usd,
          })
          .from(precious_metal_prices)
          .orderBy(desc(precious_metal_prices.timestamp))
          .limit(1);
        console.log(result);
        if (result.length === 0) {
          return c.json({ price: null }, 200);
        } else {
          return c.json({ price: result[0].price }, 200);
        }
      } catch (error) {
        console.error("Error fetching gold price:", error);
        return c.json({ error: "Internal Server Error" }, 500);
      }
    }
  )
  .get(
    "/gold/prices/:timeRange/:currency",
    zValidator("param", ParamsSchema.priceChart),
    async (c) => {
      try {
        const { timeRange, currency } = c.req.valid("param");
        const now = new Date();
        const localStartTime = new Date(
          now.getTime() - getTimePeriodInMilliseconds(timeRange)
        );
        // Convert the local start time to UTC by adding the local timezone offset (in ms)
        const startTime = new Date(
          localStartTime.getTime() + localStartTime.getTimezoneOffset() * 60000
        );

        const prices = await db
          .select({
            timestamp: sql`sub.truncated_timestamp`.as("timestamp"),
            price: sql`sub.price`.as("price"),
          })
          .from(
            sql`
              (
                SELECT
                  date_trunc(${getAggregationInterval(timeRange)}::text, ${
              precious_metal_prices.timestamp
            }) AS truncated_timestamp,
                    ${
                      currency === "EUR"
                        ? precious_metal_prices.gold_eur
                        : precious_metal_prices.gold_usd
                    } AS price,
                    row_number() OVER (
                      PARTITION BY date_trunc(${getAggregationInterval(
                        timeRange
                      )}::text, ${precious_metal_prices.timestamp})
                      ORDER BY ${precious_metal_prices.timestamp} DESC
                    ) AS rn
                  FROM ${precious_metal_prices}
                  WHERE ${precious_metal_prices.timestamp} >= ${startTime}
                ) sub
              `
          )
          .where(sql`sub.rn = 1`)
          .orderBy(sql`sub.truncated_timestamp`);

        return c.json(
          prices.map((p) => {
            const standardTime = new Date(p.timestamp as Date);
            // Convert the standard UTC time to local time by subtracting the local timezone offset (in ms)
            const localTime = new Date(
              standardTime.getTime() - new Date().getTimezoneOffset() * 60000
            );
            return {
              date: localTime,
              price: Number(p.price),
            };
          })
        );
      } catch (error) {
        console.error("Error fetching gold prices:", error);
        return c.json({ error: "Internal Server Error" }, 500);
      }
    }
  );

export default app;
