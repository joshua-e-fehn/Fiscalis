import { describe, it, expect } from "vitest";

import {
  calculateAverageInterest,
  type capitalPointInTime,
  getTimeIntervalInMilliseconds,
  getTimeRangeStartTimestamp,
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
});
