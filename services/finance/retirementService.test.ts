import { describe, it, expect } from "vitest";

import {
  computeRetirementResults,
  firstRetirementInputError,
  inflateToFuture,
  portfolioTargetFromAnnualGap,
  requiredMonthlyContribution,
  retirementPlanProblem,
  validatePensionSources,
  validateRetirementAges,
  validateRetirementAssumptions,
  validateRetirementInputs,
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

  it("treats pensions as today's money and inflates them too", () => {
    expect(r.pensionTodayMonthly).toBe(2000);
    expect(r.pensionFutureMonthly).toBeCloseTo(2000 * 1.02 ** 5, 6); // ≈ 2208.16
  });

  it("computes the monthly portfolio gap after pensions", () => {
    // 4416.32 inflated expense − 2208.16 inflated pension
    expect(r.gapMonthly).toBeCloseTo((4000 - 2000) * 1.02 ** 5, 6); // ≈ 2208.16
  });

  it("derives the inflation-adjusted 4%-rule target (~662k)", () => {
    expect(r.targetPortfolio).toBeCloseTo((r.gapMonthly * 12) / 0.04, 4);
    expect(r.targetPortfolio).toBeCloseTo(662448.48, 1);
  });

  it("also exposes the simplified today's-money 600k target", () => {
    expect(r.simpleTargetPortfolio).toBe(600000);
  });

  it("realistic target = simple target × inflation factor (same basis)", () => {
    expect(r.targetPortfolio).toBeCloseTo(
      r.simpleTargetPortfolio * 1.02 ** 5,
      4,
    );
  });

  it("regression: 40→67, €3,000 expenses, €1,500 pension ⇒ ≈ €768k", () => {
    const long = computeRetirementResults(
      {
        ...baseInputs,
        retirementAge: 67,
        monthlyExpensesToday: 3000,
        pensionSources: [{ label: "State", monthlyAmount: 1500 }],
      },
      100000,
    );
    expect(long.targetPortfolio).toBeCloseTo(1500 * 1.02 ** 27 * 300, 4);
    expect(long.targetPortfolio).toBeCloseTo(768098.91, 0);
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

  it("ignores negative pension amounts in the math", () => {
    const r = computeRetirementResults(
      {
        ...baseInputs,
        pensionSources: [
          { label: "State", monthlyAmount: 2000 },
          { label: "Typo", monthlyAmount: -500 },
        ],
      },
      100000,
    );
    expect(r.pensionTodayMonthly).toBe(2000);
  });
});

describe("progress and funding-base edge cases", () => {
  const coveredByPensions: RetirementInputs = {
    ...baseInputs,
    pensionSources: [{ label: "State", monthlyAmount: 9000 }],
  };

  it("zero net worth ⇒ 0% progress and saving from scratch", () => {
    const r = computeRetirementResults(baseInputs, 0);
    expect(r.fundableNow).toBe(0);
    expect(r.investableNow).toBe(0);
    expect(r.hasNetDebt).toBe(false);
    expect(r.progressPct).toBe(0);
    expect(r.optimistic.projectedFromCurrent).toBe(0);
    expect(r.optimistic.onTrack).toBe(false);
    expect(r.optimistic.monthlyContribution).toBeGreaterThan(0);
    expect(r.optimistic.yearsToTargetWithoutSaving).toBeNull();
  });

  it("negative net worth is flagged and never compounded", () => {
    const zero = computeRetirementResults(baseInputs, 0);
    const r = computeRetirementResults(baseInputs, -50000);
    expect(r.fundableNow).toBe(-50000);
    expect(r.investableNow).toBe(0);
    expect(r.hasNetDebt).toBe(true);
    expect(r.progressPct).toBe(0);
    for (const scenario of [r.optimistic, r.conservative]) {
      expect(scenario.projectedFromCurrent).toBe(0);
      for (const point of scenario.projectionSeries) {
        expect(point.portfolioValueNoContrib).toBeGreaterThanOrEqual(0);
        expect(point.portfolioValue).toBeGreaterThanOrEqual(0);
      }
    }
    // Same required saving as starting from zero (debt does not grow at 7.18%).
    expect(r.optimistic.monthlyContribution).toBe(
      zero.optimistic.monthlyContribution,
    );
  });

  it("property equity can offset a negative net worth", () => {
    const r = computeRetirementResults(
      { ...baseInputs, fundableRealEstateEquity: 80000 },
      -30000,
    );
    expect(r.fundableNow).toBe(50000);
    expect(r.investableNow).toBe(50000);
    expect(r.hasNetDebt).toBe(false);
  });

  it("pensions covering everything ⇒ 100% progress at any net worth", () => {
    for (const netWorth of [50000, 0, -50000]) {
      const r = computeRetirementResults(coveredByPensions, netWorth);
      expect(r.pensionsCoverAll).toBe(true);
      expect(r.targetPortfolio).toBe(0);
      expect(r.progressPct).toBe(1);
      expect(r.optimistic.onTrack).toBe(true);
      expect(r.optimistic.monthlyContribution).toBe(0);
      expect(r.conservative.onTrack).toBe(true);
      expect(r.conservative.monthlyContribution).toBe(0);
    }
  });

  it("pensions covering everything with net debt still flags the debt", () => {
    const r = computeRetirementResults(coveredByPensions, -50000);
    expect(r.hasNetDebt).toBe(true);
    expect(r.investableNow).toBe(0);
  });

  it("withdrawalRate = 0 ⇒ infinite target and 0% progress (never 100%)", () => {
    const r = computeRetirementResults(
      { ...baseInputs, withdrawalRate: 0 },
      50000,
    );
    expect(r.targetPortfolio).toBe(Infinity);
    expect(r.progressPct).toBe(0);
    expect(r.optimistic.onTrack).toBe(false);
    expect(r.optimistic.monthlyContribution).toBe(Infinity);
    expect(r.optimistic.yearsToTargetWithoutSaving).toBeNull();
  });

  it("progress can exceed 100% when already ahead of the target", () => {
    const r = computeRetirementResults(baseInputs, 2_000_000);
    expect(r.progressPct).toBeGreaterThan(1);
  });
});

describe("input validation", () => {
  const assumptions = {
    inflationRate: DEFAULT_INFLATION_RATE,
    withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
    optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
    conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
  };

  it("accepts the defaults", () => {
    expect(validateRetirementAssumptions(assumptions)).toEqual({});
    expect(validateRetirementInputs(baseInputs)).toEqual({});
  });

  it("rejects a 0% or negative withdrawal rate and anything above 20%", () => {
    for (const withdrawalRate of [0, -0.01, 0.21, NaN, Infinity]) {
      expect(
        validateRetirementAssumptions({ ...assumptions, withdrawalRate }),
      ).toHaveProperty("withdrawalRate");
    }
    expect(
      validateRetirementAssumptions({ ...assumptions, withdrawalRate: 0.2 }),
    ).toEqual({});
  });

  it("bounds the other rates to 0–20% (0 allowed)", () => {
    for (const field of [
      "inflationRate",
      "optimisticReturn",
      "conservativeReturn",
    ] as const) {
      for (const bad of [-0.01, 0.25, NaN]) {
        expect(
          validateRetirementAssumptions({
            ...assumptions,
            optimisticReturn: 0.2,
            [field]: bad,
          }),
        ).toHaveProperty(field);
      }
    }
    expect(
      validateRetirementAssumptions({
        ...assumptions,
        inflationRate: 0,
        conservativeReturn: 0,
      }),
    ).toEqual({});
  });

  it("rejects a conservative return above the expected return", () => {
    const errors = validateRetirementAssumptions({
      ...assumptions,
      optimisticReturn: 0.05,
      conservativeReturn: 0.06,
    });
    expect(Object.keys(errors)).toEqual(["conservativeReturn"]);
    expect(
      validateRetirementAssumptions({
        ...assumptions,
        optimisticReturn: 0.05,
        conservativeReturn: 0.05,
      }),
    ).toEqual({});
  });

  it("requires whole-number ages between 0 and 120", () => {
    expect(
      validateRetirementAges({ currentAge: 40, retirementAge: 67.5 }),
    ).toHaveProperty("retirementAge");
    expect(
      validateRetirementAges({ currentAge: -1, retirementAge: 67 }),
    ).toHaveProperty("currentAge");
    expect(
      validateRetirementAges({ currentAge: 40, retirementAge: 121 }),
    ).toHaveProperty("retirementAge");
    expect(
      validateRetirementAges({ currentAge: NaN, retirementAge: 67 }),
    ).toHaveProperty("currentAge");
  });

  it("requires retirement after the current age unless disabled (drafts)", () => {
    const ages = { currentAge: 67, retirementAge: 67 };
    expect(validateRetirementAges(ages)).toHaveProperty("retirementAge");
    expect(
      validateRetirementAges(ages, { requireValidTimeline: false }),
    ).toEqual({});
  });

  it("rejects negative or non-finite pension amounts", () => {
    expect(
      validatePensionSources([{ label: "State", monthlyAmount: -500 }]),
    ).toHaveProperty("pensionSources");
    expect(
      validatePensionSources([{ label: "State", monthlyAmount: NaN }]),
    ).toHaveProperty("pensionSources");
    expect(
      validatePensionSources([{ label: "State", monthlyAmount: 0 }]),
    ).toEqual({});
  });

  it("collects errors across all sections", () => {
    const errors = validateRetirementInputs({
      ...baseInputs,
      monthlyExpensesToday: -1,
      fundableRealEstateEquity: Infinity,
      pensionSources: [{ label: "State", monthlyAmount: -1 }],
      withdrawalRate: 0,
    });
    expect(Object.keys(errors).sort()).toEqual([
      "fundableRealEstateEquity",
      "monthlyExpensesToday",
      "pensionSources",
      "withdrawalRate",
    ]);
  });

  it("requires expenses above zero for a complete plan, not for drafts", () => {
    const zero = { ...baseInputs, monthlyExpensesToday: 0 };
    expect(validateRetirementInputs(zero)).toHaveProperty(
      "monthlyExpensesToday",
    );
    expect(
      validateRetirementInputs(zero, { requireValidTimeline: false }),
    ).toEqual({});
  });
});

describe("firstRetirementInputError", () => {
  // A draft stored before the assumption rules existed.
  const legacy = {
    ...baseInputs,
    optimisticReturn: 0.0718,
    conservativeReturn: 0.08,
  };

  it("ignores a stored-invalid field that isn't being saved", () => {
    expect(
      firstRetirementInputError(legacy, {
        fields: ["currentAge", "retirementAge", "monthlyExpensesToday"],
        requireValidTimeline: false,
      }),
    ).toBeUndefined();
  });

  it("reports it once the field is being saved", () => {
    expect(
      firstRetirementInputError(legacy, {
        fields: ["monthlyExpensesToday", "conservativeReturn"],
        requireValidTimeline: false,
      }),
    ).toBe("Conservative return can't be higher than the expected return");
  });

  it("reports a cross-field error caused by a saved partner field", () => {
    expect(
      firstRetirementInputError(legacy, {
        fields: ["optimisticReturn"],
        requireValidTimeline: false,
      }),
    ).toBe("Conservative return can't be higher than the expected return");
    expect(
      firstRetirementInputError(
        { ...baseInputs, currentAge: 70, retirementAge: 67 },
        { fields: ["currentAge"] },
      ),
    ).toBe("Retirement age must be after your current age");
  });

  it("checks every field when none are given", () => {
    expect(firstRetirementInputError(legacy)).toBe(
      "Conservative return can't be higher than the expected return",
    );
    expect(firstRetirementInputError(baseInputs)).toBeUndefined();
  });
});

describe("retirementPlanProblem", () => {
  const results = { invalidTimeline: false };

  it("flags an invalid timeline first", () => {
    expect(
      retirementPlanProblem(
        { invalidTimeline: true },
        { ...baseInputs, withdrawalRate: 0 },
      ),
    ).toMatchObject({ title: "Check your retirement age" });
  });

  it("flags the first invalid assumption", () => {
    expect(
      retirementPlanProblem(results, { ...baseInputs, inflationRate: 0.25 }),
    ).toEqual({
      title: "Check your assumptions",
      body: "Inflation rate must be between 0% and 20%.",
    });
  });

  it("returns null for a valid plan or when no assumptions are given", () => {
    expect(retirementPlanProblem(results, baseInputs)).toBeNull();
    expect(retirementPlanProblem(results)).toBeNull();
  });
});
