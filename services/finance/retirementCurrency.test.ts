import { describe, expect, it } from "vitest";

import {
  fundingBaseIn,
  LEGACY_PLAN_CURRENCY,
  planCurrencyOf,
  retirementAmountsIn,
  type RetirementPlanAmounts,
} from "./retirementCurrency";
import {
  computeRetirementResults,
  DEFAULT_CONSERVATIVE_RETURN,
  DEFAULT_INFLATION_RATE,
  DEFAULT_OPTIMISTIC_RETURN,
  DEFAULT_WITHDRAWAL_RATE,
  residenceMortgageFromAccount,
  retirementFundingBase,
  type RetirementInputs,
} from "./retirementService";
import {
  aggregateNetWorth,
  type NormalizedHolding,
} from "../portfolio/aggregate";

// USD per EUR and CHF per EUR, non-identity on purpose
const USD_PER_EUR = 1.08;
const CHF_PER_EUR = 0.94;

const plan: RetirementPlanAmounts = {
  monthlyExpensesToday: 4000,
  fundableRealEstateEquity: 50_000,
  pensionSources: [
    { label: "State", monthlyAmount: 1234.567, gross: true },
    { label: "Company", monthlyAmount: 300, indexed: false },
  ],
};

describe("planCurrencyOf", () => {
  it("reads a stored plan's currency, EUR when absent or unknown", () => {
    expect(LEGACY_PLAN_CURRENCY).toBe("EUR");
    expect(planCurrencyOf({})).toBe("EUR");
    expect(planCurrencyOf({ currency: null })).toBe("EUR");
    expect(planCurrencyOf({ currency: "usd" })).toBe("USD");
    expect(planCurrencyOf({ currency: "GBP" })).toBe("GBP");
    expect(planCurrencyOf({ currency: "JPY" })).toBe("EUR");
  });
});

describe("retirementAmountsIn (the rebase arithmetic)", () => {
  it("leaves a plan in its own currency untouched, unrounded", () => {
    expect(retirementAmountsIn(plan, 1)).toEqual(plan);
  });

  it("scales every typed amount, rounded to cents, keeping the flags", () => {
    expect(retirementAmountsIn(plan, USD_PER_EUR)).toEqual({
      monthlyExpensesToday: 4320,
      fundableRealEstateEquity: 54_000,
      pensionSources: [
        { label: "State", monthlyAmount: 1333.33, gross: true },
        { label: "Company", monthlyAmount: 324, indexed: false },
      ],
    });
  });

  it("keeps absent optional amounts absent and scales present ones", () => {
    const out = retirementAmountsIn(
      {
        monthlyExpensesToday: 1000,
        primaryResidenceMortgagePayment: 1500,
        pensionSources: [],
      },
      CHF_PER_EUR,
    );
    expect(out).toEqual({
      monthlyExpensesToday: 940,
      primaryResidenceMortgagePayment: 1410,
      pensionSources: [],
    });
    expect("fundableRealEstateEquity" in out).toBe(false);
  });

  it("round-trips across a cross rate to within a cent", () => {
    // EUR → USD, then USD → CHF (CHF per USD), then CHF → EUR
    const usd = retirementAmountsIn(plan, USD_PER_EUR);
    const chf = retirementAmountsIn(usd, CHF_PER_EUR / USD_PER_EUR);
    const back = retirementAmountsIn(chf, 1 / CHF_PER_EUR);
    expect(back.monthlyExpensesToday).toBeCloseTo(4000, 1);
    expect(back.fundableRealEstateEquity).toBeCloseTo(50_000, 1);
    expect(back.pensionSources[0].monthlyAmount).toBeCloseTo(1234.57, 1);
  });

  it("rejects a missing or non-positive factor", () => {
    expect(() => retirementAmountsIn(plan, 0)).toThrow();
    expect(() => retirementAmountsIn(plan, -1)).toThrow();
    expect(() => retirementAmountsIn(plan, Number.NaN)).toThrow();
  });
});

describe("a plan computed in another currency", () => {
  const holding = (
    id: string,
    source: NormalizedHolding["source"],
    category: NormalizedHolding["category"],
    valueBase: number,
  ): NormalizedHolding => ({
    id,
    provider: "manual",
    source,
    category,
    subcategory: "x",
    name: id,
    valueBase,
    costBase: null,
    pricedAt: null,
  });
  // EUR net worth
  const aggregate = aggregateNetWorth([
    holding("etf", "brokerPosition", "equities", 120_000),
    holding("giro", "bank", "cash", 15_000),
    holding("car", "loan", "liabilities", 9_000),
  ]);

  const inputs: RetirementInputs = {
    currentAge: 40,
    retirementAge: 60,
    monthlyExpensesToday: 3500,
    ownsPrimaryResidence: true,
    primaryResidenceMortgageRate: 0.03,
    primaryResidenceMortgagePayment: 900,
    fundableRealEstateEquity: 20_000,
    pensionSources: [{ label: "State", monthlyAmount: 1500 }],
    inflationRate: DEFAULT_INFLATION_RATE,
    withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
    optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
    conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
  };
  const today = new Date("2026-11-14T00:00:00Z");

  /** The plan and funding base in a currency of `unitsPerEur`. */
  function resultsIn(unitsPerEur: number) {
    const plan = { ...inputs, ...retirementAmountsIn(inputs, unitsPerEur) };
    // As convex/retirement.ts loadFundingBase: the account balance in the
    // plan currency before it is amortised with the plan's repayment
    const mortgage = residenceMortgageFromAccount(
      180_000 * unitsPerEur,
      {
        annualInterestRate: plan.primaryResidenceMortgageRate,
        monthlyPayment: plan.primaryResidenceMortgagePayment,
      },
      false,
      "2026-11-14",
    );
    return computeRetirementResults(
      plan,
      fundingBaseIn(retirementFundingBase(aggregate, mortgage), unitsPerEur),
      today,
    );
  }

  it("converts the EUR funding base by the rate", () => {
    const eur = retirementFundingBase(aggregate, null);
    expect(fundingBaseIn(eur, 1)).toBe(eur);
    const base = fundingBaseIn(eur, USD_PER_EUR);
    expect(base.assetsByCategory.equities).toBeCloseTo(129_600, 6);
    expect(base.assetsByCategory.cash).toBeCloseTo(16_200, 6);
    expect(base.totalLiabilities).toBeCloseTo(9_720, 6);
  });

  it("scales every amount by the rate and keeps every ratio", () => {
    const eur = resultsIn(1);
    const usd = resultsIn(USD_PER_EUR);
    // Typed amounts are rounded to cents, so allow a relative 1e-6
    const close = (a: number, b: number) =>
      expect(Math.abs(a - b)).toBeLessThan(Math.max(1, Math.abs(b)) * 1e-6);
    close(usd.targetPortfolio, eur.targetPortfolio * USD_PER_EUR);
    close(usd.fundableNow, eur.fundableNow * USD_PER_EUR);
    close(
      usd.conservative.monthlyContribution,
      eur.conservative.monthlyContribution * USD_PER_EUR,
    );
    close(
      usd.residenceMortgage!.balanceAtRetirement,
      eur.residenceMortgage!.balanceAtRetirement * USD_PER_EUR,
    );
    expect(usd.progressPct).toBeCloseTo(eur.progressPct, 6);
    expect(usd.conservative.yearsToTargetWithoutSaving).toBeCloseTo(
      eur.conservative.yearsToTargetWithoutSaving!,
      6,
    );
  });
});
