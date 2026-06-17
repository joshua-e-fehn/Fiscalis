import { describe, it, expect } from "vitest";

import {
  computeRetirementResults,
  inflateToFuture,
  portfolioTargetFromAnnualGap,
  requiredMonthlyContribution,
  DEFAULT_INFLATION_RATE,
  DEFAULT_WITHDRAWAL_RATE,
  DEFAULT_OPTIMISTIC_RETURN,
  DEFAULT_CONSERVATIVE_RETURN,
  type RetirementInputs,
} from "./retirementService";
import { calculateEndCapitalValueWithCompoundInterest } from "./financeService";

const baseInputs: RetirementInputs = {
  currentAge: 40,
  retirementAge: 45, // n = 5
  monthlyExpensesToday: 4000,
  ownsPrimaryResidence: false,
  fundableRealEstateEquity: 0,
  pensionSources: [{ label: "State", monthlyAmount: 2000 }],
  inflationRate: DEFAULT_INFLATION_RATE,
  withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
  optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
  conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
};

describe("default constants", () => {
  it("optimistic return doubles a portfolio in ~10 years (7.18%)", () => {
    expect(DEFAULT_OPTIMISTIC_RETURN).toBeCloseTo(2 ** (1 / 10) - 1, 4);
    expect(
      calculateEndCapitalValueWithCompoundInterest(
        1,
        DEFAULT_OPTIMISTIC_RETURN,
        10,
      ),
    ).toBeCloseTo(2, 3);
  });

  it("conservative return is 5%", () => {
    expect(DEFAULT_CONSERVATIVE_RETURN).toBe(0.05);
  });
});

describe("helpers", () => {
  it("inflateToFuture grows by inflation each year", () => {
    expect(inflateToFuture(4000, 0.02, 5)).toBeCloseTo(4000 * 1.02 ** 5, 6);
  });

  it("portfolioTargetFromAnnualGap applies the 4% rule (× 25)", () => {
    expect(portfolioTargetFromAnnualGap(24000, 0.04)).toBe(600000);
    expect(portfolioTargetFromAnnualGap(0, 0.04)).toBe(0);
  });
});

describe("worked example (inflation-adjusted)", () => {
  const r = computeRetirementResults(baseInputs, 100000);

  it("passes through today's expenses unchanged", () => {
    expect(r.expenseTodayMonthly).toBe(4000);
  });

  it("inflates the expense target over 5 years", () => {
    expect(r.expenseFutureMonthly).toBeCloseTo(4000 * 1.02 ** 5, 2); // ≈ 4416.32
  });

  it("computes the monthly portfolio gap after pensions", () => {
    // 4416.32 inflated expense − 2000 pension
    expect(r.gapMonthly).toBeCloseTo(2416.32, 1);
  });

  it("derives the inflation-adjusted 4%-rule target (~725k)", () => {
    expect(r.targetPortfolio).toBeCloseTo((r.gapMonthly * 12) / 0.04, 4);
    expect(r.targetPortfolio).toBeGreaterThan(720000);
    expect(r.targetPortfolio).toBeLessThan(730000);
  });

  it("also exposes the simplified (no-inflation) 600k target", () => {
    expect(r.simpleTargetPortfolio).toBe(600000);
  });
});

describe("required contribution round-trip", () => {
  // Saving the computed contribution + grown current portfolio must equal target.
  for (const annualReturn of [DEFAULT_OPTIMISTIC_RETURN, DEFAULT_CONSERVATIVE_RETURN]) {
    it(`reproduces the target at r=${annualReturn}`, () => {
      const fundableNow = 120000;
      const years = 5;
      const target = portfolioTargetFromAnnualGap(28995.86, 0.04);

      const monthly = requiredMonthlyContribution(
        fundableNow,
        target,
        years,
        annualReturn,
      );
      const annual = monthly * 12;

      const grown = calculateEndCapitalValueWithCompoundInterest(
        fundableNow,
        annualReturn,
        years,
      );
      const fvAnnuity =
        (annual * ((1 + annualReturn) ** years - 1)) / annualReturn;

      // Within a few cents — contribution is rounded to whole cents by the PMT helper.
      expect(grown + fvAnnuity).toBeCloseTo(target, 1);
    });
  }

  it("requires no saving when current assets already grow past target", () => {
    const monthly = requiredMonthlyContribution(1_000_000, 500_000, 5, 0.05);
    expect(monthly).toBe(0);
  });
});

describe("scenarios", () => {
  const r = computeRetirementResults(baseInputs, 100000);

  it("conservative requires saving at least as much as optimistic", () => {
    expect(r.conservative.monthlyContribution).toBeGreaterThanOrEqual(
      r.optimistic.monthlyContribution,
    );
  });

  it("projection series ends at the retirement age and reaches the target", () => {
    const series = r.optimistic.projectionSeries;
    const last = series[series.length - 1];
    expect(series[0].age).toBe(40);
    expect(last.age).toBe(45);
    expect(last.portfolioValue).toBeCloseTo(r.targetPortfolio, 0);
  });

  it("exposes a no-contribution path equal to the grown current assets", () => {
    const last =
      r.optimistic.projectionSeries[r.optimistic.projectionSeries.length - 1];
    // No-contribution end value == current assets grown alone.
    expect(last.portfolioValueNoContrib).toBeCloseTo(
      r.optimistic.projectedFromCurrent,
      4,
    );
    // The saving path ends above the no-saving path (since a gap remains).
    expect(last.portfolioValue).toBeGreaterThan(last.portfolioValueNoContrib);
  });
});

describe("edge cases", () => {
  it("pensions covering all expenses ⇒ zero target and no saving", () => {
    const r = computeRetirementResults(
      { ...baseInputs, pensionSources: [{ label: "State", monthlyAmount: 9000 }] },
      50000,
    );
    expect(r.pensionsCoverAll).toBe(true);
    expect(r.targetPortfolio).toBe(0);
    expect(r.optimistic.monthlyContribution).toBe(0);
    expect(r.optimistic.onTrack).toBe(true);
  });

  it("already past target ⇒ onTrack with no contribution", () => {
    const r = computeRetirementResults(baseInputs, 2_000_000);
    expect(r.optimistic.onTrack).toBe(true);
    expect(r.optimistic.monthlyContribution).toBe(0);
    expect(r.optimistic.ageReachTargetWithoutSaving).toBe(40);
  });

  it("flags an invalid timeline when retirementAge ≤ currentAge", () => {
    const r = computeRetirementResults(
      { ...baseInputs, currentAge: 50, retirementAge: 45 },
      100000,
    );
    expect(r.invalidTimeline).toBe(true);
    expect(r.yearsToRetirement).toBe(0);
  });

  it("counts fundable real-estate equity toward the funding basis", () => {
    const without = computeRetirementResults(baseInputs, 100000);
    const withEquity = computeRetirementResults(
      { ...baseInputs, fundableRealEstateEquity: 50000 },
      100000,
    );
    expect(withEquity.fundableNow).toBe(150000);
    expect(withEquity.optimistic.monthlyContribution).toBeLessThan(
      without.optimistic.monthlyContribution,
    );
  });
});
