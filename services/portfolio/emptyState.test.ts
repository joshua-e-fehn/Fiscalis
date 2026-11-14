import { describe, expect, it } from "vitest";

import { isPortfolioEmpty } from "./emptyState";

const none = { bankingCount: 0, brokerCount: 0, cryptoCount: 0 };
const empty = { totalAssets: 0, totalLiabilities: 0 };

describe("isPortfolioEmpty", () => {
  it("is empty with no connections, assets or liabilities", () => {
    expect(isPortfolioEmpty(empty, none)).toBe(true);
  });

  it("is not empty while either query is loading", () => {
    expect(isPortfolioEmpty(undefined, none)).toBe(false);
    expect(isPortfolioEmpty(null, none)).toBe(false);
    expect(isPortfolioEmpty(empty, undefined)).toBe(false);
  });

  it("is not empty with any connection, even before it has synced", () => {
    expect(isPortfolioEmpty(empty, { ...none, bankingCount: 1 })).toBe(false);
    expect(isPortfolioEmpty(empty, { ...none, cryptoCount: 1 })).toBe(false);
  });

  it("is not empty with manual assets or a loan", () => {
    expect(isPortfolioEmpty({ ...empty, totalAssets: 5 }, none)).toBe(false);
    expect(isPortfolioEmpty({ ...empty, totalLiabilities: 5 }, none)).toBe(false);
  });
});
