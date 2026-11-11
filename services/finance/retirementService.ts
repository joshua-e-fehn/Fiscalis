// ═══════════════════════════════════════════════════════════════
// Retirement Planner ("Rentenplaner") — pure financial math
// ═══════════════════════════════════════════════════════════════
//
// Framework-free so it can be imported by both the frontend (live wizard
// preview) and any server code via a single, unit-tested source of truth.
// All amounts are in the user's base currency (EUR). Asset growth compounds
// annually (the primitives in `financeService.ts`); savings are monthly
// deposits at the equivalent monthly rate r_m = (1 + r)^(1/12) − 1.
//
// The model (see docs/RETIREMENT_PLANNER_PLAN.md §1):
//   0. n               = years from today to (date of birth + retirementAge),
//                        fractional; whole years only without a date of birth
//   1. expenseFuture   = monthlyExpensesToday × (1 + inflation)^n
//   2. pensionFuture   = Σ net(source) × (1 + inflation)^n for indexed sources,
//                        Σ net(source) for nominal ones; net = gross × (1 − d)
//                        for a gross source (d = flat tax + health-insurance rate)
//   3. gapMonthly      = max(0, expenseFuture − pensionFuture)   (net need)
//   4. gapAnnual       = gapMonthly × 12
//   5. targetPortfolio = gapAnnual / (1 − withdrawalTax) / withdrawalRate
//                        + residence mortgage still owed at retirement
//      With withdrawalTax = 0 (default) the target is a PRE-TAX figure.
//   6. fundableNow     = Σ included asset categories + fundable property
//                        − liabilities (a primary-residence mortgage excluded)
//   7. baseReturn(r)   = value-weighted return of the included categories:
//                        growth → r, moderate → (r + inflation)/2,
//                        inflation → inflation; excluded categories don't count
//   8. projected       = max(0, fundableNow) × (1 + baseReturn)^n
//   9. remainingGap    = max(0, targetPortfolio − projected)
//  10. monthlyContribution closes remainingGap with 12·n monthly deposits
//      invested at r — flat in nominal euros, or (optional) rising with
//      inflation (growing annuity, g = inflation; the figure is the first one).
//
// A primary residence the user lives in is never funding: its equity is not in
// the net worth, and its mortgage is taken OUT of the liabilities here (when
// the liabilities contain it). The mortgage repayments are a pre-retirement
// expense paid from income (reported, not part of the savings figure); what
// the loan's own schedule still shows owed at retirement is added to the
// target, as it must then be paid off from the portfolio.
//
// Why no double-counting of inflation: pre-retirement we inflate the expense
// target and grow assets nominally; post-retirement the 4% withdrawal rate
// already bakes inflation in (≈ 7–8% return − ~2% inflation − a buffer).

import {
  calculateEndCapitalValueWithCompoundInterest,
  calculateCapitalGainDurationWithCompoundInterest,
  MS_PER_YEAR,
} from "./financeService";
import {
  addMonthsToISODate,
  getPaymentsPerYear,
  projectOutstandingPayments,
  type ScheduleLoan,
  type SchedulePayment,
} from "./loanScheduleService";

// ───────────────────────────────────────────────────────────────
// Defaults (single source of truth — also imported by convex/retirement.ts)
// ───────────────────────────────────────────────────────────────

export const DEFAULT_INFLATION_RATE = 0.02;
export const DEFAULT_WITHDRAWAL_RATE = 0.04;
/** ~7.18% — the rate at which a portfolio doubles every 10 years: 2^(1/10) − 1. */
export const DEFAULT_OPTIMISTIC_RETURN = 0.0718;
/** Slightly more conservative scenario. */
export const DEFAULT_CONSERVATIVE_RETURN = 0.05;
/**
 * Flat deduction from a GROSS pension: health and long-term care insurance
 * (KVdR/PV ≈ 11–12%) plus a typical income-tax share. €1,500 gross ≈ €1,245 net.
 */
export const DEFAULT_PENSION_DEDUCTION_RATE = 0.17;
/** Tax on portfolio withdrawals. 0 ⇒ the target is a pre-tax figure. */
export const DEFAULT_WITHDRAWAL_TAX_RATE = 0;

/** Upper bound for every rate assumption (inflation, returns, withdrawal rate). */
export const MAX_RETIREMENT_RATE = 0.2;
/** Upper bound for the pension deduction and the withdrawal tax rate. */
export const MAX_RETIREMENT_DEDUCTION_RATE = 0.6;
/** Supported age range (inclusive) for the current and the retirement age. */
export const MIN_RETIREMENT_PLAN_AGE = 0;
export const MAX_RETIREMENT_PLAN_AGE = 120;

// ───────────────────────────────────────────────────────────────
// Funding base: categories and how each one is expected to grow
// ───────────────────────────────────────────────────────────────

/**
 * How a funding category grows in a scenario with return r:
 * - growth:    r (the scenario return)
 * - moderate:  halfway between r and inflation (e.g. bonds)
 * - inflation: keeps pace with inflation, i.e. 0% real (e.g. cash, gold)
 * - exclude:   not counted at all (e.g. an emergency fund)
 */
export type FundingTreatment = "growth" | "moderate" | "inflation" | "exclude";

export const FUNDING_TREATMENT_LABELS: Record<FundingTreatment, string> = {
  growth: "Grows at the scenario return",
  moderate: "Halfway between return and inflation",
  inflation: "Keeps pace with inflation",
  exclude: "Not counted (e.g. emergency fund)",
};

export interface FundingCategoryDef {
  /** Asset category id (InvestmentCategory), or "property" for the manual equity. */
  id: string;
  label: string;
  defaultTreatment: FundingTreatment;
}

/** Funding categories in display order, with their default growth treatment. */
export const FUNDING_CATEGORIES: readonly FundingCategoryDef[] = [
  { id: "equities", label: "Equities", defaultTreatment: "growth" },
  { id: "real-estate", label: "Real estate funds", defaultTreatment: "growth" },
  { id: "crypto", label: "Crypto", defaultTreatment: "growth" },
  { id: "bonds", label: "Bonds", defaultTreatment: "moderate" },
  { id: "commodities", label: "Commodities & metals", defaultTreatment: "inflation" },
  { id: "cash", label: "Cash & savings", defaultTreatment: "inflation" },
  { id: "collectibles", label: "Collectibles", defaultTreatment: "inflation" },
  { id: "property", label: "Sellable property", defaultTreatment: "inflation" },
];

/** Funding category id of `fundableRealEstateEquity`. */
export const PROPERTY_FUNDING_CATEGORY = "property";

/** User overrides of the default treatment, by funding category id. */
export type FundingTreatments = Record<string, FundingTreatment>;

/** The treatment in effect for `category` (override, else default, else growth). */
export function fundingTreatmentFor(
  category: string,
  treatments?: FundingTreatments,
): FundingTreatment {
  return (
    treatments?.[category] ??
    FUNDING_CATEGORIES.find((c) => c.id === category)?.defaultTreatment ??
    "growth"
  );
}

/** Expected annual return of a treatment in a scenario with return `scenarioReturn`. */
export function treatmentReturn(
  treatment: Exclude<FundingTreatment, "exclude">,
  scenarioReturn: number,
  inflationRate: number,
): number {
  switch (treatment) {
    case "growth":
      return scenarioReturn;
    case "moderate":
      return (scenarioReturn + inflationRate) / 2;
    case "inflation":
      return inflationRate;
  }
}

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

export interface PensionSource {
  label: string;
  /** Monthly amount in today's money. */
  monthlyAmount: number;
  /** Gross amount (default): the flat pension deduction rate is taken off. */
  gross?: boolean;
  /**
   * Rises with inflation until retirement (default; e.g. the statutory
   * pension). false = fixed in nominal euros (e.g. many company pensions).
   */
  indexed?: boolean;
}

export interface RetirementInputs {
  /** Whole years; the display age. The horizon uses `birthDate` when given. */
  currentAge: number;
  retirementAge: number;
  /**
   * ISO date of birth. When valid, the horizon runs to the exact date of
   * birth + retirementAge years, not to retirementAge − currentAge.
   */
  birthDate?: string;
  /** Desired minimum monthly living expenses in today's money. */
  monthlyExpensesToday: number;
  /**
   * Owner-occupied home. Its equity is never funding, and the mortgage on it
   * (`primaryResidenceLoanId`) is treated as a pre-retirement expense.
   */
  ownsPrimaryResidence: boolean;
  /**
   * The tracked loan financing that home. The caller resolves it into
   * `RetirementFundingBase.primaryResidenceMortgage` (the math never reads it).
   */
  primaryResidenceLoanId?: string;
  /**
   * Sellable property value net of loans not tracked in Fiscalis (tracked loans
   * are already subtracted from net worth), counted toward retirement funding.
   */
  fundableRealEstateEquity?: number;
  /** Growth treatment per funding category (defaults: FUNDING_CATEGORIES). */
  fundingTreatments?: FundingTreatments;
  pensionSources: PensionSource[];
  /** Flat tax + health-insurance rate taken off gross pensions. */
  pensionDeductionRate?: number;
  /** Tax on withdrawals; the need is grossed up by 1 / (1 − rate). Default 0. */
  withdrawalTaxRate?: number;
  /** Raise the monthly saving with inflation (default: flat nominal amount). */
  indexContributions?: boolean;
  inflationRate: number;
  withdrawalRate: number;
  optimisticReturn: number;
  conservativeReturn: number;
}

/** A tracked mortgage on the home the user lives in. */
export interface ResidenceMortgage {
  /** Outstanding balance today. */
  balance: number;
  /** Next scheduled repayment, normalised to monthly. */
  monthlyPayment: number;
  /**
   * Balance after each due date still to come (ascending), from the loan's
   * own amortisation (loanScheduleService.projectOutstandingPayments), so
   * every loan type —
   * annuity, constant principal, bullet, interest-only — amortises correctly.
   */
  balanceSchedule: Array<{ date: string; closingBalance: number }>;
  /**
   * Whether `balance` is part of `RetirementFundingBase.totalLiabilities`.
   * Only then is it taken back out of the liabilities.
   */
  countedInLiabilities: boolean;
}

/** What the plan is funded from: today's assets per category and the debts. */
export interface RetirementFundingBase {
  /** Asset value per category id (e.g. "equities", "cash"), base currency. */
  assetsByCategory: Record<string, number>;
  /** All tracked liabilities, incl. a primary-residence mortgage. */
  totalLiabilities: number;
  /** The loan on the home the user lives in, when one is linked. */
  primaryResidenceMortgage?: ResidenceMortgage | null;
}

export interface FundingLine {
  category: string;
  label: string;
  value: number;
  treatment: FundingTreatment;
}

export interface ProjectionPoint {
  /** Years from today (0 … yearsToRetirement). */
  yearOffset: number;
  /** Age at this point (whole birthdays after the first point). */
  age: number;
  /** Portfolio value if the user saves `monthlyContribution` each month. */
  portfolioValue: number;
  /** Portfolio value from the current assets ALONE (no further saving). */
  portfolioValueNoContrib: number;
  /** Flat target line for charting. */
  targetPortfolio: number;
}

export interface ScenarioResult {
  /** Scenario return: what new savings (and "growth" assets) earn. */
  annualReturn: number;
  /** Value-weighted expected return of today's funding base. */
  baseReturn: number;
  /** Current fundable assets grown to retirement with no further saving. */
  projectedFromCurrent: number;
  /** Shortfall the contributions must close (≥ 0). */
  remainingGap: number;
  /** Required monthly saving (the first one when indexed) to hit the target. */
  monthlyContribution: number;
  /** The last monthly saving before retirement (= first unless indexed). */
  finalMonthlyContribution: number;
  /** projectedFromCurrent / target: the share current assets alone reach. */
  progressPct: number;
  /** True when current assets alone already grow past the target. */
  onTrack: boolean;
  /** Years for current assets ALONE to reach the target (null if unreachable). */
  yearsToTargetWithoutSaving: number | null;
  /** Age at which current assets alone reach the target (null if unreachable). */
  ageReachTargetWithoutSaving: number | null;
  projectionSeries: ProjectionPoint[];
}

export interface RetirementResults {
  /** Fractional years until the retirement date. */
  yearsToRetirement: number;
  /** Exact (fractional) age today. */
  currentAgeExact: number;
  /** True when the retirement date is not in the future. */
  invalidTimeline: boolean;

  /** The user's entered monthly expenses in today's money. */
  expenseTodayMonthly: number;
  expenseFutureMonthly: number;
  /** Sum of the pension amounts as entered (negative amounts count as 0). */
  pensionEnteredMonthly: number;
  /** Tax and health insurance taken off the gross sources (today's money). */
  pensionDeductionsMonthly: number;
  /** Net pensions in today's money (entered − deductions). */
  pensionTodayMonthly: number;
  /** Net pensions at the retirement date — the amount subtracted from expenseFutureMonthly. */
  pensionFutureMonthly: number;
  /** Net monthly need the portfolio must cover at retirement. */
  gapMonthly: number;
  gapAnnual: number;
  /** Tax rate the withdrawals are grossed up for (0 ⇒ pre-tax target). */
  withdrawalTaxRate: number;
  targetPortfolio: number;

  /**
   * Simplified target in today's money (today's expenses − today's net
   * pensions, no mortgage), for the explainer.
   */
  simpleTargetPortfolio: number;

  /** Every funding category with a value, and how it is treated. */
  fundingLines: FundingLine[];
  /** Assets counted toward funding (incl. fundable property). */
  includedAssets: number;
  /** Assets the user excluded (e.g. an emergency fund). */
  excludedAssets: number;
  /** Liabilities subtracted from the funding base (residence mortgage excluded). */
  liabilitiesCounted: number;
  /** The primary-residence mortgage treatment, when one applies. */
  residenceMortgage: {
    balance: number;
    monthlyPayment: number;
    /** Still owed at retirement; added to targetPortfolio. */
    balanceAtRetirement: number;
  } | null;

  /** includedAssets − liabilitiesCounted; negative when debts exceed assets. */
  fundableNow: number;
  /** max(0, fundableNow): the amount the projections grow (debt is not compounded). */
  investableNow: number;
  /** True when fundableNow < 0 — the UI shows a debt message instead of a projection. */
  hasNetDebt: boolean;
  /**
   * Headline progress: the CONSERVATIVE scenario's progressPct (the same
   * scenario isOnTrack requires). 1 when pensions cover everything, 0 when the
   * target is infinite. Never negative; may exceed 1.
   */
  progressPct: number;
  /**
   * True when a pension is fixed in nominal euros (indexed: false), so it loses
   * real value until retirement — part of why the target exceeds
   * simpleTargetPortfolio.
   */
  hasFixedPensions: boolean;
  /**
   * True when pensions already cover the inflation-adjusted expenses and no
   * residence mortgage is still owed at retirement (target ≤ 0).
   */
  pensionsCoverAll: boolean;
  /** True when the monthly saving rises with inflation. */
  contributionsIndexed: boolean;

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

/** Monthly rate equivalent to an annual rate: (1 + r)^(1/12) − 1. */
export function monthlyRateFromAnnual(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/**
 * Future value of `months` end-of-month deposits invested at `annualReturn`;
 * the first deposit is `firstPayment` and each one grows by `annualGrowth`
 * per year (both converted to monthly rates). `months` may be fractional.
 * FV = P · ((1+r)^N − (1+g)^N) / (r − g); P · N · (1+r)^(N−1) when r = g.
 */
export function futureValueOfMonthlyContributions(
  firstPayment: number,
  annualReturn: number,
  months: number,
  annualGrowth = 0,
): number {
  if (months <= 0) return 0;
  const r = monthlyRateFromAnnual(annualReturn);
  const g = monthlyRateFromAnnual(annualGrowth);
  if (Math.abs(r - g) < 1e-12) {
    return firstPayment * months * Math.pow(1 + r, months - 1);
  }
  return (
    (firstPayment * (Math.pow(1 + r, months) - Math.pow(1 + g, months))) /
    (r - g)
  );
}

/**
 * Required MONTHLY saving (the first deposit when `annualGrowth` > 0) that
 * grows to `remainingGap` by retirement: the inverse of
 * futureValueOfMonthlyContributions over 12·years months.
 */
export function requiredMonthlyContribution(
  remainingGap: number,
  years: number,
  annualReturn: number,
  annualGrowth = 0,
): number {
  if (!isFinite(remainingGap)) return Infinity;
  if (years <= 0 || remainingGap <= 0) return 0; // nothing to close / no time
  return (
    remainingGap /
    futureValueOfMonthlyContributions(1, annualReturn, years * 12, annualGrowth)
  );
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

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of a date's local calendar fields. */
function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Exact age today and fractional years until the retirement date
 * (date of birth + retirementAge years). Calendar fields only, so the result
 * doesn't depend on the timezone. Without a valid date of birth: whole years.
 */
export function retirementTimeline(
  inputs: Pick<RetirementInputs, "birthDate" | "currentAge" | "retirementAge">,
  today: Date = new Date(),
): {
  currentAgeExact: number;
  yearsToRetirement: number;
  /** `YYYY-MM-DD` the plan holder retires on. */
  retirementDate: string;
} {
  const match = inputs.birthDate ? ISO_DATE.exec(inputs.birthDate.trim()) : null;
  if (!match) {
    const years = inputs.retirementAge - inputs.currentAge;
    return {
      currentAgeExact: inputs.currentAge,
      yearsToRetirement: years,
      retirementDate: addMonthsToISODate(toISODate(today), years * 12),
    };
  }
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  // A 29 February birthday rolls over to 1 March in non-leap years.
  const retirementDate = Date.UTC(y + inputs.retirementAge, m, d);
  return {
    currentAgeExact: (now - Date.UTC(y, m, d)) / MS_PER_YEAR,
    yearsToRetirement: (retirementDate - now) / MS_PER_YEAR,
    retirementDate: new Date(retirementDate).toISOString().slice(0, 10),
  };
}

/**
 * Loan statuses the dashboard's liabilities (convex/categories.ts
 * getLiabilities) count. Keep in sync with that query.
 */
const LIABILITY_LOAN_STATUSES: ReadonlySet<string> = new Set(["active"]);

/**
 * A tracked loan as the residence-mortgage input: the repayments still to
 * come, amortised from today's balance (loanScheduleService
 * projectOutstandingPayments — due dates before `today` count as reflected in
 * `currentBalance`, never as future repayments), reduced to the projected
 * balances, and the next repayment normalised to monthly.
 */
export function residenceMortgageFromLoan(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  today: string,
): ResidenceMortgage {
  const projected = projectOutstandingPayments(loan, payments, today);
  const nextPayment = projected[0]?.payment ?? 0;
  return {
    balance: Math.max(0, loan.currentBalance),
    monthlyPayment:
      (nextPayment * getPaymentsPerYear(loan.paymentFrequency)) / 12,
    balanceSchedule: projected.map((row) => ({
      date: row.date,
      closingBalance: row.closingBalance,
    })),
    countedInLiabilities: LIABILITY_LOAN_STATUSES.has(loan.status ?? "active"),
  };
}

/**
 * Outstanding balance on `date` (`YYYY-MM-DD`): the closing balance of the
 * last projected payment due on or before it; today's balance if none is.
 */
export function mortgageBalanceOn(
  mortgage: ResidenceMortgage,
  date: string,
): number {
  let balance = mortgage.balance;
  for (const row of mortgage.balanceSchedule) {
    if (row.date > date) break;
    balance = row.closingBalance;
  }
  return Math.max(0, balance);
}

// ───────────────────────────────────────────────────────────────
// Per-scenario computation
// ───────────────────────────────────────────────────────────────

interface ScenarioContext {
  investableNow: number;
  /** Included lines only (treatment ≠ exclude). */
  includedLines: FundingLine[];
  includedAssets: number;
  targetPortfolio: number;
  years: number;
  currentAgeExact: number;
  inflationRate: number;
  contributionGrowth: number;
}

/** Value-weighted return of the included categories (scenario return if none). */
function fundingBaseReturn(
  ctx: ScenarioContext,
  annualReturn: number,
): number {
  if (ctx.includedAssets <= 0) return annualReturn;
  const weighted = ctx.includedLines.reduce(
    (sum, line) =>
      sum +
      line.value *
        treatmentReturn(
          line.treatment as Exclude<FundingTreatment, "exclude">,
          annualReturn,
          ctx.inflationRate,
        ),
    0,
  );
  return weighted / ctx.includedAssets;
}

/** Year offsets of the series: today, each following birthday, retirement. */
function seriesOffsets(years: number, currentAgeExact: number): number[] {
  if (years <= 0) return [0];
  const offsets = [0];
  const firstBirthday = Math.floor(currentAgeExact) + 1 - currentAgeExact;
  for (let t = firstBirthday; t < years - 1e-6; t += 1) offsets.push(t);
  offsets.push(years);
  return offsets;
}

function computeScenario(
  ctx: ScenarioContext,
  annualReturn: number,
): ScenarioResult {
  const { investableNow, targetPortfolio, years, contributionGrowth } = ctx;
  const baseReturn = fundingBaseReturn(ctx, annualReturn);
  const growBase = (t: number) =>
    calculateEndCapitalValueWithCompoundInterest(investableNow, baseReturn, t);

  const projectedFromCurrent = growBase(years);
  const onTrack = projectedFromCurrent >= targetPortfolio;
  const remainingGap = Math.max(0, targetPortfolio - projectedFromCurrent);
  const monthlyContribution = requiredMonthlyContribution(
    remainingGap,
    years,
    annualReturn,
    contributionGrowth,
  );
  const progressPct =
    targetPortfolio <= 0
      ? 1 // pensions already cover the expenses
      : isFinite(targetPortfolio)
        ? projectedFromCurrent / targetPortfolio
        : 0; // infinite target (withdrawal rate 0) can never be reached

  const yearsNoSaving = yearsToTargetWithoutSaving(
    investableNow,
    targetPortfolio,
    baseReturn,
  );

  // The same monthly annuity as the contribution, evaluated at each point.
  const contributing = isFinite(monthlyContribution) ? monthlyContribution : 0;
  const projectionSeries: ProjectionPoint[] = seriesOffsets(
    years,
    ctx.currentAgeExact,
  ).map((t) => {
    const grown = growBase(t);
    return {
      yearOffset: t,
      age: Math.round((ctx.currentAgeExact + t) * 10) / 10,
      portfolioValue:
        grown +
        futureValueOfMonthlyContributions(
          contributing,
          annualReturn,
          t * 12,
          contributionGrowth,
        ),
      portfolioValueNoContrib: grown,
      targetPortfolio,
    };
  });

  return {
    annualReturn,
    baseReturn,
    projectedFromCurrent,
    remainingGap,
    monthlyContribution,
    finalMonthlyContribution:
      monthlyContribution *
      Math.pow(
        1 + monthlyRateFromAnnual(contributionGrowth),
        Math.max(0, years * 12 - 1),
      ),
    progressPct,
    onTrack,
    yearsToTargetWithoutSaving: yearsNoSaving,
    ageReachTargetWithoutSaving:
      yearsNoSaving === null ? null : ctx.currentAgeExact + yearsNoSaving,
    projectionSeries,
  };
}

// ───────────────────────────────────────────────────────────────
// Top-level orchestration
// ───────────────────────────────────────────────────────────────

/** Net monthly amount of a pension source in today's money. */
export function netPensionMonthly(
  source: PensionSource,
  deductionRate: number,
): number {
  const amount = Math.max(0, source.monthlyAmount || 0);
  return source.gross === false ? amount : amount * (1 - deductionRate);
}

/** Funding lines (non-zero categories + fundable property), in display order. */
function buildFundingLines(
  inputs: RetirementInputs,
  fundingBase: RetirementFundingBase,
): FundingLine[] {
  const values: Record<string, number> = {
    ...fundingBase.assetsByCategory,
    [PROPERTY_FUNDING_CATEGORY]: inputs.fundableRealEstateEquity ?? 0,
  };
  const known = FUNDING_CATEGORIES.map((c) => c.id);
  const ids = [
    ...known,
    ...Object.keys(values).filter((id) => !known.includes(id)),
  ];
  return ids
    .filter((id) => (values[id] ?? 0) !== 0)
    .map((id) => ({
      category: id,
      label: FUNDING_CATEGORIES.find((c) => c.id === id)?.label ?? id,
      value: values[id],
      treatment: fundingTreatmentFor(id, inputs.fundingTreatments),
    }));
}

/**
 * Compute the full retirement picture from the user's inputs and their current
 * funding base (assets per category and liabilities). The funding base is
 * passed in so this stays pure — the caller fetches it from the portfolio
 * layer. `today` anchors the date-of-birth horizon.
 */
export function computeRetirementResults(
  inputs: RetirementInputs,
  fundingBase: RetirementFundingBase,
  today: Date = new Date(),
): RetirementResults {
  const timeline = retirementTimeline(inputs, today);
  const invalidTimeline = timeline.yearsToRetirement <= 0;
  const years = Math.max(0, timeline.yearsToRetirement);

  const expenseFutureMonthly = inflateToFuture(
    inputs.monthlyExpensesToday,
    inputs.inflationRate,
    years,
  );

  // Pensions are in today's money: net them, then inflate the indexed ones.
  const deductionRate =
    inputs.pensionDeductionRate ?? DEFAULT_PENSION_DEDUCTION_RATE;
  const pensionEnteredMonthly = inputs.pensionSources.reduce(
    (sum, s) => sum + Math.max(0, s.monthlyAmount || 0),
    0,
  );
  const pensionTodayMonthly = inputs.pensionSources.reduce(
    (sum, s) => sum + netPensionMonthly(s, deductionRate),
    0,
  );
  const pensionFutureMonthly = inputs.pensionSources.reduce((sum, s) => {
    const net = netPensionMonthly(s, deductionRate);
    return (
      sum +
      (s.indexed === false ? net : inflateToFuture(net, inputs.inflationRate, years))
    );
  }, 0);

  const withdrawalTaxRate =
    inputs.withdrawalTaxRate ?? DEFAULT_WITHDRAWAL_TAX_RATE;
  const grossUp = (annualNeed: number) =>
    withdrawalTaxRate < 1 ? annualNeed / (1 - withdrawalTaxRate) : Infinity;

  const gapMonthly = Math.max(0, expenseFutureMonthly - pensionFutureMonthly);
  const gapAnnual = gapMonthly * 12;

  // Primary residence: the mortgage leaves the funding base; what is still
  // owed at retirement is added to the target.
  const mortgage = inputs.ownsPrimaryResidence
    ? (fundingBase.primaryResidenceMortgage ?? null)
    : null;
  const residenceMortgage = mortgage
    ? {
        balance: mortgage.balance,
        monthlyPayment: mortgage.monthlyPayment,
        balanceAtRetirement: mortgageBalanceOn(
          mortgage,
          timeline.retirementDate,
        ),
      }
    : null;
  // Only a mortgage the liabilities contain is taken back out of them.
  const mortgageInLiabilities =
    mortgage && mortgage.countedInLiabilities
      ? Math.min(mortgage.balance, Math.max(0, fundingBase.totalLiabilities))
      : 0;

  const targetPortfolio =
    portfolioTargetFromAnnualGap(grossUp(gapAnnual), inputs.withdrawalRate) +
    (residenceMortgage?.balanceAtRetirement ?? 0);
  // Nothing left to fund: pensions cover the expenses and no mortgage remains.
  const pensionsCoverAll = gapMonthly <= 0 && targetPortfolio <= 0;

  // Simplified target in today's money (same basis on both sides) for the explainer.
  const simpleGapMonthly = Math.max(
    0,
    inputs.monthlyExpensesToday - pensionTodayMonthly,
  );
  const simpleTargetPortfolio = portfolioTargetFromAnnualGap(
    grossUp(simpleGapMonthly * 12),
    inputs.withdrawalRate,
  );

  const fundingLines = buildFundingLines(inputs, fundingBase);
  const includedLines = fundingLines.filter((l) => l.treatment !== "exclude");
  const includedAssets = includedLines.reduce((s, l) => s + l.value, 0);
  const excludedAssets = fundingLines
    .filter((l) => l.treatment === "exclude")
    .reduce((s, l) => s + l.value, 0);
  const liabilitiesCounted = Math.max(
    0,
    fundingBase.totalLiabilities - mortgageInLiabilities,
  );

  const fundableNow = includedAssets - liabilitiesCounted;
  // Debt is not an investment: never compound it at the portfolio return.
  const investableNow = Math.max(0, fundableNow);

  const contributionsIndexed = inputs.indexContributions === true;
  const ctx: ScenarioContext = {
    investableNow,
    includedLines,
    includedAssets,
    targetPortfolio,
    years,
    currentAgeExact: timeline.currentAgeExact,
    inflationRate: inputs.inflationRate,
    contributionGrowth: contributionsIndexed ? inputs.inflationRate : 0,
  };
  const optimistic = computeScenario(ctx, inputs.optimisticReturn);
  const conservative = computeScenario(ctx, inputs.conservativeReturn);

  return {
    yearsToRetirement: years,
    currentAgeExact: timeline.currentAgeExact,
    invalidTimeline,
    expenseTodayMonthly: inputs.monthlyExpensesToday,
    expenseFutureMonthly,
    pensionEnteredMonthly,
    pensionDeductionsMonthly: pensionEnteredMonthly - pensionTodayMonthly,
    pensionTodayMonthly,
    pensionFutureMonthly,
    gapMonthly,
    gapAnnual,
    withdrawalTaxRate,
    targetPortfolio,
    simpleTargetPortfolio,
    fundingLines,
    includedAssets,
    excludedAssets,
    liabilitiesCounted,
    residenceMortgage,
    fundableNow,
    investableNow,
    hasNetDebt: fundableNow < 0,
    progressPct: conservative.progressPct,
    pensionsCoverAll,
    hasFixedPensions: inputs.pensionSources.some(
      (s) => s.indexed === false && netPensionMonthly(s, deductionRate) > 0,
    ),
    contributionsIndexed,
    optimistic,
    conservative,
  };
}

/** On track only when current assets alone reach the target in BOTH scenarios. */
export function isOnTrack(
  results: Pick<RetirementResults, "optimistic" | "conservative">,
): boolean {
  return results.optimistic.onTrack && results.conservative.onTrack;
}

/** "27.1 years" / "28 years" — fractional horizons to one decimal. */
export function formatYears(years: number): string {
  const rounded = Math.round(years * 10) / 10;
  return `${rounded} ${rounded === 1 ? "year" : "years"}`;
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
  return { ...errors, ...validateRetirementDeductions(inputs) };
}

const DEDUCTION_LABELS = {
  pensionDeductionRate: "Pension tax & health insurance",
  withdrawalTaxRate: "Tax on withdrawals",
} as const;

/** Deduction rates (when set) are fractions from 0 to MAX_RETIREMENT_DEDUCTION_RATE. */
export function validateRetirementDeductions(
  inputs: Pick<RetirementInputs, keyof typeof DEDUCTION_LABELS>,
): RetirementInputErrors {
  const errors: RetirementInputErrors = {};
  const max = `${Math.round(MAX_RETIREMENT_DEDUCTION_RATE * 100)}%`;
  for (const field of Object.keys(
    DEDUCTION_LABELS,
  ) as (keyof typeof DEDUCTION_LABELS)[]) {
    const rate = inputs[field];
    if (rate !== undefined && !(rate >= 0 && rate <= MAX_RETIREMENT_DEDUCTION_RATE)) {
      errors[field] = `${DEDUCTION_LABELS[field]} must be between 0% and ${max}`;
    }
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
