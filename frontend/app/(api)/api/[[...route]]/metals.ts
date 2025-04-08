import { Hono } from "hono";

import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { db } from "@/db/drizzle/drizzle";
import { precious_metal_prices } from "@/db/drizzle/schema";
import { and, lte, gte, desc, sql } from "drizzle-orm";

import { TimeRange, TimeInterval } from "@/../services/finance/financeService";
import {
  MetalChartData,
  MetalCurrency,
  MetalType,
  metalColumns,
} from "@/lib/types/metals";
import { time } from "console";

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

//TODO: Write tests for the API
//TODO: Refactor code

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
            timestamp:
              sql`${precious_metal_prices.timestamp} AT TIME ZONE 'UTC'`.as(
                "timestamp"
              ),
            price: metalColumns[currency][metal],
          })
          .from(precious_metal_prices)
          .orderBy(desc(precious_metal_prices.timestamp))
          .limit(1);

        if (prices.length === 0) {
          return c.json<MetalChartData>({ date: null, price: null }, 404);
        }

        const chartData: MetalChartData = {
          date: new Date(prices[0].timestamp as string),
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
        interface PriceRow {
          timestamp: unknown;
          price: unknown;
        }
        let prices: PriceRow[] = [];

        // Get the minutely data of the last hour (60 minutes)
        if (timeRange === "Hour") {
          prices = await db
            .select({
              timestamp: sql`(${precious_metal_prices.timestamp} AT TIME ZONE 'UTC')::timestamptz::text AS timestamp`,
              price: metalColumns[currency][metal],
            })
            .from(precious_metal_prices)
            .orderBy(desc(precious_metal_prices.timestamp))
            .limit(60);
          prices = prices.reverse();
        }
        // Get the hourly data of the last 24 hours (24 hours) (query at 15:15 -> 15:15, 14:15, 13:15, ...)
        else if (timeRange === "Day") {
          const rawPrices = await db.execute(sql`
              WITH hour_intervals AS (
                -- Generate hourly timestamps aligned to the current minute
                SELECT generate_series(
                  date_trunc('hour', NOW() - INTERVAL '24 hours') + 
                    date_part('minute', NOW()) * INTERVAL '1 minute',
                  NOW(),
                  INTERVAL '1 hour'
                ) AS timestamp
              ),
              -- Pre-filter the prices to the relevant time window (last 24 hours + buffer)
              filtered_prices AS (
                SELECT 
                  timestamp,
                  ${metalColumns[currency][metal]} AS price
                FROM ${precious_metal_prices}
                WHERE timestamp >= NOW() - INTERVAL '25 hours' -- Add buffer to ensure we have data
                  AND timestamp <= NOW()
              )
              SELECT 
                (hi.timestamp AT TIME ZONE 'UTC')::timestamptz::text AS timestamp,
                (
                  SELECT price
                  FROM filtered_prices fp
                  WHERE fp.timestamp <= hi.timestamp
                  ORDER BY fp.timestamp DESC
                  LIMIT 1
                ) AS price
              FROM hour_intervals hi
              ORDER BY hi.timestamp
            `);
          prices = rawPrices.rows.map((row) => ({
            timestamp: row.timestamp as string,
            price: Number(row.price),
          }));
        }
        // Get the daily / weekly data of the last timeRange until the current day. Taking the last price of each day (23:59) that should be included + latest price of current day
        else if (
          timeRange === "Week" ||
          timeRange === "Month" ||
          timeRange === "Year"
        ) {
          const rawPrices = await db.execute(sql`
            WITH day_intervals AS (
              -- Generate daily timestamps at the end of each day (23:59)
              SELECT generate_series(
                date_trunc('day', now() - INTERVAL '1 ${sql.raw(
                  timeRange.toLowerCase()
                )}'),
                now()::date - INTERVAL '1 day' + INTERVAL '23 hours 59 minutes', -- Stop at yesterday
                INTERVAL '1 ${sql.raw(timeRange === "Year" ? "week" : "day")}'
              ) AS timestamp
            ),
            current_day AS (
              -- Get the latest price for today
              SELECT 
                to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,
                ${metalColumns[currency][metal]} AS price
              FROM ${precious_metal_prices}
              WHERE ${precious_metal_prices.timestamp}::date = now()::date
              ORDER BY ${precious_metal_prices.timestamp} DESC
              LIMIT 1
            ),
            -- Pre-filter the prices to the relevant time window (add 1 day buffer)
            filtered_prices AS (
              SELECT 
                timestamp,
                ${metalColumns[currency][metal]} AS price
              FROM ${precious_metal_prices}
              WHERE timestamp >= ( now() - INTERVAL '1 ${sql.raw(
                timeRange.toLowerCase()
              )}' - INTERVAL '1 day' )
                AND timestamp <= now()
            ),
            historical_prices AS (
              SELECT 
                to_char(di.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,
                (
                  SELECT price
                  FROM filtered_prices fp
                  WHERE fp.timestamp::date = di.timestamp::date
                    AND fp.timestamp <= di.timestamp
                  ORDER BY fp.timestamp DESC
                  LIMIT 1
                ) AS price
              FROM day_intervals di
            )
            
            SELECT timestamp, price
            FROM historical_prices
            
            UNION ALL
            
            -- Add the current day's latest price (only if we have data)
            SELECT timestamp, price
            FROM current_day
            WHERE price IS NOT NULL
            
            ORDER BY timestamp
          `);
          prices = rawPrices.rows.map((row) => ({
            timestamp: row.timestamp as string,
            price: Number(row.price),
          }));
        }
        // Get the weekly data starting from the 1.1. until the current day. Taking the last price of each day (23:59) that should be included + latest price of current day
        else if (timeRange === "YTD") {
          const rawPrices = await db.execute(sql`
            WITH date_series AS (
              -- Generate dates at exact intervals from beginning of the year until now
              -- Add time component to get end-of-day (23:59:59)
              SELECT (date + INTERVAL '23 hours 59 minutes') AS date
              FROM generate_series(
                date_trunc('year', now()),
                now()::date - INTERVAL '1 day', -- Go until yesterday
                INTERVAL '7 days'
              ) AS date
            ),
            current_day AS (
              -- Get the latest price for today
              SELECT 
                to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,
                ${metalColumns[currency][metal]} AS price
              FROM ${precious_metal_prices}
              WHERE ${precious_metal_prices.timestamp}::date = now()::date
              ORDER BY ${precious_metal_prices.timestamp} DESC
              LIMIT 1
            ),
            latest_prices AS (
              -- For each date in our series, find the closest price before midnight
              SELECT 
                to_char(ds.date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,
                ${metalColumns[currency][metal]} AS price,
                row_number() OVER (
                  PARTITION BY ds.date::date
                  ORDER BY ${precious_metal_prices.timestamp} DESC
                ) AS rn
              FROM date_series ds
              JOIN ${precious_metal_prices} ON 
                -- Only look for prices BEFORE the target date (end of day)
                ${precious_metal_prices.timestamp}::date = ds.date::date
                AND ${precious_metal_prices.timestamp} <= ds.date
            )
            SELECT timestamp, price
            FROM latest_prices
            WHERE rn = 1
            
            UNION ALL
            
            -- Add the current day's latest price
            SELECT timestamp, price
            FROM current_day
            
            ORDER BY timestamp
          `);

          prices = rawPrices.rows.map((row) => ({
            timestamp: row.timestamp as string,
            price: Number(row.price),
          }));
        }
        // Get the quarterly data starting from the 1.1.2025 until the current day. Taking the latest price of each quarter starting day (23:59) that should be included + latest price of current day
        else {
          const rawPrices = await db.execute(sql`
            WITH quarter_starts AS (
              -- Generate the first day of each quarter starting from 1/1/2025
              -- Now add 23:59 to get end-of-day for each quarter start
              SELECT 
                (generate_series(
                  date '2025-01-01', -- Fixed start date of 1/1/2025
                  date_trunc('quarter', now()), -- Last quarter start
                  interval '3 months'
                ) + INTERVAL '23 hours 59 minutes') AS quarter_date
            ),
            current_day AS (
              -- Get the latest price for today
              SELECT 
                to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,
                ${metalColumns[currency][metal]} AS price
              FROM ${precious_metal_prices}
              WHERE ${precious_metal_prices.timestamp}::date = now()::date
              ORDER BY ${precious_metal_prices.timestamp} DESC
              LIMIT 1
            ),
            quarter_prices AS (
              -- For each quarter start date, find the latest price of that day (closing price)
              SELECT 
                to_char(qs.quarter_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,
                ${metalColumns[currency][metal]} AS price,
                row_number() OVER (
                  PARTITION BY qs.quarter_date::date
                  ORDER BY ${precious_metal_prices.timestamp} DESC -- Changed to DESC for closing price
                ) AS rn
              FROM quarter_starts qs
              JOIN ${precious_metal_prices} ON 
                -- Look for prices ON the quarter start date before 23:59:59
                ${precious_metal_prices.timestamp}::date = qs.quarter_date::date
                AND ${precious_metal_prices.timestamp} <= qs.quarter_date
            )
            SELECT timestamp, price
            FROM quarter_prices
            WHERE rn = 1
            
            UNION ALL
            
            -- Add the current day's latest price (if not already a quarter start)
            SELECT timestamp, price
            FROM current_day
            WHERE to_char(now(), 'YYYY-MM-DD') != to_char(date_trunc('quarter', now()), 'YYYY-MM-DD')
            
            ORDER BY timestamp
          `);

          prices = rawPrices.rows.map((row) => ({
            timestamp: row.timestamp as string,
            price: Number(row.price),
          }));
        }

        if (prices.length === 0) {
          return c.json<MetalChartData[]>([], 404);
        }

        const chartData: MetalChartData[] = prices.map((p) => ({
          date: new Date(p.timestamp as string),
          price: Number(p.price),
        }));

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
  //TODO: Check each aggregationInterval for correct implementation, especially date_trunc('day', ...) in the hourly_intervals, daily_intervals, monthly_intervals, quarterly_intervals...
  .get(
    "/:metal/prices/range",
    zValidator("param", ParamsSchema.metal),
    zValidator("query", ParamsSchema.pricesRange),
    async (c): Promise<Response> => {
      const { metal } = c.req.valid("param");
      const { startDate, endDate, aggregationInterval, currency } =
        c.req.valid("query");

      try {
        // Parse the dates without additional timezone manipulation
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);

        let prices;

        // Handle different time intervals with appropriate strategies
        if (aggregationInterval === "minute") {
          // For minute interval, just get the raw data at minute precision
          prices = await db
            .select({
              timestamp:
                sql`${precious_metal_prices.timestamp} AT TIME ZONE 'UTC'`.as(
                  "timestamp"
                ),
              price: metalColumns[currency][metal],
            })
            .from(precious_metal_prices)
            .where(
              and(
                gte(precious_metal_prices.timestamp, parsedStartDate),
                lte(precious_metal_prices.timestamp, parsedEndDate)
              )
            )
            .orderBy(precious_metal_prices.timestamp);
        } else if (aggregationInterval === "hour") {
          // For hourly data, get data at the beginning of each hour
          const rawPrices = await db.execute(sql`
          WITH hour_intervals AS (
            -- Generate hourly timestamps aligned to the current minute
            SELECT generate_series(
              date_trunc('hour', ${parsedStartDate}::timestamp - INTERVAL '24 hours') + 
                date_part('minute', ${parsedStartDate}::timestamp * INTERVAL '1 minute',
              date_trunc('hour', ${parsedEndDate}::timestamp - INTERVAL '24 hours') + 
                date_part('minute', ${parsedEndDate}::timestamp * INTERVAL '1 minute',
              INTERVAL '1 hour'
            ) AS timestamp
          ),
          -- Pre-filter the prices to the relevant time window
          filtered_prices AS (
            SELECT 
              timestamp,
              ${metalColumns[currency][metal]} AS price
            FROM ${precious_metal_prices}
            WHERE timestamp >= ${parsedStartDate}::timestamp
              AND timestamp <= ${parsedEndDate}::timestamp
          )
          SELECT 
            hi.timestamp AT TIME ZONE 'UTC' AS timestamp,
            (
              SELECT price
              FROM filtered_prices fp
              WHERE date_trunc('hour', fp.timestamp) = hi.timestamp
              ORDER BY fp.timestamp ASC -- Get earliest price in the hour
              LIMIT 1
            ) AS price
          FROM hour_intervals hi
          WHERE EXISTS (
            SELECT 1 
            FROM filtered_prices 
            WHERE date_trunc('hour', timestamp) = hi.timestamp
          )
          ORDER BY hi.timestamp
        `);
          prices = rawPrices.rows;
        } else if (aggregationInterval === "day") {
          // For daily data, get the closing price of each day (23:59)
          const rawPrices = await db.execute(sql`
          WITH day_intervals AS (
            -- Generate timestamps at the end of each day (23:59)
            SELECT (date_trunc('day', day) + INTERVAL '23 hours 59 minutes') AS timestamp
            FROM generate_series(
              date_trunc('day', ${parsedStartDate}::timestamp),
              date_trunc('day', ${parsedEndDate}::timestamp),
              INTERVAL '1 day'
            ) AS day
          ),
          -- Pre-filter the prices to the relevant time window
          filtered_prices AS (
            SELECT 
              timestamp,
              ${metalColumns[currency][metal]} AS price
            FROM ${precious_metal_prices}
            WHERE timestamp >= ${parsedStartDate}::timestamp - INTERVAL '1 day'
              AND timestamp <= ${parsedEndDate}::timestamp + INTERVAL '1 day'
          )
          SELECT 
            di.timestamp AT TIME ZONE 'UTC' AS timestamp,
            (
              SELECT price
              FROM filtered_prices fp
              WHERE fp.timestamp::date = di.timestamp::date
                AND fp.timestamp <= di.timestamp
              ORDER BY fp.timestamp DESC -- Get last price before 23:59
              LIMIT 1
            ) AS price
          FROM day_intervals di
          ORDER BY di.timestamp
        `);
          prices = rawPrices.rows;
        } else if (aggregationInterval === "week") {
          // For weekly data, get the closing price (23:59) of each 7th day
          const rawPrices = await db.execute(sql`
          WITH week_intervals AS (
            -- Generate timestamps at the end of each week
            SELECT (date + INTERVAL '23 hours 59 minutes') AS timestamp
            FROM generate_series(
              date_trunc('week', ${parsedStartDate}::timestamp),
              date_trunc('week', ${parsedEndDate}::timestamp),
              INTERVAL '1 week'
            ) AS date
          ),
          filtered_prices AS (
            SELECT 
              timestamp,
              ${metalColumns[currency][metal]} AS price
            FROM ${precious_metal_prices}
            WHERE timestamp >= ${parsedStartDate} - INTERVAL '1 week'
              AND timestamp <= ${parsedEndDate} + INTERVAL '1 week'
          )
          SELECT 
            wi.timestamp AT TIME ZONE 'UTC' AS timestamp,
            (
              SELECT price
              FROM filtered_prices fp
              WHERE fp.timestamp::date = wi.timestamp::date
                AND fp.timestamp <= wi.timestamp
              ORDER BY fp.timestamp DESC
              LIMIT 1
            ) AS price
          FROM week_intervals wi
          ORDER BY wi.timestamp
        `);
          prices = rawPrices.rows;
        } else if (aggregationInterval === "month") {
          // For monthly data, get closing prices at exactly one month intervals from start date
          const rawPrices = await db.execute(sql`
            WITH month_intervals AS (
              -- Generate timestamps at monthly intervals from start date
              SELECT (date_trunc('day', day) + INTERVAL '23 hours 59 minutes') AS timestamp
              FROM generate_series(
                date_trunc('day', ${parsedStartDate}::timestamp),
                date_trunc('day', ${parsedEndDate}::timestamp),
                INTERVAL '1 month'
              ) AS day
            ),
            filtered_prices AS (
              SELECT 
                timestamp,
                ${metalColumns[currency][metal]} AS price
              FROM ${precious_metal_prices}
              WHERE timestamp >= ${parsedStartDate}::timestamp - INTERVAL '1 day'
                AND timestamp <= ${parsedEndDate}::timestamp + INTERVAL '1 day'
            )
            SELECT 
              mi.timestamp AT TIME ZONE 'UTC' AS timestamp,
              (
                SELECT price
                FROM filtered_prices fp
                WHERE fp.timestamp::date = mi.timestamp::date
                  AND fp.timestamp <= mi.timestamp
                ORDER BY fp.timestamp DESC
                LIMIT 1
              ) AS price
            FROM month_intervals mi
            ORDER BY mi.timestamp
          `);
          prices = rawPrices.rows;
        } else if (aggregationInterval === "quarter") {
          // For quarterly data, get the closing price (23:59) of the first day of each quarter
          const rawPrices = await db.execute(sql`
          WITH quarter_intervals AS (
            -- Generate timestamps at the end of the first day of each quarter (23:59)
            SELECT 
              (date_trunc('quarter', quarter) + INTERVAL '23 hours 59 minutes') AS timestamp
            FROM generate_series(
              date_trunc('quarter', ${parsedStartDate}::timestamp),
              date_trunc('quarter', ${parsedEndDate}::timestamp),
              INTERVAL '3 months'
            ) AS quarter
          ),
          filtered_prices AS (
            SELECT 
              timestamp,
              ${metalColumns[currency][metal]} AS price
            FROM ${precious_metal_prices}
            WHERE timestamp >= ${parsedStartDate}::timestamp - INTERVAL '3 months'
              AND timestamp <= ${parsedEndDate}::timestamp + INTERVAL '3 months'
          )
          SELECT 
            qi.timestamp AT TIME ZONE 'UTC' AS timestamp,
            (
              SELECT price
              FROM filtered_prices fp
              WHERE fp.timestamp::date = qi.timestamp::date
                AND fp.timestamp <= qi.timestamp
              ORDER BY fp.timestamp DESC
              LIMIT 1
            ) AS price
          FROM quarter_intervals qi
          ORDER BY qi.timestamp
        `);
          prices = rawPrices.rows;
        } else {
          // For yearly data, get the closing price (23:59) at exact yearly intervals from start date
          const rawPrices = await db.execute(sql`
            WITH year_intervals AS (
              -- Generate timestamps at yearly intervals from start date
              SELECT (date_trunc('day', day) + INTERVAL '23 hours 59 minutes') AS timestamp
              FROM generate_series(
                date_trunc('day', ${parsedStartDate}::timestamp), 
                date_trunc('day', ${parsedEndDate}::timestamp),
                INTERVAL '1 year'
              ) AS day
            ),
            filtered_prices AS (
              SELECT 
                timestamp,
                ${metalColumns[currency][metal]} AS price
              FROM ${precious_metal_prices}
              WHERE timestamp >= ${parsedStartDate}::timestamp - INTERVAL '1 day'
                AND timestamp <= ${parsedEndDate}::timestamp + INTERVAL '1 day'
            )
            SELECT 
              yi.timestamp AT TIME ZONE 'UTC' AS timestamp,
              (
                SELECT price
                FROM filtered_prices fp
                WHERE fp.timestamp::date = yi.timestamp::date
                  AND fp.timestamp <= yi.timestamp
                ORDER BY fp.timestamp DESC -- Get last price before 23:59
                LIMIT 1
              ) AS price
            FROM year_intervals yi
            ORDER BY yi.timestamp
          `);
          prices = rawPrices.rows;
        }

        if (!prices || prices.length === 0) {
          return c.json<MetalChartData[]>([], 404);
        }

        const chartData: MetalChartData[] = prices.map((p) => ({
          date: new Date(p.timestamp as string),
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
