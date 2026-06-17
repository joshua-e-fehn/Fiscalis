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
//   2. pensionMonthly  = Σ pensionSources[i].monthlyAmount
//   3. gapMonthly      = max(0, expenseFuture − pensionMonthly)
//   4. gapAnnual       = gapMonthly × 12
//   5. targetPortfolio = gapAnnual / withdrawalRate            (4% rule ⇒ × 25)
//   6. fundableNow     = netWorth + fundableRealEstateEquity
//   7. projected       = fundableNow × (1 + r)^n
//   8. remainingGap    = max(0, targetPortfolio − projected)
//   9. monthlyContribution(r) closes remainingGap by retirement
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
// Defaults (single source of truth — keep convex/retirement.ts in sync)
// ───────────────────────────────────────────────────────────────

export const DEFAULT_INFLATION_RATE = 0.02;
export const DEFAULT_WITHDRAWAL_RATE = 0.04;
/** ~7.18% — the rate at which a portfolio doubles every 10 years: 2^(1/10) − 1. */
export const DEFAULT_OPTIMISTIC_RETURN = 0.0718;
/** Slightly more conservative scenario. */
export const DEFAULT_CONSERVATIVE_RETURN = 0.05;

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

export interface PensionSource {
  label: string;
  monthlyAmount: number;
}

export interface RetirementInputs {
  currentAge: number;
  retirementAge: number;
  /** Desired minimum monthly living expenses in today's money. */
  monthlyExpensesToday: number;
  /** Owner-occupied home: excluded from the funding portfolio (cannot be sold and lived in). */
  ownsPrimaryResidence: boolean;
  /** Sellable property equity the user wants to count toward retirement funding. */
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
  pensionMonthly: number;
  gapMonthly: number;
  gapAnnual: number;
  targetPortfolio: number;

  /** Simplified target ignoring inflation (for the explainer / transparency). */
  simpleTargetPortfolio: number;

  fundableNow: number;
  /** Present value of the target discounted at the optimistic return. */
  presentValueOfTarget: number;
  /** fundableNow / presentValueOfTarget (raw; may exceed 1). */
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
  fundableNow: number,
  targetPortfolio: number,
  years: number,
  currentAge: number,
): ScenarioResult {
  const projectedFromCurrent = calculateEndCapitalValueWithCompoundInterest(
    fundableNow,
    annualReturn,
    years,
  );
  const onTrack = projectedFromCurrent >= targetPortfolio;
  const remainingGap = Math.max(0, targetPortfolio - projectedFromCurrent);
  const monthlyContribution = requiredMonthlyContribution(
    fundableNow,
    targetPortfolio,
    years,
    annualReturn,
  );

  const yearsNoSaving = yearsToTargetWithoutSaving(
    fundableNow,
    targetPortfolio,
    annualReturn,
  );

  // Year-by-year portfolio value when saving the required contribution.
  const annualContribution = monthlyContribution * 12;
  const projectionSeries: ProjectionPoint[] = [];
  const lastYear = Math.max(0, Math.round(years));
  for (let k = 0; k <= lastYear; k++) {
    const grown = calculateEndCapitalValueWithCompoundInterest(
      fundableNow,
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
  const pensionMonthly = inputs.pensionSources.reduce(
    (sum, s) => sum + (s.monthlyAmount || 0),
    0,
  );

  const gapMonthly = Math.max(0, expenseFutureMonthly - pensionMonthly);
  const gapAnnual = gapMonthly * 12;
  const targetPortfolio = portfolioTargetFromAnnualGap(
    gapAnnual,
    inputs.withdrawalRate,
  );
  const pensionsCoverAll = gapMonthly <= 0;

  // Simplified target (no pre-retirement inflation) for the explainer.
  const simpleGapMonthly = Math.max(
    0,
    inputs.monthlyExpensesToday - pensionMonthly,
  );
  const simpleTargetPortfolio = portfolioTargetFromAnnualGap(
    simpleGapMonthly * 12,
    inputs.withdrawalRate,
  );

  const fundableNow = netWorth + (inputs.fundableRealEstateEquity ?? 0);

  const presentValueOfTarget = isFinite(targetPortfolio)
    ? calculateStartCapitalValueWithCompoundInterest(
        targetPortfolio,
        inputs.optimisticReturn,
        years,
      )
    : Infinity;
  const progressPct =
    presentValueOfTarget > 0 && isFinite(presentValueOfTarget)
      ? fundableNow / presentValueOfTarget
      : fundableNow > 0
        ? 1
        : 0;

  return {
    yearsToRetirement: years,
    invalidTimeline,
    expenseTodayMonthly: inputs.monthlyExpensesToday,
    expenseFutureMonthly,
    pensionMonthly,
    gapMonthly,
    gapAnnual,
    targetPortfolio,
    simpleTargetPortfolio,
    fundableNow,
    presentValueOfTarget,
    progressPct,
    pensionsCoverAll,
    optimistic: computeScenario(
      inputs.optimisticReturn,
      fundableNow,
      targetPortfolio,
      years,
      inputs.currentAge,
    ),
    conservative: computeScenario(
      inputs.conservativeReturn,
      fundableNow,
      targetPortfolio,
      years,
      inputs.currentAge,
    ),
  };
}
