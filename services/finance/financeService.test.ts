import { it, expect } from "vitest";

import {
  calculateAverageInterest,
  type capitalPointInTime,
  getTimePeriodInMilliseconds,
} from "./financeService";

it("should calculate average interest", () => {
  const pointA: capitalPointInTime = {
    time: new Date(),
    capitalValue: 1000,
  };

  const pointBTime = new Date(
    pointA.time.getTime() + getTimePeriodInMilliseconds("Year")
  );

  const pointB: capitalPointInTime = {
    time: pointBTime,
    capitalValue: 1100,
  };

  const interest = calculateAverageInterest(pointA, pointB, "Year");
  expect(interest).toBe(0.1);
});
