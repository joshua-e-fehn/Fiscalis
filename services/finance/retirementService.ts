// ═══════════════════════════════════════════════════════════════
// Retirement Planner ("Rentenplaner") — pure financial math
// ═══════════════════════════════════════════════════════════════
//
// Framework-free so it can be imported by both the frontend (live wizard
// preview) and any server code via a single, unit-tested source of truth.
// All amounts are in the user's base currency (EUR). All compounding is
// annual, consistent with the primitives in `financeService.ts`.
//
// The model (see docs/RETIREMENT_PLANNER_PLAN.md §1):
//   1. expenseFuture   = monthlyExpensesToday × (1 + inflation)^n
//   2. pensionFuture   = Σ pensionSources[i].monthlyAmount × (1 + inflation)^n
//   3. gapMonthly      = max(0, expenseFuture − pensionFuture)
//   4. gapAnnual       = gapMonthly × 12
//   5. targetPortfolio = gapAnnual / withdrawalRate            (4% rule ⇒ × 25)
//   6. fundableNow     = netWorth + fundableRealEstateEquity   (investable = max(0, ·))
//   7. projected       = investableNow × (1 + r)^n
//   8. remainingGap    = max(0, targetPortfolio − projected)
//   9. monthlyContribution(r) closes remainingGap by retirement
//
// Expenses AND pensions are entered in today's money (a German Renteninformation
// quotes today's value), so both are inflated to the retirement date before the
// subtraction. A negative funding base (debt) is never compounded at the
// portfolio return; growth starts from zero and the UI shows a debt message.
//
// Why no double-counting of inflation: pre-retirement we inflate the expense
// target and grow assets nominally; post-retirement the 4% withdrawal rate
// already bakes inflation in (≈ 7–8% return − ~2% inflation − a buffer).

import {
  calculateEndCapitalValueWithCompoundInterest,
  calculateStartCapitalValueWithCompoundInterest,
  calculateAnnuityPayment,
  calculateCapitalGainDurationWithCompoundInterest,
} from "./financeService";

// ───────────────────────────────────────────────────────────────
// Defaults (single source of truth — also imported by convex/retirement.ts)
// ───────────────────────────────────────────────────────────────

export const DEFAULT_INFLATION_RATE = 0.02;
export const DEFAULT_WITHDRAWAL_RATE = 0.04;
/** ~7.18% — the rate at which a portfolio doubles every 10 years: 2^(1/10) − 1. */
export const DEFAULT_OPTIMISTIC_RETURN = 0.0718;
/** Slightly more conservative scenario. */
export const DEFAULT_CONSERVATIVE_RETURN = 0.05;

/** Upper bound for every rate assumption (inflation, returns, withdrawal rate). */
export const MAX_RETIREMENT_RATE = 0.2;
/** Supported age range (inclusive) for the current and the retirement age. */
export const MIN_RETIREMENT_PLAN_AGE = 0;
export const MAX_RETIREMENT_PLAN_AGE = 120;

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

export interface PensionSource {
  label: string;
  /** Monthly amount in today's money (inflated to the retirement date). */
  monthlyAmount: number;
}

export interface RetirementInputs {
  currentAge: number;
  retirementAge: number;
  /** Desired minimum monthly living expenses in today's money. */
  monthlyExpensesToday: number;
  /** Owner-occupied home: excluded from the funding portfolio (cannot be sold and lived in). */
  ownsPrimaryResidence: boolean;
  /**
   * Sellable property value net of loans not tracked in Fiscalis (tracked loans
   * are already subtracted from net worth), counted toward retirement funding.
   */
  fundableRealEstateEquity?: number;
  pensionSources: PensionSource[];
  inflationRate: number;
  withdrawalRate: number;
  optimisticReturn: number;
  conservativeReturn: number;
}

export interface ProjectionPoint {
  /** Years from today (0 … yearsToRetirement). */
  yearOffset: number;
  age: number;
  /** Portfolio value if the user saves `monthlyContribution` each year. */
  portfolioValue: number;
  /** Portfolio value from the current assets ALONE (no further saving). */
  portfolioValueNoContrib: number;
  /** Flat target line for charting. */
  targetPortfolio: number;
}

export interface ScenarioResult {
  annualReturn: number;
  /** Current fundable assets grown to retirement with no further saving. */
  projectedFromCurrent: number;
  /** Shortfall the contributions must close (≥ 0). */
  remainingGap: number;
  /** Required monthly saving to hit the target exactly at retirement. */
  monthlyContribution: number;
  /** True when current assets alone already grow past the target. */
  onTrack: boolean;
  /** Years for current assets ALONE to reach the target (null if unreachable). */
  yearsToTargetWithoutSaving: number | null;
  /** Age at which current assets alone reach the target (null if unreachable). */
  ageReachTargetWithoutSaving: number | null;
  projectionSeries: ProjectionPoint[];
}

export interface RetirementResults {
  yearsToRetirement: number;
  /** True when retirementAge ≤ currentAge (caller should surface a validation hint). */
  invalidTimeline: boolean;

  /** The user's entered monthly expenses in today's money. */
  expenseTodayMonthly: number;
  expenseFutureMonthly: number;
  /** Sum of the pension sources in today's money (negative amounts count as 0). */
  pensionTodayMonthly: number;
  /** Pensions inflated to the retirement date — the amount subtracted from expenseFutureMonthly. */
  pensionFutureMonthly: number;
  gapMonthly: number;
  gapAnnual: number;
  targetPortfolio: number;

  /**
   * Simplified target in today's money (today's expenses − today's pensions),
   * for the explainer. targetPortfolio = simpleTargetPortfolio × (1 + inflation)^n.
   */
  simpleTargetPortfolio: number;

  /**
   * Net worth + sellable property value net of loans not tracked in Fiscalis;
   * negative when debts exceed assets.
   */
  fundableNow: number;
  /** max(0, fundableNow): the amount the projections grow (debt is not compounded). */
  investableNow: number;
  /** True when fundableNow < 0 — the UI shows a debt message instead of a projection. */
  hasNetDebt: boolean;
  /** Present value of the target discounted at the optimistic return. */
  presentValueOfTarget: number;
  /**
   * investableNow / presentValueOfTarget. 1 when pensions cover everything
   * (target 0), 0 when the target is infinite. Never negative; may exceed 1.
   */
  progressPct: number;
  /** True when pensions already cover the inflation-adjusted expenses. */
  pensionsCoverAll: boolean;

  optimistic: ScenarioResult;
  conservative: ScenarioResult;
}

// ───────────────────────────────────────────────────────────────
// Small, named helpers (each reuses a financeService primitive)
// ───────────────────────────────────────────────────────────────

/** Grow a present amount to its inflated future value. */
export function inflateToFuture(
  amountToday: number,
  inflationRate: number,
  years: number,
): number {
  return calculateEndCapitalValueWithCompoundInterest(
    amountToday,
    inflationRate,
    years,
  );
}

/** Portfolio needed to fund `annualGap` under the safe-withdrawal (4%) rule. */
export function portfolioTargetFromAnnualGap(
  annualGap: number,
  withdrawalRate: number = DEFAULT_WITHDRAWAL_RATE,
): number {
  if (annualGap <= 0) return 0;
  if (withdrawalRate <= 0) return Infinity;
  return annualGap / withdrawalRate;
}

/** Future value of `annualContribution` saved for `years` at annual `rate`. */
function futureValueOfAnnuity(
  annualContribution: number,
  rate: number,
  years: number,
): number {
  if (years <= 0) return 0;
  if (rate === 0) return annualContribution * years;
  return (annualContribution * (Math.pow(1 + rate, years) - 1)) / rate;
}

/**
 * Required MONTHLY saving so that current assets (grown at `rate`) plus the
 * future value of the contributions equal `targetPortfolio` at retirement.
 *
 * Sinking-fund payment: discount the shortfall to a present value, then amortise
 * it with the PMT formula — `calculateAnnuityPayment(PV(gap), r, n)` resolves to
 * `gap · r / ((1+r)^n − 1)`, the exact future-value-of-annuity contribution.
 */
export function requiredMonthlyContribution(
  currentFundable: number,
  targetPortfolio: number,
  years: number,
  annualReturn: number,
): number {
  if (!isFinite(targetPortfolio)) return Infinity;
  if (years <= 0) return 0; // no time left to contribute over
  const projected = calculateEndCapitalValueWithCompoundInterest(
    currentFundable,
    annualReturn,
    years,
  );
  const gap = targetPortfolio - projected;
  if (gap <= 0) return 0;

  const presentValueOfGap = calculateStartCapitalValueWithCompoundInterest(
    gap,
    annualReturn,
    years,
  );
  const annualContribution = calculateAnnuityPayment(
    presentValueOfGap,
    annualReturn,
    years,
  );
  return annualContribution / 12;
}

/**
 * Years for current assets ALONE (no further saving) to reach the target.
 * Returns null when unreachable (target infinite, or non-positive growth that
 * never catches up).
 */
export function yearsToTargetWithoutSaving(
  currentFundable: number,
  targetPortfolio: number,
  annualReturn: number,
): number | null {
  if (!isFinite(targetPortfolio)) return null;
  if (currentFundable >= targetPortfolio) return 0;
  if (currentFundable <= 0 || annualReturn <= 0) return null;
  return calculateCapitalGainDurationWithCompoundInterest(
    currentFundable,
    targetPortfolio,
    annualReturn,
  );
}

// ───────────────────────────────────────────────────────────────
// Per-scenario computation
// ───────────────────────────────────────────────────────────────

function computeScenario(
  annualReturn: number,
  investableNow: number,
  targetPortfolio: number,
  years: number,
  currentAge: number,
): ScenarioResult {
  const projectedFromCurrent = calculateEndCapitalValueWithCompoundInterest(
    investableNow,
    annualReturn,
    years,
  );
  const onTrack = projectedFromCurrent >= targetPortfolio;
  const remainingGap = Math.max(0, targetPortfolio - projectedFromCurrent);
  const monthlyContribution = requiredMonthlyContribution(
    investableNow,
    targetPortfolio,
    years,
    annualReturn,
  );

  const yearsNoSaving = yearsToTargetWithoutSaving(
    investableNow,
    targetPortfolio,
    annualReturn,
  );

  // Year-by-year portfolio value when saving the required contribution.
  const annualContribution = monthlyContribution * 12;
  const projectionSeries: ProjectionPoint[] = [];
  const lastYear = Math.max(0, Math.round(years));
  for (let k = 0; k <= lastYear; k++) {
    const grown = calculateEndCapitalValueWithCompoundInterest(
      investableNow,
      annualReturn,
      k,
    );
    const contributed = futureValueOfAnnuity(annualContribution, annualReturn, k);
    projectionSeries.push({
      yearOffset: k,
      age: currentAge + k,
      portfolioValue: grown + contributed,
      portfolioValueNoContrib: grown,
      targetPortfolio,
    });
  }

  return {
    annualReturn,
    projectedFromCurrent,
    remainingGap,
    monthlyContribution,
    onTrack,
    yearsToTargetWithoutSaving: yearsNoSaving,
    ageReachTargetWithoutSaving:
      yearsNoSaving === null ? null : currentAge + yearsNoSaving,
    projectionSeries,
  };
}

// ───────────────────────────────────────────────────────────────
// Top-level orchestration
// ───────────────────────────────────────────────────────────────

/**
 * Compute the full retirement picture from the user's inputs and their current
 * net worth (the funding basis). `netWorth` is passed in so this stays pure —
 * the caller fetches it from the portfolio layer.
 */
export function computeRetirementResults(
  inputs: RetirementInputs,
  netWorth: number,
): RetirementResults {
  const rawYears = inputs.retirementAge - inputs.currentAge;
  const invalidTimeline = rawYears <= 0;
  const years = Math.max(0, rawYears);

  const expenseFutureMonthly = inflateToFuture(
    inputs.monthlyExpensesToday,
    inputs.inflationRate,
    years,
  );
  // Pensions are in today's money, like expenses: inflate them the same way.
  const pensionTodayMonthly = inputs.pensionSources.reduce(
    (sum, s) => sum + Math.max(0, s.monthlyAmount || 0),
    0,
  );
  const pensionFutureMonthly = inflateToFuture(
    pensionTodayMonthly,
    inputs.inflationRate,
    years,
  );

  const gapMonthly = Math.max(0, expenseFutureMonthly - pensionFutureMonthly);
  const gapAnnual = gapMonthly * 12;
  const targetPortfolio = portfolioTargetFromAnnualGap(
    gapAnnual,
    inputs.withdrawalRate,
  );
  const pensionsCoverAll = gapMonthly <= 0;

  // Simplified target in today's money (same basis on both sides) for the explainer.
  const simpleGapMonthly = Math.max(
    0,
    inputs.monthlyExpensesToday - pensionTodayMonthly,
  );
  const simpleTargetPortfolio = portfolioTargetFromAnnualGap(
    simpleGapMonthly * 12,
    inputs.withdrawalRate,
  );

  const fundableNow = netWorth + (inputs.fundableRealEstateEquity ?? 0);
  // Debt is not an investment: never compound it at the portfolio return.
  const investableNow = Math.max(0, fundableNow);

  const presentValueOfTarget = isFinite(targetPortfolio)
    ? calculateStartCapitalValueWithCompoundInterest(
        targetPortfolio,
        inputs.optimisticReturn,
        years,
      )
    : Infinity;
  const progressPct =
    targetPortfolio <= 0
      ? 1 // pensions already cover the expenses
      : isFinite(presentValueOfTarget)
        ? investableNow / presentValueOfTarget
        : 0; // infinite target (withdrawal rate 0) can never be reached

  return {
    yearsToRetirement: years,
    invalidTimeline,
    expenseTodayMonthly: inputs.monthlyExpensesToday,
    expenseFutureMonthly,
    pensionTodayMonthly,
    pensionFutureMonthly,
    gapMonthly,
    gapAnnual,
    targetPortfolio,
    simpleTargetPortfolio,
    fundableNow,
    investableNow,
    hasNetDebt: fundableNow < 0,
    presentValueOfTarget,
    progressPct,
    pensionsCoverAll,
    optimistic: computeScenario(
      inputs.optimisticReturn,
      investableNow,
      targetPortfolio,
      years,
      inputs.currentAge,
    ),
    conservative: computeScenario(
      inputs.conservativeReturn,
      investableNow,
      targetPortfolio,
      years,
      inputs.currentAge,
    ),
  };
}

/** On track only when current assets alone reach the target in BOTH scenarios. */
export function isOnTrack(
  results: Pick<RetirementResults, "optimistic" | "conservative">,
): boolean {
  return results.optimistic.onTrack && results.conservative.onTrack;
}

// ───────────────────────────────────────────────────────────────
// Input validation (shared by the wizard UI and convex/retirement.ts)
// ───────────────────────────────────────────────────────────────

/** Field → user-facing error message. An empty object means the input is valid. */
export type RetirementInputErrors = Partial<
  Record<keyof RetirementInputs, string>
>;

export type RetirementAssumptionField =
  | "inflationRate"
  | "withdrawalRate"
  | "optimisticReturn"
  | "conservativeReturn";

export type RetirementAssumptions = Pick<
  RetirementInputs,
  RetirementAssumptionField
>;

const ASSUMPTION_LABELS: Record<RetirementAssumptionField, string> = {
  optimisticReturn: "Expected return",
  conservativeReturn: "Conservative return",
  inflationRate: "Inflation rate",
  withdrawalRate: "Withdrawal rate",
};

const MAX_RATE_LABEL = `${Math.round(MAX_RETIREMENT_RATE * 100)}%`;

function isNonNegativeAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0;
}

function isSupportedAge(age: number): boolean {
  return (
    Number.isInteger(age) &&
    age >= MIN_RETIREMENT_PLAN_AGE &&
    age <= MAX_RETIREMENT_PLAN_AGE
  );
}

/**
 * Ages must be whole numbers in the supported range. With `requireValidTimeline`
 * (default) the retirement age must also be after the current age — drafts
 * saved mid-wizard may skip that check.
 */
export function validateRetirementAges(
  ages: Pick<RetirementInputs, "currentAge" | "retirementAge">,
  { requireValidTimeline = true }: { requireValidTimeline?: boolean } = {},
): RetirementInputErrors {
  const errors: RetirementInputErrors = {};
  const range = `a whole number between ${MIN_RETIREMENT_PLAN_AGE} and ${MAX_RETIREMENT_PLAN_AGE}`;
  if (!isSupportedAge(ages.currentAge)) {
    errors.currentAge = `Current age must be ${range}`;
  }
  if (!isSupportedAge(ages.retirementAge)) {
    errors.retirementAge = `Retirement age must be ${range}`;
  } else if (
    requireValidTimeline &&
    !errors.currentAge &&
    ages.retirementAge <= ages.currentAge
  ) {
    errors.retirementAge = "Retirement age must be after your current age";
  }
  return errors;
}

/**
 * Rates are fractions (0.04 = 4%) between 0 and MAX_RETIREMENT_RATE. The
 * withdrawal rate must be above 0 (0% ⇒ infinite target), and the conservative
 * return may not exceed the expected one.
 */
export function validateRetirementAssumptions(
  assumptions: RetirementAssumptions,
): Partial<Record<RetirementAssumptionField, string>> {
  const errors: Partial<Record<RetirementAssumptionField, string>> = {};
  for (const field of Object.keys(
    ASSUMPTION_LABELS,
  ) as RetirementAssumptionField[]) {
    const rate = assumptions[field];
    const label = ASSUMPTION_LABELS[field];
    if (field === "withdrawalRate") {
      if (!(rate > 0 && rate <= MAX_RETIREMENT_RATE)) {
        errors[field] = `${label} must be above 0% and at most ${MAX_RATE_LABEL}`;
      }
    } else if (!(rate >= 0 && rate <= MAX_RETIREMENT_RATE)) {
      errors[field] = `${label} must be between 0% and ${MAX_RATE_LABEL}`;
    }
  }
  if (
    !errors.optimisticReturn &&
    !errors.conservativeReturn &&
    assumptions.conservativeReturn > assumptions.optimisticReturn
  ) {
    errors.conservativeReturn =
      "Conservative return can't be higher than the expected return";
  }
  return errors;
}

/** Pension amounts must be finite and zero or more. */
export function validatePensionSources(
  sources: PensionSource[],
): RetirementInputErrors {
  return sources.every((s) => isNonNegativeAmount(s.monthlyAmount))
    ? {}
    : { pensionSources: "Pension amounts must be zero or more" };
}

/**
 * Validate a set of inputs (ages, amounts, pensions, assumptions).
 * `requireValidTimeline` (default) means "complete plan": retirement must be
 * after the current age and monthly expenses above zero. Drafts saved
 * mid-wizard pass false.
 */
export function validateRetirementInputs(
  inputs: RetirementInputs,
  options?: { requireValidTimeline?: boolean },
): RetirementInputErrors {
  const { requireValidTimeline = true } = options ?? {};
  const errors: RetirementInputErrors = {
    ...validateRetirementAges(inputs, { requireValidTimeline }),
    ...validatePensionSources(inputs.pensionSources),
    ...validateRetirementAssumptions(inputs),
  };
  if (!isNonNegativeAmount(inputs.monthlyExpensesToday)) {
    errors.monthlyExpensesToday = "Monthly expenses must be zero or more";
  } else if (requireValidTimeline && !(inputs.monthlyExpensesToday > 0)) {
    errors.monthlyExpensesToday = "Monthly expenses must be more than zero";
  }
  if (!isNonNegativeAmount(inputs.fundableRealEstateEquity ?? 0)) {
    errors.fundableRealEstateEquity = "Property value must be zero or more";
  }
  return errors;
}

/** Cross-field rules report on the partner field: checking the key checks it too. */
const CROSS_FIELD_PARTNERS: Partial<
  Record<keyof RetirementInputs, keyof RetirementInputs>
> = {
  currentAge: "retirementAge",
  optimisticReturn: "conservativeReturn",
};

/**
 * The first validation error among `fields` (every field when omitted), incl.
 * a cross-field error they cause on a partner field. Drafts check only the
 * fields being saved, so a value stored under older, looser rules can't block
 * the rest of the wizard.
 */
export function firstRetirementInputError(
  inputs: RetirementInputs,
  {
    fields,
    requireValidTimeline,
  }: {
    fields?: (keyof RetirementInputs)[];
    requireValidTimeline?: boolean;
  } = {},
): string | undefined {
  const errors = validateRetirementInputs(inputs, { requireValidTimeline });
  const checked =
    fields?.flatMap((f) => {
      const partner = CROSS_FIELD_PARTNERS[f];
      return partner ? [f, partner] : [f];
    }) ?? (Object.keys(errors) as (keyof RetirementInputs)[]);
  return checked.map((f) => errors[f]).find(Boolean);
}

/** Why a plan's results can't be shown: a short title and explanation. */
export interface RetirementPlanProblem {
  title: string;
  body: string;
}

/**
 * Why a plan needs review instead of showing results — an invalid timeline,
 * then the first invalid assumption (a plan saved before validation existed can
 * still carry e.g. a 0% withdrawal rate) — or null if there is none.
 */
export function retirementPlanProblem(
  results: Pick<RetirementResults, "invalidTimeline">,
  assumptions?: RetirementAssumptions,
): RetirementPlanProblem | null {
  if (results.invalidTimeline) {
    return {
      title: "Check your retirement age",
      body: "Your retirement age needs to be later than your current age to build a plan.",
    };
  }
  const [assumptionError] = assumptions
    ? Object.values(validateRetirementAssumptions(assumptions))
    : [];
  return assumptionError
    ? { title: "Check your assumptions", body: `${assumptionError}.` }
    : null;
}
