import { describe, expect, it } from "vitest";

import {
  computeCountryDeltas,
  countryHistory,
  csvField,
  divergingStops,
  isCountryCode,
  rankByChange,
  toCsv,
} from "./countryViews";

describe("computeCountryDeltas", () => {
  it("computes absolute and percent change", () => {
    const [de] = computeCountryDeltas(
      [{ code: "DE", value: 100 }],
      [{ code: "DE", value: 150 }],
    );
    expect(de).toEqual({
      code: "DE",
      startValue: 100,
      endValue: 150,
      absolute: 50,
      percent: 50,
    });
  });

  it("leaves the change null (no data, not zero) when either year is missing", () => {
    const deltas = computeCountryDeltas(
      [
        { code: "DE", value: null },
        { code: "FR", value: 10 },
      ],
      [
        { code: "DE", value: 5 },
        { code: "GB", value: 7 },
      ],
    );
    const byCode = Object.fromEntries(deltas.map((d) => [d.code, d]));
    expect(byCode.DE).toMatchObject({ startValue: null, absolute: null, percent: null });
    expect(byCode.FR).toMatchObject({ endValue: null, absolute: null, percent: null });
    expect(byCode.GB).toMatchObject({ startValue: null, endValue: 7, absolute: null });
  });

  it("has no percent change from a start of 0 but keeps the absolute one", () => {
    const [d] = computeCountryDeltas(
      [{ code: "DE", value: 0 }],
      [{ code: "DE", value: 3 }],
    );
    expect(d.absolute).toBe(3);
    expect(d.percent).toBeNull();
  });

  it("measures percent against |start| so a negative start improving is positive", () => {
    const [d] = computeCountryDeltas(
      [{ code: "DE", value: -10 }],
      [{ code: "DE", value: -5 }],
    );
    expect(d.absolute).toBe(5);
    expect(d.percent).toBe(50);
  });

  it("keeps a real zero change as 0", () => {
    const [d] = computeCountryDeltas(
      [{ code: "DE", value: 4 }],
      [{ code: "DE", value: 4 }],
    );
    expect(d.absolute).toBe(0);
    expect(d.percent).toBe(0);
  });
});

describe("rankByChange", () => {
  const deltas = computeCountryDeltas(
    [
      { code: "AA", value: 10 },
      { code: "BB", value: 10 },
      { code: "CC", value: 100 },
      { code: "DD", value: null },
      { code: "WLD", value: 1 },
    ],
    [
      { code: "AA", value: 30 }, // +20, +200 %
      { code: "BB", value: 5 }, // −5, −50 %
      { code: "CC", value: 150 }, // +50, +50 %
      { code: "DD", value: 9 },
      { code: "WLD", value: 1000 },
    ],
  );

  it("sorts by biggest increase and drops no-data rows and aggregates", () => {
    expect(rankByChange(deltas, "increase").map((d) => d.code)).toEqual([
      "CC",
      "AA",
      "BB",
    ]);
  });

  it("sorts by biggest decrease", () => {
    expect(rankByChange(deltas, "decrease").map((d) => d.code)).toEqual([
      "BB",
      "AA",
      "CC",
    ]);
  });

  it("ranks by percent and honours the limit", () => {
    expect(
      rankByChange(deltas, "increase", "percent", 2).map((d) => d.code),
    ).toEqual(["AA", "CC"]);
  });

  it("breaks ties by code", () => {
    const tied = computeCountryDeltas(
      [
        { code: "ZZ", value: 1 },
        { code: "AB", value: 1 },
      ],
      [
        { code: "ZZ", value: 2 },
        { code: "AB", value: 2 },
      ],
    );
    expect(rankByChange(tied, "increase").map((d) => d.code)).toEqual([
      "AB",
      "ZZ",
    ]);
  });
});

describe("isCountryCode", () => {
  it("tells countries from aggregates", () => {
    expect(isCountryCode("DE")).toBe(true);
    expect(isCountryCode("OED")).toBe(false);
  });
});

describe("divergingStops", () => {
  it("is symmetric around zero", () => {
    expect(divergingStops([-4, 2, 4])).toEqual([-4, -2, 0, 2, 4]);
  });

  it("is centred on zero even when every change has one sign", () => {
    const stops = divergingStops([1, 2, 3, 4])!;
    expect(stops[2]).toBe(0);
    expect(stops[0]).toBe(-stops[4]);
  });

  it("caps the range at the 95th percentile so an outlier does not flatten the rest", () => {
    const values = [...Array.from({ length: 99 }, () => 1), 1000];
    const stops = divergingStops(values)!;
    expect(stops[4]).toBeLessThan(1000);
    expect(stops[4]).toBeGreaterThanOrEqual(1);
  });

  it("ignores missing values", () => {
    expect(divergingStops([null, 2, null])).toEqual([-2, -1, 0, 1, 2]);
  });

  it("returns null when there is nothing to scale", () => {
    expect(divergingStops([])).toBeNull();
    expect(divergingStops([null])).toBeNull();
    expect(divergingStops([0, 0])).toBeNull();
  });

  it("falls back to the largest change when most changes are 0", () => {
    const values = [...Array.from({ length: 99 }, () => 0), 8];
    expect(divergingStops(values)).toEqual([-8, -4, 0, 4, 8]);
  });

  it("produces the requested odd number of stops", () => {
    expect(divergingStops([3], 7)).toHaveLength(7);
    expect(() => divergingStops([3], 4)).toThrow();
  });
});

describe("countryHistory", () => {
  const snapshots = [
    { year: 2003, countries: [{ code: "DE", value: 3 }] },
    { year: 2000, countries: [{ code: "DE", value: null }] },
    { year: 2001, countries: [{ code: "DE", value: 1 }] },
    { year: 2002, countries: [{ code: "FR", value: 9 }] },
    { year: 2004, countries: [{ code: "DE", value: null }] },
  ];

  it("orders by year, keeps inner gaps as null and trims the ends", () => {
    expect(countryHistory(snapshots, "DE")).toEqual([
      { year: 2001, value: 1 },
      { year: 2002, value: null },
      { year: 2003, value: 3 },
    ]);
  });

  it("is empty for a country without any data", () => {
    expect(countryHistory(snapshots, "GB")).toEqual([]);
  });
});

describe("csv", () => {
  it("quotes only fields that need it and escapes quotes", () => {
    expect(csvField("Germany")).toBe("Germany");
    expect(csvField("Korea, Rep.")).toBe('"Korea, Rep."');
    expect(csvField('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("writes missing values as empty cells, not 0", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(0)).toBe("0");
  });

  it("joins a header and rows", () => {
    expect(toCsv(["a", "b"], [[1, null], ["x,y", 2]])).toBe(
      'a,b\n1,\n"x,y",2',
    );
  });
});
