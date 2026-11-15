import { describe, expect, it } from "vitest";

import type { NormalizedHolding } from "./aggregate";
import {
  computePieDrift,
  driftStatus,
  evenWeights,
  normalizePie,
  pieHoldingKeys,
  pieHoldingsFrom,
  totalWeight,
  validatePie,
  type PieHolding,
  type PieInput,
  type PieSlice,
} from "./pies";

function pie(overrides: Partial<PieInput> = {}): PieInput {
  return {
    name: "Core",
    slices: [
      { weight: 60, target: { kind: "category", category: "equities" } },
      { weight: 40, target: { kind: "category", category: "bonds" } },
    ],
    ...overrides,
  };
}

const holding = (key: string, category: string, subcategory: string, value: number): PieHolding => ({
  key,
  name: key,
  category,
  subcategory,
  value,
});

describe("validatePie", () => {
  it("accepts a pie whose weights sum to 100", () => {
    expect(validatePie(pie())).toBeNull();
  });

  it("accepts weights that sum to 100 only after rounding", () => {
    const slices = evenWeights(3).map((weight, i): PieSlice => ({
      weight,
      target: { kind: "category", category: ["equities", "bonds", "cash"][i] },
    }));
    expect(validatePie(pie({ slices }))).toBeNull();
  });

  it("requires a name of at most 80 characters", () => {
    expect(validatePie(pie({ name: "  " }))).toBe("pieNameRequired");
    expect(validatePie(pie({ name: "x".repeat(81) }))).toBe("pieNameTooLong");
  });

  it("limits the description and the labels", () => {
    expect(validatePie(pie({ description: "x".repeat(281) }))).toBe("pieDescriptionTooLong");
    const slices = pie().slices.map((s) => ({ ...s, label: "x".repeat(61) }));
    expect(validatePie(pie({ slices }))).toBe("pieLabelTooLong");
  });

  it("requires between 1 and 30 slices", () => {
    expect(validatePie(pie({ slices: [] }))).toBe("pieSlicesRequired");
    const slices = Array.from({ length: 31 }, (_, i): PieSlice => ({
      weight: 100 / 31,
      target: { kind: "holdings", holdingKeys: [`h${i}`] },
    }));
    expect(validatePie(pie({ slices }))).toBe("pieTooManySlices");
  });

  it("rejects weights outside (0, 100] and totals other than 100", () => {
    const at = (a: number, b: number) =>
      pie({
        slices: [
          { weight: a, target: { kind: "category", category: "equities" } },
          { weight: b, target: { kind: "category", category: "bonds" } },
        ],
      });
    expect(validatePie(at(0, 100))).toBe("pieWeightInvalid");
    expect(validatePie(at(-10, 110))).toBe("pieWeightInvalid");
    expect(validatePie(at(Number.NaN, 100))).toBe("pieWeightInvalid");
    expect(validatePie(at(60, 30))).toBe("pieWeightsNotHundred");
    expect(validatePie(at(60, 40.02))).toBe("pieWeightsNotHundred");
  });

  it("rejects unknown categories, liabilities and empty targets", () => {
    const one = (target: PieSlice["target"]) => pie({ slices: [{ weight: 100, target }] });
    expect(validatePie(one({ kind: "category", category: "liabilities" }))).toBe("pieSliceTargetInvalid");
    expect(validatePie(one({ kind: "category", category: "stamps" }))).toBe("pieSliceTargetInvalid");
    expect(validatePie(one({ kind: "category", category: "equities", subcategory: " " }))).toBe(
      "pieSliceTargetInvalid",
    );
    expect(validatePie(one({ kind: "holdings", holdingKeys: [" "] }))).toBe("pieSliceTargetInvalid");
    expect(validatePie(one({ kind: "category", category: "unclassified" }))).toBeNull();
  });

  it("rejects the same target in two slices", () => {
    const slices: PieSlice[] = [
      { weight: 50, target: { kind: "category", category: "equities", subcategory: "etfs" } },
      { weight: 50, target: { kind: "category", category: "equities", subcategory: "etfs" } },
    ];
    expect(validatePie(pie({ slices }))).toBe("pieSliceDuplicate");
    const holdings: PieSlice[] = [
      { weight: 50, target: { kind: "holdings", holdingKeys: ["a", "b"] } },
      { weight: 50, target: { kind: "holdings", holdingKeys: ["b"] } },
    ];
    expect(validatePie(pie({ slices: holdings }))).toBe("pieSliceDuplicate");
  });

  it("allows a category slice next to its subcategory and holding slices", () => {
    const slices: PieSlice[] = [
      { weight: 50, target: { kind: "category", category: "equities" } },
      { weight: 30, target: { kind: "category", category: "equities", subcategory: "etfs" } },
      { weight: 20, target: { kind: "holdings", holdingKeys: ["a"] } },
    ];
    expect(validatePie(pie({ slices }))).toBeNull();
  });
});

describe("normalizePie", () => {
  it("trims text, drops blanks, rounds weights and dedupes holding keys", () => {
    const normalized = normalizePie({
      name: "  Core ",
      description: "  ",
      slices: [
        { label: " ", weight: 33.333, target: { kind: "holdings", holdingKeys: [" a", "a", ""] } },
        { label: " Bonds ", weight: 66.667, target: { kind: "category", category: "bonds", subcategory: "" } },
      ],
    });
    expect(normalized).toEqual({
      name: "Core",
      slices: [
        { weight: 33.33, target: { kind: "holdings", holdingKeys: ["a"] } },
        { label: "Bonds", weight: 66.67, target: { kind: "category", category: "bonds" } },
      ],
    });
  });
});

describe("weights", () => {
  it("splits 100 evenly in two decimals", () => {
    expect(evenWeights(3)).toEqual([33.34, 33.33, 33.33]);
    expect(evenWeights(4)).toEqual([25, 25, 25, 25]);
    expect(evenWeights(0)).toEqual([]);
    expect(totalWeight(evenWeights(7).map((weight) => ({ weight })))).toBe(100);
  });

  it("lists the holding keys the slices name", () => {
    expect(
      pieHoldingKeys([
        ...pie().slices,
        { weight: 1, target: { kind: "holdings", holdingKeys: ["a", "b"] } },
      ]),
    ).toEqual(["a", "b"]);
  });
});

describe("pieHoldingsFrom", () => {
  const base = {
    provider: "manual",
    costBase: null,
    pricedAt: null,
  } as const;

  it("keeps asset holdings at their placed value, keyed by their stable key", () => {
    const holdings: NormalizedHolding[] = [
      { ...base, id: "doc1", key: "broker:acc:VWCE", source: "brokerPosition", category: "equities", subcategory: "etfs", name: "VWCE", valueBase: 1000 },
      { ...base, id: "doc2", source: "manualAsset", category: "real-estate", subcategory: "residential", name: "Flat", valueBase: 300000 },
      { ...base, id: "loan", source: "loan", category: "liabilities", subcategory: "mortgage", name: "Mortgage", valueBase: 200000 },
      { ...base, id: "card", source: "bank", category: "liabilities", subcategory: "credit-cards", name: "Card", valueBase: -40 },
      { ...base, id: "empty", source: "bank", category: "cash", subcategory: "checking-accounts", name: "Empty", valueBase: 0 },
    ];
    expect(pieHoldingsFrom(holdings)).toEqual([
      { key: "broker:acc:VWCE", name: "VWCE", category: "equities", subcategory: "etfs", value: 1000 },
      { key: "doc2", name: "Flat", category: "real-estate", subcategory: "residential", value: 300000 },
      { key: "card", name: "Card", category: "cash", subcategory: "credit-balance", value: 40 },
    ]);
  });
});

describe("computePieDrift", () => {
  const holdings = [
    holding("vwce", "equities", "etfs", 6000),
    holding("aapl", "equities", "stocks", 2000),
    holding("bund", "bonds", "government", 1000),
    holding("btc", "crypto", "bitcoin", 1000),
    holding("flat", "real-estate", "residential", 250000),
  ];

  it("measures actual weights against targets over the pie's own holdings", () => {
    const slices: PieSlice[] = [
      { weight: 70, target: { kind: "category", category: "equities" } },
      { weight: 20, target: { kind: "category", category: "bonds" } },
      { weight: 10, target: { kind: "category", category: "crypto" } },
    ];
    const result = computePieDrift(slices, holdings);
    // Real estate is outside the pie
    expect(result.totalValue).toBe(10000);
    expect(result.slices.map((s) => s.actualWeight)).toEqual([80, 10, 10]);
    expect(result.slices.map((s) => s.drift)).toEqual([10, -10, 0]);
    expect(result.slices.map((s) => s.rebalance)).toEqual([-1000, 1000, 0]);
    expect(result.slices.map((s) => s.status)).toEqual(["over", "under", "onTarget"]);
    expect(result.maxDrift).toBe(10);
    expect(result.slices[0].holdings.map((h) => h.key)).toEqual(["vwce", "aapl"]);
  });

  it("counts a holding towards the most specific slice only", () => {
    const slices: PieSlice[] = [
      { weight: 40, target: { kind: "category", category: "equities" } },
      { weight: 40, target: { kind: "category", category: "equities", subcategory: "etfs" } },
      { weight: 20, target: { kind: "holdings", holdingKeys: ["aapl", "btc"] } },
    ];
    const result = computePieDrift(slices, holdings);
    expect(result.totalValue).toBe(9000);
    expect(result.slices.map((s) => s.actualValue)).toEqual([0, 6000, 3000]);
    expect(result.slices[0].holdings).toEqual([]);
  });

  it("does not match a subcategory slice to another subcategory", () => {
    const slices: PieSlice[] = [
      { weight: 100, target: { kind: "category", category: "equities", subcategory: "funds" } },
    ];
    const result = computePieDrift(slices, holdings);
    expect(result.totalValue).toBe(0);
    expect(result.slices[0]).toMatchObject({ actualWeight: null, drift: null, status: null, rebalance: 0 });
    expect(result.maxDrift).toBeNull();
  });

  it("reports holding keys the user no longer holds", () => {
    const slices: PieSlice[] = [
      { weight: 100, target: { kind: "holdings", holdingKeys: ["vwce", "sold"] } },
    ];
    const result = computePieDrift(slices, holdings);
    expect(result.slices[0].missingHoldingKeys).toEqual(["sold"]);
    expect(result.slices[0].actualWeight).toBe(100);
  });

  it("uses the given threshold for the status", () => {
    expect(driftStatus(4.99)).toBe("onTarget");
    expect(driftStatus(-5)).toBe("under");
    expect(driftStatus(2, 1)).toBe("over");
  });
});
