import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  CATALOG_PREMIUMS,
  catalogPremiums,
  customItemPremiums,
} from "@/convex/lib/metalPremiums";

const seedSource = readFileSync(
  path.resolve(__dirname, "../../frontend/convex/seedCatalog.ts"),
  "utf8",
);
const seedNames = [...seedSource.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);

describe("calibrated catalog premiums", () => {
  it("cover exactly the seeded catalog products", () => {
    expect(seedNames.length).toBeGreaterThan(40);
    expect([...seedNames].sort()).toEqual(Object.keys(CATALOG_PREMIUMS).sort());
  });

  it("keep sell below buy and within plausible bounds", () => {
    for (const [name, { buy, sell }] of Object.entries(CATALOG_PREMIUMS)) {
      expect(sell, name).toBeLessThan(buy);
      expect(buy, name).toBeGreaterThan(0);
      expect(buy, name).toBeLessThan(0.6);
      expect(sell, name).toBeGreaterThan(-0.15);
      expect(sell, name).toBeLessThan(0.05);
    }
  });

  it("widen the gold coin spread as the coin gets smaller", () => {
    const spread = (n: string) => CATALOG_PREMIUMS[n].buy - CATALOG_PREMIUMS[n].sell;
    for (const coin of ["Philharmonic", "Maple Leaf", "Krugerrand", "American Eagle"]) {
      expect(spread(`${coin} 1/10 oz`)).toBeGreaterThan(spread(`${coin} 1/4 oz`));
      expect(spread(`${coin} 1/4 oz`)).toBeGreaterThan(spread(`${coin} 1/2 oz`));
      expect(spread(`${coin} 1/2 oz`)).toBeGreaterThan(spread(`${coin} 1 oz`));
    }
  });

  it("price VAT into silver bars and platinum-group buy premiums (19%)", () => {
    for (const [name, { buy }] of Object.entries(CATALOG_PREMIUMS)) {
      if (/^(Silver Bar|Platinum|Palladium)/.test(name)) expect(buy, name).toBeGreaterThan(0.19);
    }
  });

  it("throws for an uncalibrated product", () => {
    expect(() => catalogPremiums("Unobtainium 1 oz")).toThrow();
  });
});

describe("customItemPremiums", () => {
  it("returns per-metal coin/bar defaults and maps jewelry/scrap to bar", () => {
    expect(customItemPremiums("gold", "coin")).toEqual({ buy: 0.025, sell: -0.02 });
    expect(customItemPremiums("gold", "scrap")).toEqual(customItemPremiums("gold", "bar"));
    expect(customItemPremiums("silver", "bar").buy).toBeGreaterThan(0.19);
  });
});
