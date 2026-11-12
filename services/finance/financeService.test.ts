import { describe, it, expect } from "vitest";

import {
  calculateAverageInterest,
  type capitalPointInTime,
  getTimeIntervalInMilliseconds,
  getTimeRangeInMilliseconds,
  getTimeRangeStartTimestamp,
  PRICE_LOOKBACK_MS,
  priceHistoryWindow,
  sliceFrom,
  PLATFORM_LAUNCH_TIMESTAMP,
} from "./financeService";

it("should calculate average interest", () => {
  const pointA: capitalPointInTime = {
    time: new Date(),
    capitalValue: 1000,
  };

  const pointBTime = new Date(
    pointA.time.getTime() + getTimeIntervalInMilliseconds("year")
  );

  const pointB: capitalPointInTime = {
    time: pointBTime,
    capitalValue: 1100,
  };

  const interest = calculateAverageInterest(pointA, pointB, "year");
  expect(interest).toBe(0.1);
});

describe("getTimeRangeStartTimestamp with a reference time", () => {
  const ref = Date.parse("2026-03-15T10:00:00.000Z");

  it("anchors rolling ranges to the given time", () => {
    expect(getTimeRangeStartTimestamp("Day", ref)).toBe(ref - 86_400_000);
  });

  it("uses the reference time's year for YTD", () => {
    expect(getTimeRangeStartTimestamp("YTD", ref)).toBe(
      Date.parse("2026-01-01T00:00:00.000Z"),
    );
  });

  it("starts ALL at the platform launch, 1 January 2024 UTC", () => {
    expect(PLATFORM_LAUNCH_TIMESTAMP).toBe(Date.parse("2024-01-01T00:00:00.000Z"));
    expect(getTimeRangeStartTimestamp("ALL", ref)).toBe(1_704_067_200_000);
  });
});

describe("getTimeRangeInMilliseconds", () => {
  const ref = Date.parse("2026-03-15T10:00:00.000Z");

  it("is the distance from the range start to the reference time", () => {
    expect(getTimeRangeInMilliseconds("Week", ref)).toBe(604_800_000);
    expect(getTimeRangeInMilliseconds("YTD", ref)).toBe(
      ref - Date.parse("2026-01-01T00:00:00.000Z"),
    );
    expect(getTimeRangeInMilliseconds("ALL", ref)).toBe(ref - 1_704_067_200_000);
  });
});

describe("priceHistoryWindow", () => {
  // Thu 12 Nov 2026, 15:30 UTC
  const now = Date.parse("2026-11-12T15:30:00.000Z");

  it("gives every daily range one window: a year and the lookback, at UTC midnight", () => {
    const expected = {
      interval: "day",
      // 12 Nov 00:00 − 365.25 days − 7 days = 2025-11-04T18:00Z, floored
      from: Date.parse("2025-11-04T00:00:00.000Z"),
    };
    for (const r of ["Week", "Month", "3Month", "6Month", "Year", "YTD"] as const) {
      expect(priceHistoryWindow(r, now)).toEqual(expected);
    }
  });

  it("gives the weekly ranges the 5-year window", () => {
    // 12 Nov 00:00 − 5 × 365.25 days − 7 days = 2021-11-04T18:00Z, floored
    const expected = { interval: "week", from: Date.parse("2021-11-04T00:00:00.000Z") };
    expect(priceHistoryWindow("3Year", now)).toEqual(expected);
    expect(priceHistoryWindow("5Year", now)).toEqual(expected);
    expect(priceHistoryWindow("ALL", now)).toEqual(expected);
  });

  it("keeps the intraday ranges on their own interval", () => {
    expect(priceHistoryWindow("Day", now)).toEqual({
      interval: "hour",
      from: Date.parse("2026-11-04T00:00:00.000Z"),
    });
    expect(priceHistoryWindow("Hour", now)).toEqual({
      interval: "minute",
      // 12 Nov 00:00 − 1 hour − 7 days = 4 Nov 23:00, floored
      from: Date.parse("2026-11-04T00:00:00.000Z"),
    });
  });

  it("is the same window all day, so the fetch is shared", () => {
    const morning = Date.parse("2026-11-12T00:00:01.000Z");
    const evening = Date.parse("2026-11-12T23:59:59.000Z");
    expect(priceHistoryWindow("YTD", morning)).toEqual(
      priceHistoryWindow("Month", evening),
    );
  });

  it("starts at or before every daily range's start less the lookback", () => {
    const { from } = priceHistoryWindow("YTD", now);
    expect(from).toBeLessThanOrEqual(
      getTimeRangeStartTimestamp("Year", now) - PRICE_LOOKBACK_MS,
    );
  });
});

describe("sliceFrom", () => {
  it("keeps the points at or after the start, in order", () => {
    const points = [
      { timestamp: 1, price: 10 },
      { timestamp: 5, price: 11 },
      { timestamp: 9, price: 12 },
    ];
    expect(sliceFrom(points, 5)).toEqual([
      { timestamp: 5, price: 11 },
      { timestamp: 9, price: 12 },
    ]);
    expect(sliceFrom(points, 10)).toEqual([]);
  });
});
