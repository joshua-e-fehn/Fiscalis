import { it, expect } from "vitest";

import {
  calculateAverageInterest,
  type capitalPointInTime,
  getTimeIntervalInMilliseconds,
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
