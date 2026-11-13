/**
 * SQL for the hourly and daily closes of one metal price column over a range
 * (GET /api/metals/:metal/prices/range), as plain parametrised text so the
 * same statement runs in the route and in the tests.
 *
 * The range bounds are bind parameters ($1 start, $2 end). The column is an
 * identifier, so it is checked against the fixed set of price columns of
 * `precious_metal_prices` and never taken from free text.
 *
 * Buckets:
 * - hour: one per hour from the start's hour to the end's hour, labelled
 *   hh:59, holding the last price recorded in that hour up to the end. Hours
 *   without a price are left out.
 * - day: one per day, labelled 23:59, holding the last price of that day at
 *   or before 23:59. Days without a price come back with a null price.
 *
 * Timestamps are UTC wall time (the table's `timestamp` column has no zone);
 * the result's `timestamp` is a timestamptz in UTC.
 */

export const PRICE_RANGE_METALS = [
  "gold",
  "silver",
  "platinum",
  "palladium",
] as const;
export const PRICE_RANGE_CURRENCIES = ["eur", "usd", "chf"] as const;

export type MetalPriceColumn =
  `${(typeof PRICE_RANGE_METALS)[number]}_${(typeof PRICE_RANGE_CURRENCIES)[number]}`;

export type MetalPriceRangeInterval = "hour" | "day";

export interface MetalPriceRangeQuery {
  text: string;
  /** [start, end] as ISO 8601 UTC strings */
  params: [string, string];
}

const PRICE_COLUMNS: ReadonlySet<string> = new Set(
  PRICE_RANGE_METALS.flatMap((metal) =>
    PRICE_RANGE_CURRENCIES.map((currency) => `${metal}_${currency}`),
  ),
);

function hourSql(column: MetalPriceColumn): string {
  return `
    WITH hour_intervals AS (
      -- One bucket per hour, ending at hh:59
      SELECT (hour_start + INTERVAL '59 minutes') AS timestamp
      FROM generate_series(
        date_trunc('hour', $1::timestamp),
        date_trunc('hour', $2::timestamp),
        INTERVAL '1 hour'
      ) AS hour_start
    ),
    -- Pre-filter the prices to the range
    filtered_prices AS (
      SELECT timestamp, "${column}" AS price
      FROM precious_metal_prices
      WHERE timestamp >= date_trunc('hour', $1::timestamp)
        AND timestamp <= $2::timestamp
    ),
    bucketed AS (
      SELECT
        hi.timestamp,
        (
          SELECT price
          FROM filtered_prices fp
          WHERE date_trunc('hour', fp.timestamp) = date_trunc('hour', hi.timestamp)
          ORDER BY fp.timestamp DESC -- Last price in the hour
          LIMIT 1
        ) AS price
      FROM hour_intervals hi
    )
    SELECT b.timestamp AT TIME ZONE 'UTC' AS timestamp, b.price
    FROM bucketed b
    WHERE b.price IS NOT NULL -- Skip hours without prices
    ORDER BY b.timestamp
  `;
}

function daySql(column: MetalPriceColumn): string {
  return `
    WITH day_intervals AS (
      -- One bucket per day, ending at 23:59
      SELECT (date_trunc('day', day) + INTERVAL '23 hours 59 minutes') AS timestamp
      FROM generate_series(
        date_trunc('day', $1::timestamp),
        date_trunc('day', $2::timestamp),
        INTERVAL '1 day'
      ) AS day
    ),
    -- Pre-filter the prices to the range, a day either side
    filtered_prices AS (
      SELECT timestamp, "${column}" AS price
      FROM precious_metal_prices
      WHERE timestamp >= $1::timestamp - INTERVAL '1 day'
        AND timestamp <= $2::timestamp + INTERVAL '1 day'
    )
    SELECT
      di.timestamp AT TIME ZONE 'UTC' AS timestamp,
      (
        SELECT price
        FROM filtered_prices fp
        WHERE fp.timestamp::date = di.timestamp::date
          AND fp.timestamp <= di.timestamp
        ORDER BY fp.timestamp DESC -- Last price before 23:59
        LIMIT 1
      ) AS price
    FROM day_intervals di
    ORDER BY di.timestamp
  `;
}

/**
 * The statement and bind parameters for one column's hourly or daily closes
 * between `start` and `end`. Throws on a column outside the price columns.
 */
export function metalPriceRangeQuery(
  interval: MetalPriceRangeInterval,
  column: MetalPriceColumn,
  start: Date,
  end: Date,
): MetalPriceRangeQuery {
  if (!PRICE_COLUMNS.has(column)) {
    throw new Error(`Not a metal price column: ${JSON.stringify(column)}`);
  }
  return {
    text: interval === "hour" ? hourSql(column) : daySql(column),
    params: [start.toISOString(), end.toISOString()],
  };
}
