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
  futureValueOfMonthlyContributions,
  monthlyRateFromAnnual,
  mortgageBalanceOn,
  residenceMortgageFromLoan,
  retirementTimeline,
  type RetirementFundingBase,
  type RetirementInputs,
} from "./retirementService";
import { calculateEndCapitalValueWithCompoundInterest } from "./financeService";
import type { ScheduleLoan } from "./loanScheduleService";

/** A funding base equal to `netWorth`, all of it growing at the scenario return. */
function nw(netWorth: number): RetirementFundingBase {
  return {
    assetsByCategory: { equities: Math.max(0, netWorth) },
    totalLiabilities: Math.max(0, -netWorth),
  };
}

const baseInputs: RetirementInputs = {
  currentAge: 40,
  retirementAge: 45, // n = 5
  monthlyExpensesToday: 4000,
  ownsPrimaryResidence: false,
  fundableRealEstateEquity: 0,
  pensionSources: [{ label: "State", monthlyAmount: 2000, gross: false }],
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
  const r = computeRetirementResults(baseInputs, nw(100000));

  it("flags no fixed-euro pension when every source is indexed", () => {
    expect(r.hasFixedPensions).toBe(false);
  });

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
        pensionSources: [{ label: "State", monthlyAmount: 1500, gross: false }],
      }, nw(100000));
    expect(long.targetPortfolio).toBeCloseTo(1500 * 1.02 ** 27 * 300, 4);
    expect(long.targetPortfolio).toBeCloseTo(768098.91, 0);
  });
});

describe("required contribution round-trip (monthly deposits)", () => {
  // Monthly deposits at r_m = (1+r)^(1/12) − 1 plus the grown current
  // portfolio must rebuild the target exactly.
  for (const annualReturn of [DEFAULT_OPTIMISTIC_RETURN, DEFAULT_CONSERVATIVE_RETURN]) {
    for (const growth of [0, DEFAULT_INFLATION_RATE]) {
      it(`reproduces the target at r=${annualReturn}, g=${growth}`, () => {
        const fundableNow = 120000;
        const years = 5;
        const target = portfolioTargetFromAnnualGap(28995.86, 0.04);
        const grown = calculateEndCapitalValueWithCompoundInterest(
          fundableNow,
          annualReturn,
          years,
        );
        const monthly = requiredMonthlyContribution(
          target - grown,
          years,
          annualReturn,
          growth,
        );

        // Rebuild month by month: deposit at month end, then compound.
        const rm = monthlyRateFromAnnual(annualReturn);
        const gm = monthlyRateFromAnnual(growth);
        let balance = 0;
        for (let k = 0; k < years * 12; k++) {
          balance = balance * (1 + rm) + monthly * (1 + gm) ** k;
        }
        expect(grown + balance).toBeCloseTo(target, 4);
      });
    }
  }

  it("is cheaper than an end-of-year annual payment / 12 (intra-year growth)", () => {
    const r = 0.0718;
    const n = 28;
    const gap = 500_000;
    const annualPmtOver12 = (gap * r) / ((1 + r) ** n - 1) / 12;
    const monthly = requiredMonthlyContribution(gap, n, r);
    expect(monthly).toBeLessThan(annualPmtOver12);
    expect(monthly / annualPmtOver12).toBeCloseTo(0.9686, 2); // ≈ 3% less
  });

  it("requires no saving when nothing remains to close", () => {
    expect(requiredMonthlyContribution(0, 5, 0.05)).toBe(0);
    expect(requiredMonthlyContribution(-10_000, 5, 0.05)).toBe(0);
    expect(requiredMonthlyContribution(10_000, 0, 0.05)).toBe(0);
  });

  it("handles r = g (no real growth) as P · N · (1+r)^(N−1)", () => {
    expect(futureValueOfMonthlyContributions(100, 0.02, 12, 0.02)).toBeCloseTo(
      100 * 12 * (1 + monthlyRateFromAnnual(0.02)) ** 11,
      8,
    );
    expect(futureValueOfMonthlyContributions(100, 0, 12)).toBe(1200);
  });
});

describe("scenarios", () => {
  const r = computeRetirementResults(baseInputs, nw(100000));

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
      { ...baseInputs, pensionSources: [{ label: "State", monthlyAmount: 9000 }] }, nw(50000));
    expect(r.pensionsCoverAll).toBe(true);
    expect(r.targetPortfolio).toBe(0);
    expect(r.optimistic.monthlyContribution).toBe(0);
    expect(r.optimistic.onTrack).toBe(true);
  });

  it("already past target ⇒ onTrack with no contribution", () => {
    const r = computeRetirementResults(baseInputs, nw(2_000_000));
    expect(r.optimistic.onTrack).toBe(true);
    expect(r.optimistic.monthlyContribution).toBe(0);
    expect(r.optimistic.ageReachTargetWithoutSaving).toBe(40);
  });

  it("flags an invalid timeline when retirementAge ≤ currentAge", () => {
    const r = computeRetirementResults(
      { ...baseInputs, currentAge: 50, retirementAge: 45 }, nw(100000));
    expect(r.invalidTimeline).toBe(true);
    expect(r.yearsToRetirement).toBe(0);
  });

  it("counts fundable real-estate equity toward the funding basis", () => {
    const without = computeRetirementResults(baseInputs, nw(100000));
    const withEquity = computeRetirementResults(
      { ...baseInputs, fundableRealEstateEquity: 50000 }, nw(100000));
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
          { label: "State", monthlyAmount: 2000, gross: false },
          { label: "Typo", monthlyAmount: -500, gross: false },
        ],
      }, nw(100000));
    expect(r.pensionTodayMonthly).toBe(2000);
  });
});

describe("progress and funding-base edge cases", () => {
  const coveredByPensions: RetirementInputs = {
    ...baseInputs,
    pensionSources: [{ label: "State", monthlyAmount: 9000 }],
  };

  it("zero net worth ⇒ 0% progress and saving from scratch", () => {
    const r = computeRetirementResults(baseInputs, nw(0));
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
    const zero = computeRetirementResults(baseInputs, nw(0));
    const r = computeRetirementResults(baseInputs, nw(-50000));
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
      { ...baseInputs, fundableRealEstateEquity: 80000 }, nw(-30000));
    expect(r.fundableNow).toBe(50000);
    expect(r.investableNow).toBe(50000);
    expect(r.hasNetDebt).toBe(false);
  });

  it("pensions covering everything ⇒ 100% progress at any net worth", () => {
    for (const netWorth of [50000, 0, -50000]) {
      const r = computeRetirementResults(coveredByPensions, nw(netWorth));
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
    const r = computeRetirementResults(coveredByPensions, nw(-50000));
    expect(r.hasNetDebt).toBe(true);
    expect(r.investableNow).toBe(0);
  });

  it("withdrawalRate = 0 ⇒ infinite target and 0% progress (never 100%)", () => {
    const r = computeRetirementResults(
      { ...baseInputs, withdrawalRate: 0 }, nw(50000));
    expect(r.targetPortfolio).toBe(Infinity);
    expect(r.progressPct).toBe(0);
    expect(r.optimistic.onTrack).toBe(false);
    expect(r.optimistic.monthlyContribution).toBe(Infinity);
    expect(r.optimistic.yearsToTargetWithoutSaving).toBeNull();
  });

  it("progress can exceed 100% when already ahead of the target", () => {
    const r = computeRetirementResults(baseInputs, nw(2_000_000));
    expect(r.progressPct).toBeGreaterThan(1);
  });
});

describe("horizon from the date of birth (fractional years)", () => {
  const today = new Date(2026, 10, 11); // 11 Nov 2026, local calendar date

  it("runs to date of birth + retirement age, not retirementAge − floor(age)", () => {
    const t = retirementTimeline(
      { birthDate: "1986-12-01", currentAge: 39, retirementAge: 67 },
      today,
    );
    expect(t.yearsToRetirement).toBeCloseTo(27.056, 2);
    expect(t.currentAgeExact).toBeCloseTo(39.95, 2);
    expect(t.retirementDate).toBe("2053-12-01");
  });

  it("falls back to whole years without a (valid) date of birth", () => {
    for (const birthDate of [undefined, "", "not-a-date"]) {
      const t = retirementTimeline(
        { birthDate, currentAge: 39, retirementAge: 67 },
        today,
      );
      expect(t).toEqual({
        currentAgeExact: 39,
        yearsToRetirement: 28,
        retirementDate: "2054-11-11",
      });
    }
  });

  it("asks for more saving than the overstated whole-year horizon", () => {
    const inputs: RetirementInputs = {
      ...baseInputs,
      currentAge: 39,
      retirementAge: 67,
      monthlyExpensesToday: 3000,
      pensionSources: [{ label: "State", monthlyAmount: 1500, gross: false }],
    };
    const exact = computeRetirementResults(
      { ...inputs, birthDate: "1986-12-01" },
      nw(50000),
      today,
    );
    const whole = computeRetirementResults(inputs, nw(50000), today);
    expect(exact.yearsToRetirement).toBeCloseTo(27.056, 2);
    expect(whole.yearsToRetirement).toBe(28);
    expect(exact.optimistic.monthlyContribution).toBeGreaterThan(
      whole.optimistic.monthlyContribution * 1.05,
    );
  });

  it("series starts at the exact age, steps through birthdays and ends at retirement", () => {
    const r = computeRetirementResults(
      { ...baseInputs, birthDate: "1986-12-01", currentAge: 39, retirementAge: 45 },
      nw(100000),
      today,
    );
    const series = r.optimistic.projectionSeries;
    expect(series[0].age).toBeCloseTo(39.9, 5);
    expect(series[1].age).toBe(40);
    expect(series[series.length - 1].age).toBe(45);
    expect(series[series.length - 1].yearOffset).toBeCloseTo(r.yearsToRetirement, 8);
    expect(series[series.length - 1].portfolioValue).toBeCloseTo(
      r.targetPortfolio,
      2,
    );
  });

  it("flags a retirement date already passed", () => {
    const r = computeRetirementResults(
      { ...baseInputs, birthDate: "1960-01-01", currentAge: 66, retirementAge: 65 },
      nw(0),
      today,
    );
    expect(r.invalidTimeline).toBe(true);
    expect(r.yearsToRetirement).toBe(0);
  });
});

describe("asset-class-weighted funding base", () => {
  const mixed: RetirementFundingBase = {
    assetsByCategory: { equities: 40000, cash: 60000 },
    totalLiabilities: 0,
  };

  it("weights each category's expected return by value", () => {
    const r = computeRetirementResults(baseInputs, mixed);
    // 40% at 7.18%, 60% cash at inflation (2%).
    expect(r.optimistic.baseReturn).toBeCloseTo(0.4 * 0.0718 + 0.6 * 0.02, 10);
    expect(r.conservative.baseReturn).toBeCloseTo(0.4 * 0.05 + 0.6 * 0.02, 10);
    expect(r.optimistic.projectedFromCurrent).toBeCloseTo(
      100000 * (1 + r.optimistic.baseReturn) ** 5,
      6,
    );
    expect(r.optimistic.annualReturn).toBe(DEFAULT_OPTIMISTIC_RETURN);
  });

  it("bonds sit halfway between the scenario return and inflation", () => {
    const r = computeRetirementResults(baseInputs, {
      assetsByCategory: { bonds: 10000 },
      totalLiabilities: 0,
    });
    expect(r.optimistic.baseReturn).toBeCloseTo((0.0718 + 0.02) / 2, 10);
  });

  it("lets the user exclude a category (e.g. the emergency fund)", () => {
    const r = computeRetirementResults(
      { ...baseInputs, fundingTreatments: { cash: "exclude" } },
      mixed,
    );
    expect(r.includedAssets).toBe(40000);
    expect(r.excludedAssets).toBe(60000);
    expect(r.fundableNow).toBe(40000);
    expect(r.optimistic.baseReturn).toBeCloseTo(0.0718, 10);
    expect(r.fundingLines.map((l) => [l.category, l.treatment])).toEqual([
      ["equities", "growth"],
      ["cash", "exclude"],
    ]);
  });

  it("lets the user override a default (crypto at inflation)", () => {
    const r = computeRetirementResults(
      { ...baseInputs, fundingTreatments: { crypto: "inflation" } },
      { assetsByCategory: { crypto: 5000 }, totalLiabilities: 0 },
    );
    expect(r.optimistic.baseReturn).toBeCloseTo(0.02, 10);
  });

  it("liabilities reduce the base but not the weights", () => {
    const r = computeRetirementResults(baseInputs, {
      ...mixed,
      totalLiabilities: 20000,
    });
    expect(r.fundableNow).toBe(80000);
    expect(r.liabilitiesCounted).toBe(20000);
    expect(r.optimistic.baseReturn).toBeCloseTo(0.4 * 0.0718 + 0.6 * 0.02, 10);
  });
});

describe("inflation-indexed contributions", () => {
  it("starts lower and rises with inflation, reaching the same target", () => {
    const flat = computeRetirementResults(
      { ...baseInputs, retirementAge: 67 },
      nw(50000),
    );
    const indexed = computeRetirementResults(
      { ...baseInputs, retirementAge: 67, indexContributions: true },
      nw(50000),
    );
    expect(flat.contributionsIndexed).toBe(false);
    expect(flat.optimistic.finalMonthlyContribution).toBe(
      flat.optimistic.monthlyContribution,
    );
    expect(indexed.contributionsIndexed).toBe(true);
    expect(indexed.optimistic.monthlyContribution).toBeLessThan(
      flat.optimistic.monthlyContribution,
    );
    expect(indexed.optimistic.finalMonthlyContribution).toBeCloseTo(
      indexed.optimistic.monthlyContribution *
        (1 + monthlyRateFromAnnual(0.02)) ** (27 * 12 - 1),
      6,
    );
    const last = indexed.optimistic.projectionSeries.at(-1);
    expect(last?.portfolioValue).toBeCloseTo(indexed.targetPortfolio, 2);
  });
});

describe("pension sources: gross/net and indexed/nominal", () => {
  it("takes the flat deduction off gross sources only", () => {
    const r = computeRetirementResults(
      {
        ...baseInputs,
        pensionDeductionRate: 0.2,
        pensionSources: [
          { label: "State", monthlyAmount: 1500 }, // gross by default
          { label: "Private", monthlyAmount: 500, gross: false },
        ],
      },
      nw(100000),
    );
    expect(r.pensionEnteredMonthly).toBe(2000);
    expect(r.pensionDeductionsMonthly).toBeCloseTo(300, 8);
    expect(r.pensionTodayMonthly).toBeCloseTo(1700, 8);
    expect(r.pensionFutureMonthly).toBeCloseTo(1700 * 1.02 ** 5, 6);
  });

  it("uses the default deduction rate when none is set", () => {
    const r = computeRetirementResults(
      { ...baseInputs, pensionSources: [{ label: "State", monthlyAmount: 1500 }] },
      nw(0),
    );
    expect(r.pensionTodayMonthly).toBeCloseTo(1500 * (1 - 0.17), 8);
  });

  it("does not inflate a nominal source", () => {
    const r = computeRetirementResults(
      {
        ...baseInputs,
        pensionSources: [
          { label: "State", monthlyAmount: 1000, gross: false },
          { label: "Company", monthlyAmount: 500, gross: false, indexed: false },
        ],
      },
      nw(0),
    );
    expect(r.pensionFutureMonthly).toBeCloseTo(1000 * 1.02 ** 5 + 500, 6);
    expect(r.hasFixedPensions).toBe(true);
  });
});

describe("withdrawal tax gross-up", () => {
  it("defaults to a pre-tax target", () => {
    const r = computeRetirementResults(baseInputs, nw(0));
    expect(r.withdrawalTaxRate).toBe(0);
    expect(r.targetPortfolio).toBeCloseTo(r.gapAnnual / 0.04, 6);
  });

  it("grosses the annual need up by 1 / (1 − tax)", () => {
    const r = computeRetirementResults(
      { ...baseInputs, withdrawalTaxRate: 0.2 },
      nw(0),
    );
    expect(r.targetPortfolio).toBeCloseTo(r.gapAnnual / 0.8 / 0.04, 6);
    expect(r.simpleTargetPortfolio).toBeCloseTo((2000 * 12) / 0.8 / 0.04, 6);
  });
});

describe("primary residence mortgage", () => {
  const today = new Date(2026, 0, 15);
  const at = (inputs: RetirementInputs, base: RetirementFundingBase) =>
    computeRetirementResults(inputs, base, today);
  // A 25-year annuity mortgage starting today: €250k at 3%, monthly.
  const loan: ScheduleLoan = {
    loanType: "ANNUITY",
    originalPrincipal: 250000,
    currentBalance: 250000,
    annualInterestRate: 0.03,
    termMonths: 300,
    paymentFrequency: "MONTHLY",
    scheduledPayment: 1185.53,
    startDate: "2026-01-15",
    status: "active",
  };
  const mortgage = residenceMortgageFromLoan(loan, [], "2026-01-15");
  const base: RetirementFundingBase = {
    assetsByCategory: { equities: 100000 },
    totalLiabilities: 260000, // mortgage + a €10k car loan
    primaryResidenceMortgage: mortgage,
  };
  const owns = { ...baseInputs, ownsPrimaryResidence: true };

  it("takes the residence mortgage out of the funding base", () => {
    const r = at(owns, base);
    expect(r.liabilitiesCounted).toBe(10000);
    expect(r.fundableNow).toBe(90000);
    expect(r.hasNetDebt).toBe(false);
    expect(r.residenceMortgage?.monthlyPayment).toBeCloseTo(1185.53, 2);
  });

  it("keeps other debts when the mortgage is not in the liabilities", () => {
    // e.g. a defaulted loan the dashboard's liabilities don't count
    const r = at(owns, {
      assetsByCategory: { equities: 100000 },
      totalLiabilities: 20000,
      primaryResidenceMortgage: { ...mortgage, countedInLiabilities: false },
    });
    expect(r.liabilitiesCounted).toBe(20000);
    expect(r.fundableNow).toBe(80000);
  });

  it("marks only loans the liabilities count", () => {
    expect(mortgage.countedInLiabilities).toBe(true);
    expect(
      residenceMortgageFromLoan({ ...loan, status: "defaulted" }, [], "2026-01-15")
        .countedInLiabilities,
    ).toBe(false);
  });

  it("adds what the schedule still shows owed at retirement to the target", () => {
    const r = at(owns, base); // retires in 5 years (2031-01-15)
    const owed = mortgageBalanceOn(mortgage, "2031-01-15");
    expect(owed).toBeGreaterThan(0);
    expect(owed).toBeLessThan(250000);
    expect(r.residenceMortgage?.balanceAtRetirement).toBeCloseTo(owed, 6);
    expect(r.targetPortfolio).toBeCloseTo(r.gapAnnual / 0.04 + owed, 6);
  });

  it("adds nothing once the mortgage is repaid before retirement", () => {
    const r = at({ ...owns, retirementAge: 67 }, base);
    expect(r.residenceMortgage?.balanceAtRetirement).toBe(0);
    expect(r.targetPortfolio).toBeCloseTo(r.gapAnnual / 0.04, 6);
  });

  it("is ignored when the user doesn't own the home they live in", () => {
    const r = at(baseInputs, base);
    expect(r.residenceMortgage).toBeNull();
    expect(r.fundableNow).toBe(-160000);
  });

  it("projects a constant-principal loan by its own schedule", () => {
    const cp = residenceMortgageFromLoan(
      { ...loan, loanType: "CONSTANT_PRINCIPAL", scheduledPayment: 1458.33 },
      [],
      "2026-01-15",
    );
    // €250k / 300 = €833.33 principal a month; 60 payments repay €50k.
    expect(mortgageBalanceOn(cp, "2031-01-15")).toBeCloseTo(200000, 0);
    // First payment: €833.33 principal + €625 interest.
    expect(cp.monthlyPayment).toBeCloseTo(1458.33, 2);
  });

  it("settles a bullet loan at maturity, not before", () => {
    const bullet = residenceMortgageFromLoan(
      { ...loan, loanType: "BULLET", termMonths: 36, scheduledPayment: 625 },
      [],
      "2026-01-15",
    );
    expect(mortgageBalanceOn(bullet, "2028-12-31")).toBe(250000);
    expect(mortgageBalanceOn(bullet, "2029-01-15")).toBe(0);
    expect(bullet.monthlyPayment).toBeCloseTo(625, 2); // interest only
    // Matures before retirement: nothing is added to the target.
    const r = at(owns, { ...base, primaryResidenceMortgage: bullet });
    expect(r.residenceMortgage?.balanceAtRetirement).toBe(0);
  });

  it("continues from the recorded payments", () => {
    const paid = residenceMortgageFromLoan(
      { ...loan, startDate: "2025-01-15", currentBalance: 244000 },
      [],
      "2026-01-15",
    );
    const withPayments = residenceMortgageFromLoan(
      { ...loan, startDate: "2025-01-15", currentBalance: 244000 },
      Array.from({ length: 12 }, (_, i) => ({
        paymentDate: `2025-${String(i + 2).padStart(2, "0")}-15`.replace("2025-13", "2026-01"),
        amount: 1185.53,
        principalPortion: 500,
        interestPortion: 685.53,
        paymentType: "scheduled" as const,
      })),
      "2026-01-15",
    );
    // The projection continues after the 12 covered due dates.
    expect(withPayments.balanceSchedule[0].date).toBe("2026-02-15");
    expect(withPayments.balanceSchedule.at(-1)?.date).toBe("2050-01-15");
    // Without recorded payments, today's balance already reflects the past
    // instalments: the projection still starts at the next due date.
    expect(paid.balanceSchedule[0].date).toBe("2026-01-15");
    expect(paid.balanceSchedule.at(-1)?.date).toBe("2050-01-15");
  });

  it("does not count unrecorded past instalments against today's balance", () => {
    // Valued today at €244k, started a year ago, no payments recorded.
    const anchored = residenceMortgageFromLoan(
      { ...loan, startDate: "2025-01-15", currentBalance: 244000 },
      [],
      "2026-01-20",
    );
    // Same debt, same remaining term, but starting fresh today.
    const fresh = residenceMortgageFromLoan(
      {
        ...loan,
        startDate: "2025-01-15",
        currentBalance: 244000,
        originalPrincipal: 244000,
      },
      Array.from({ length: 12 }, (_, i) => ({
        paymentDate: `2025-${String(i + 2).padStart(2, "0")}-15`.replace("2025-13", "2026-01"),
        amount: 1185.53,
        principalPortion: 0,
        interestPortion: 1185.53,
        paymentType: "scheduled" as const,
      })),
      "2026-01-20",
    );
    expect(anchored.balanceSchedule[0].date).toBe("2026-02-15");
    expect(anchored.balanceSchedule.every((row) => row.date >= "2026-01-20")).toBe(true);
    expect(mortgageBalanceOn(anchored, "2031-01-15")).toBeCloseTo(
      mortgageBalanceOn(fresh, "2031-01-15"),
      2,
    );
    // Nothing projected yet on today's date: still today's balance.
    expect(mortgageBalanceOn(anchored, "2026-01-20")).toBe(244000);
  });

  it("normalises the next payment to monthly", () => {
    const quarterly = residenceMortgageFromLoan(
      {
        ...loan,
        currentBalance: 100000,
        originalPrincipal: 100000,
        annualInterestRate: 0.04,
        paymentFrequency: "QUARTERLY",
        scheduledPayment: 3000,
      },
      [],
      "2026-01-15",
    );
    expect(quarterly.monthlyPayment).toBeCloseTo(1000, 6);
  });

  it("does not report pensions covering everything while a mortgage remains", () => {
    const r = at(
      {
        ...owns,
        pensionSources: [{ label: "Pension", monthlyAmount: 10000, gross: false }],
      },
      base,
    );
    expect(r.gapMonthly).toBe(0);
    expect(r.targetPortfolio).toBeGreaterThan(0);
    expect(r.pensionsCoverAll).toBe(false);
    expect(r.optimistic.monthlyContribution).toBeGreaterThanOrEqual(0);
  });
});

describe("progress per scenario", () => {
  it("headline progress is the conservative scenario's (as isOnTrack)", () => {
    const r = computeRetirementResults(
      { ...baseInputs, retirementAge: 68 },
      nw(150000),
    );
    expect(r.optimistic.progressPct).toBeCloseTo(
      r.optimistic.projectedFromCurrent / r.targetPortfolio,
      10,
    );
    expect(r.conservative.progressPct).toBeLessThan(r.optimistic.progressPct);
    expect(r.progressPct).toBe(r.conservative.progressPct);
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

describe("deduction rate validation", () => {
  it("accepts unset and 0–60% rates, rejects the rest", () => {
    expect(validateRetirementInputs(baseInputs)).toEqual({});
    expect(
      validateRetirementInputs({
        ...baseInputs,
        pensionDeductionRate: 0.6,
        withdrawalTaxRate: 0,
      }),
    ).toEqual({});
    const errors = validateRetirementInputs({
      ...baseInputs,
      pensionDeductionRate: -0.1,
      withdrawalTaxRate: Number.NaN,
    });
    expect(errors.pensionDeductionRate).toMatch(/between 0% and 60%/);
    expect(errors.withdrawalTaxRate).toMatch(/between 0% and 60%/);
  });
});
