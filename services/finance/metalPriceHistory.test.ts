/** Tests for the gap-aware price-history helpers in services/finance/metals.ts. */
import { describe, it, expect } from "vitest";

import {
  isRecordedClose,
  percentFromFirstClose,
  recordedRangeChange,
} from "./metals";

const h = (...prices: (number | null)[]) => prices.map((price) => ({ price }));

describe("isRecordedClose", () => {
  it("treats null, undefined, 0 and negatives as gaps", () => {
    expect(isRecordedClose(null)).toBe(false);
    expect(isRecordedClose(undefined)).toBe(false);
    expect(isRecordedClose(0)).toBe(false);
    expect(isRecordedClose(-1)).toBe(false);
    expect(isRecordedClose(2000)).toBe(true);
  });
});

describe("recordedRangeChange", () => {
  it("measures first to last close when both ends are recorded", () => {
    expect(recordedRangeChange(h(2000, 2100, 2200))).toEqual({
      absolute: 200,
      percentage: 10,
    });
  });

  it("skips a trailing gap (today has no row yet) instead of -100%", () => {
    expect(recordedRangeChange(h(2000, 2050, 2200, 0))).toEqual({
      absolute: 200,
      percentage: 10,
    });
    expect(recordedRangeChange(h(2000, 2200, null))).toEqual({
      absolute: 200,
      percentage: 10,
    });
  });

  it("skips a leading gap (range starts on a weekend)", () => {
    expect(recordedRangeChange(h(0, null, 2000, 1900))).toEqual({
      absolute: -100,
      percentage: -5,
    });
  });

  it("is null with fewer than two recorded closes", () => {
    expect(recordedRangeChange(h())).toBeNull();
    expect(recordedRangeChange(h(0, 2000, null))).toBeNull();
  });
});

describe("percentFromFirstClose", () => {
  it("normalises against the first recorded close, keeping gaps null", () => {
    expect(percentFromFirstClose(h(0, 2000, null, 2100, 0, 1900))).toEqual([
      null,
      0,
      null,
      5,
      null,
      -5,
    ]);
  });

  it("is all gaps when nothing was recorded", () => {
    expect(percentFromFirstClose(h(0, null))).toEqual([null, null]);
  });
});
