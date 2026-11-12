import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type MetalPriceColumn,
  metalPriceRangeQuery,
} from "./metalPriceRangeSql";

/**
 * Runs the range SQL against an in-process Postgres with the price columns of
 * `precious_metal_prices` (frontend/db/drizzle/schema.ts) and seeded rows.
 */
let db: PGlite;

const seed: Array<[string, number]> = [
  // Before the hourly range start's hour
  ["2026-03-02 09:50:00", 90],
  // Hour 10: three prices, the last one (10:59:30) closes the hour
  ["2026-03-02 10:05:00", 100],
  ["2026-03-02 10:40:00", 101],
  ["2026-03-02 10:59:30", 102],
  // Hour 11: no price
  // Hour 12: one price inside the range and one after its end (12:30)
  ["2026-03-02 12:15:00", 110],
  ["2026-03-02 12:45:00", 115],
  // Day 2026-03-04: a price at 08:00 and one after 23:59
  ["2026-03-04 08:00:00", 200],
  ["2026-03-04 23:59:30", 201],
  // Day 2026-03-05: no price; 2026-03-06: one price
  ["2026-03-06 12:00:00", 210],
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE precious_metal_prices (
      timestamp timestamp PRIMARY KEY,
      gold_eur numeric(10, 2) NOT NULL,
      gold_usd numeric(10, 2) NOT NULL
    );
  `);
  for (const [timestamp, price] of seed) {
    await db.query(
      "INSERT INTO precious_metal_prices (timestamp, gold_eur, gold_usd) VALUES ($1, $2, $3)",
      [timestamp, price, price * 2],
    );
  }
});

afterAll(async () => {
  await db.close();
});

async function run(
  interval: "hour" | "day",
  column: MetalPriceColumn,
  start: string,
  end: string,
) {
  const { text, params } = metalPriceRangeQuery(
    interval,
    column,
    new Date(start),
    new Date(end),
  );
  const { rows } = await db.query<{ timestamp: Date; price: string | null }>(
    text,
    params,
  );
  return rows.map((r) => ({
    timestamp: new Date(r.timestamp).toISOString(),
    price: r.price === null ? null : Number(r.price),
  }));
}

describe("metalPriceRangeQuery hour", () => {
  it("returns one bucket per hour at hh:59 with the last price in the hour", async () => {
    // The start is truncated to its hour, so 10:05 and 10:40 are in range
    expect(
      await run("hour", "gold_eur", "2026-03-02T10:20:00Z", "2026-03-02T12:30:00Z"),
    ).toEqual([
      { timestamp: "2026-03-02T10:59:00.000Z", price: 102 },
      // Hour 11 has no price and is left out; 12:45 is after the end
      { timestamp: "2026-03-02T12:59:00.000Z", price: 110 },
    ]);
  });

  it("reads the requested column", async () => {
    expect(
      await run("hour", "gold_usd", "2026-03-02T10:00:00Z", "2026-03-02T10:59:59Z"),
    ).toEqual([{ timestamp: "2026-03-02T10:59:00.000Z", price: 204 }]);
  });

  it("returns no rows for a range without prices", async () => {
    expect(
      await run("hour", "gold_eur", "2026-03-02T11:00:00Z", "2026-03-02T11:59:00Z"),
    ).toEqual([]);
  });
});

describe("metalPriceRangeQuery day", () => {
  it("returns one bucket per day at 23:59 with the last price at or before it", async () => {
    expect(
      await run("day", "gold_eur", "2026-03-04T00:00:00Z", "2026-03-06T18:00:00Z"),
    ).toEqual([
      // 23:59:30 is after the 23:59 close
      { timestamp: "2026-03-04T23:59:00.000Z", price: 200 },
      // A day without a price stays a gap
      { timestamp: "2026-03-05T23:59:00.000Z", price: null },
      { timestamp: "2026-03-06T23:59:00.000Z", price: 210 },
    ]);
  });
});

describe("metalPriceRangeQuery parameters", () => {
  it("binds the range as ISO strings and keeps them out of the text", () => {
    const { text, params } = metalPriceRangeQuery(
      "hour",
      "silver_chf",
      new Date("2026-03-02T10:20:00Z"),
      new Date("2026-03-02T12:30:00Z"),
    );
    expect(params).toEqual(["2026-03-02T10:20:00.000Z", "2026-03-02T12:30:00.000Z"]);
    expect(text).toContain('"silver_chf" AS price');
    expect(text).not.toContain("2026");
  });

  it("rejects a column outside the price columns", () => {
    expect(() =>
      metalPriceRangeQuery(
        "day",
        'gold_eur" FROM x; --' as MetalPriceColumn,
        new Date(0),
        new Date(0),
      ),
    ).toThrow('Not a metal price column: "gold_eur\\" FROM x; --"');
  });
});
