import { Hono } from "hono";

import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { db } from "@/db/drizzle/drizzle";
import { precious_metal_prices } from "@/db/drizzle/schema";
import { desc, sql } from "drizzle-orm";

import {
  getTimeRangeInMilliseconds,
  TimeRange,
  TimeInterval,
} from "@/../services/finance/financeService";
import {
  MetalChartData,
  MetalCurrency,
  MetalType,
  metalColumns,
} from "@/lib/types/metals";

const timeRangeEnum = z.enum([
  "Hour",
  "Day",
  "Week",
  "Month",
  "Year",
  "YTD",
  "ALL",
] as const satisfies readonly TimeRange[]);

const timeIntervalEnum = z.enum([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const satisfies readonly TimeInterval[]);

const metalEnum = z.enum([
  "gold",
  "silver",
  "platinum",
  "palladium",
] as const satisfies readonly MetalType[]);
const currencyEnum = z.enum([
  "eur",
  "usd",
] as const satisfies readonly MetalCurrency[]);

const ParamsSchema = {
  metal: z.object({
    metal: metalEnum,
  }),
  priceLatest: z.object({
    currency: currencyEnum,
  }),
  pricesHistorical: z.object({
    timeRange: timeRangeEnum,
    currency: currencyEnum,
  }),
  pricesRange: z.object({
    startDate: z
      .string()
      .datetime()
      .describe(
        'ISO 8601 date string in standard time (e.g., "2025-02-25T00:00:00Z")'
      ),
    endDate: z
      .string()
      .datetime()
      .describe(
        'ISO 8601 date string in standard time (e.g., "2025-02-25T23:59:59Z")'
      ),
    aggregationInterval: timeIntervalEnum,
    currency: currencyEnum,
  }),
};

function getAggregationInterval(range: TimeRange) {
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
  .get(
    "/:metal/prices/latest",
    zValidator("param", ParamsSchema.metal),
    zValidator("query", ParamsSchema.priceLatest),
    async (c): Promise<Response> => {
      const { metal } = c.req.valid("param");
      const { currency } = c.req.valid("query");
      try {
        const prices = await db
          .select({
            timestamp: precious_metal_prices.timestamp,
            price: metalColumns[currency][metal],
          })
          .from(precious_metal_prices)
          .orderBy(desc(precious_metal_prices.timestamp))
          .limit(1);

        if (prices.length === 0) {
          return c.json<MetalChartData>({ date: null, price: null }, 404);
        }
        const chartData: MetalChartData = {
          date: new Date(
            new Date(prices[0].timestamp as Date).getTime() -
              new Date().getTimezoneOffset() * 60000
          ),
          price: Number(prices[0].price),
        };

        return c.json<MetalChartData>(chartData, 200);
      } catch (error) {
        console.error(`Error fetching ${metal} ${currency} price:`, error);
        return c.json({ error: "Internal Server Error" }, 500);
      }
    }
  )
  .get(
    "/:metal/prices/historical",
    zValidator("param", ParamsSchema.metal),
    zValidator("query", ParamsSchema.pricesHistorical),
    async (c): Promise<Response> => {
      const { metal } = c.req.valid("param");
      const { timeRange, currency } = c.req.valid("query");
      try {
        const now = new Date();
        const localStartTime = new Date(
          now.getTime() - getTimeRangeInMilliseconds(timeRange)
        );
        // Convert the local start time to UTC by adding the local timezone offset (in ms)
        const startTime = new Date(
          localStartTime.getTime() + localStartTime.getTimezoneOffset() * 60000
        );

        //TODO: Query the database using local time -> Transforming standard timestamps of db into local timestamps, and only then truncating the timestamps to the desired interval
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
                    ${metalColumns[currency][metal]} AS price,
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

        if (prices.length === 0) {
          return c.json<MetalChartData[]>([], 404);
        }

        const chartData: MetalChartData[] = prices.map((p) => {
          const standardTime = new Date(p.timestamp as Date);
          const localTime = new Date(
            standardTime.getTime() - new Date().getTimezoneOffset() * 60000
          );
          return {
            date: localTime,
            price: Number(p.price),
          };
        });

        return c.json<MetalChartData[]>(chartData, 200);
      } catch (error) {
        console.error(
          `Error fetching ${metal} ${currency} prices for a time range of "${timeRange}": `,
          error
        );
        return c.json({ error: "Internal Server Error" }, 500);
      }
    }
  )
  .get(
    "/:metal/prices/range",
    zValidator("param", ParamsSchema.metal),
    zValidator("query", ParamsSchema.pricesRange),
    async (c): Promise<Response> => {
      const { metal } = c.req.valid("param");
      const { startDate, endDate, aggregationInterval, currency } =
        c.req.valid("query");

      try {
        const prices = await db
          .select({
            timestamp: sql`sub.truncated_timestamp`.as("timestamp"),
            price: sql`sub.price`.as("price"),
          })
          .from(
            sql`
            (
              SELECT
                date_trunc(${aggregationInterval}::text, ${
              precious_metal_prices.timestamp
            }) AS truncated_timestamp,
                ${metalColumns[currency][metal]} AS price,
                row_number() OVER (
                  PARTITION BY date_trunc(${aggregationInterval}::text, ${
              precious_metal_prices.timestamp
            })
                  ORDER BY ${precious_metal_prices.timestamp} DESC
                ) AS rn
              FROM ${precious_metal_prices}
              WHERE ${precious_metal_prices.timestamp} >= ${new Date(startDate)}
              AND ${precious_metal_prices.timestamp} <= ${new Date(endDate)}
            ) sub
          `
          )
          .where(sql`sub.rn = 1`)
          .orderBy(sql`sub.truncated_timestamp`);

        if (prices.length === 0) {
          return c.json<MetalChartData[]>([], 404);
        }

        const chartData: MetalChartData[] = prices.map((p) => ({
          date: new Date(p.timestamp as Date),
          price: Number(p.price),
        }));

        return c.json<MetalChartData[]>(chartData, 200);
      } catch (error) {
        console.error(
          `Error fetching ${metal} ${currency} prices for range ${startDate} to ${endDate}: `,
          error
        );
        return c.json({ error: "Internal Server Error" }, 500);
      }
    }
  );

export default app;
