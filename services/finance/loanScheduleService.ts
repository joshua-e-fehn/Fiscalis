// ═══════════════════════════════════════════════════════════════
// Loan engine — the one amortisation model for every loan view
// ═══════════════════════════════════════════════════════════════
//
// Framework-free so the loan calculator, the loan detail page (Overview,
// Payments & Schedule, What-If) and the Convex loan mutations share one
// definition of the schedule. Dates are calendar-only `YYYY-MM-DD` strings;
// no timezone-sensitive `Date` arithmetic.
//
// The model:
//   1. Due dates are D_k = startDate + k payment periods (k = 1..totalPeriods),
//      anchored to the start date so month ends don't drift.
//   2. Regular payments (scheduled/late/partial/final) cover D_1, D_2, … in
//      payment-date order, whatever day they were actually paid on. Partial
//      payments share one due date until they add up to that due date's
//      scheduled amount. Extra payments (additional_principal/prepayment) only
//      reduce principal.
//   3. Balances of recorded rows are walked forward from the balance before
//      the first payment (loan.currentBalance + principal repaid since). When
//      that exceeds originalPrincipal the history is flagged as inconsistent
//      rather than clamped.
//   4. The projection (`amortize`) starts at the first uncovered due date and
//      applies the loan type's rule each period:
//        ANNUITY             fixed payment (the stored scheduledPayment)
//        CONSTANT_PRINCIPAL  originalPrincipal / totalPeriods + interest
//        BULLET              interest only, principal at the final period
//        INTEREST_ONLY_THEN  interest only for gracePeriods, then an annuity
//                            fixed once over the remaining periods
//      The final period settles whatever balance is left (no residual).
//   5. Prepayments (a recurring extra per period and one-time amounts) are
//      capped by maxAnnualPrepaymentRate × originalPrincipal per calendar year,
//      cost prepaymentPenaltyRate × amount, and either shorten the term
//      (reduce_term, the default) or lower the regular payment
//      (reduce_payment) for every loan type.

import { calculateAnnuityPayment, roundMoney } from "./financeService";

// ───────────────────────────────────────────────────────────────
// Enums (declared once; Convex validators and the app derive from these)
// ───────────────────────────────────────────────────────────────

/**
 * - ANNUITY: constant payment (most common)
 * - CONSTANT_PRINCIPAL: declining payments (Tilgungsdarlehen)
 * - BULLET: interest only, principal at the end (Endfälliges Darlehen)
 * - INTEREST_ONLY_THEN: interest-only grace periods, then an annuity
 */
export const LOAN_TYPES = [
  "ANNUITY",
  "CONSTANT_PRINCIPAL",
  "BULLET",
  "INTEREST_ONLY_THEN",
] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

export const LOAN_PAYMENT_FREQUENCIES = [
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
] as const;
export type LoanPaymentFrequency = (typeof LOAN_PAYMENT_FREQUENCIES)[number];

export const LOAN_STATUSES = [
  "active",
  "paid_off",
  "defaulted",
  "refinanced",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const LOAN_PAYMENT_TYPES = [
  "scheduled",
  "additional_principal",
  "prepayment",
  "final",
  "partial",
  "late",
] as const;
export type LoanPaymentType = (typeof LOAN_PAYMENT_TYPES)[number];

/** What a prepayment does to the rest of the schedule. */
export const PREPAYMENT_EFFECTS = ["reduce_term", "reduce_payment"] as const;
export type PrepaymentEffect = (typeof PREPAYMENT_EFFECTS)[number];

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

/** Contract terms of a loan (a structural subset of the stored loan). */
export interface LoanTerms {
  loanType: LoanType;
  originalPrincipal: number;
  /** Annual rate as decimal (0.025 = 2.5%). */
  annualInterestRate: number;
  termMonths: number;
  paymentFrequency: LoanPaymentFrequency;
  /** `YYYY-MM-DD`; the first payment is due one period later. */
  startDate: string;
  /** INTEREST_ONLY_THEN: number of leading interest-only periods. */
  gracePeriods?: number;
  /** Max prepayment per calendar year as a share of originalPrincipal. */
  maxAnnualPrepaymentRate?: number;
  /** Penalty charged on each prepaid amount (0.01 = 1%). */
  prepaymentPenaltyRate?: number;
}

/** The loan fields the schedule needs (a structural subset of the stored loan). */
export interface ScheduleLoan extends LoanTerms {
  currentBalance: number;
  /**
   * The agreed regular payment. ANNUITY projects with it; for
   * INTEREST_ONLY_THEN it is the post-grace payment (informational); for
   * CONSTANT_PRINCIPAL and BULLET it is the first period's payment.
   */
  scheduledPayment: number;
  status?: string;
  actualEndDate?: string;
}

/** A recorded payment (a structural subset of the stored payment). */
export interface SchedulePayment {
  _id?: string;
  /** `YYYY-MM-DD` the payment was actually made. */
  paymentDate: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  paymentType: LoanPaymentType;
  /** Tie-breaker for payments made on the same day. */
  createdAt?: number;
}

/** A one-time prepayment on a calendar date. */
export interface DatedPrepayment {
  date: string;
  amount: number;
}

export type LoanScheduleRowStatus = "paid" | "extra" | "scheduled";

export interface LoanScheduleRow {
  /** 1-based position in the schedule. */
  period: number;
  /** Paid date for recorded rows, due date for projected rows. */
  date: string;
  /** Due date this row covers; undefined for extra payments. */
  dueDate?: string;
  openingBalance: number;
  payment: number;
  principal: number;
  interest: number;
  closingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
  status: LoanScheduleRowStatus;
  /** Projected row whose due date has passed without a covering payment. */
  overdue: boolean;
  paymentId?: string;
  paymentType?: LoanPaymentType;
}

/** One projected period. */
export interface ProjectedRow {
  /** Due-date index k (D_k = startDate + k periods). */
  period: number;
  dueDate: string;
  openingBalance: number;
  interest: number;
  /** Principal of the regular payment. */
  principal: number;
  /** Regular payment: principal + interest. */
  payment: number;
  /** Extra principal paid in this period (recurring + one-time, after the cap). */
  prepayment: number;
  /** Penalty charged on this period's prepayment. */
  penalty: number;
  closingBalance: number;
  overdue: boolean;
}

export interface LoanProjection {
  rows: ProjectedRow[];
  /** Prepayments dated before the first projected period, taken off the opening balance. */
  initialPrepayment: number;
  totalInterest: number;
  /** Regular principal plus prepayments (equals the opening balance). */
  totalPrincipal: number;
  /** Sum of the regular payments (principal + interest). */
  totalPayments: number;
  totalPrepayments: number;
  totalPenalty: number;
  /** Requested prepayments dropped by maxAnnualPrepaymentRate. */
  prepaymentsCapped: number;
  /**
   * The regular payment did not cover a period's interest (an ANNUITY whose
   * stored payment is too low): those periods are interest-only and the
   * balance is settled at the final period.
   */
  paymentBelowInterest: boolean;
  /**
   * The final row repays more than one regular payment's worth beyond the
   * regular principal: a fixed ANNUITY / INTEREST_ONLY_THEN payment too small
   * to amortise within the term. The balance left for that final row; 0 when
   * the payment amortises.
   */
  finalBalloon: number;
  /** Due date of the last row, null when nothing is left to pay. */
  payoffDate: string | null;
}

// ───────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────

/** A balance at or below this is treated as fully repaid. */
const PAID_OFF_THRESHOLD = 0.01;

/** Upper bound on projected rows, guarding against corrupt term data. */
const MAX_PROJECTED_PERIODS = 1200;

// ───────────────────────────────────────────────────────────────
// Period & date helpers
// ───────────────────────────────────────────────────────────────

export function getPaymentsPerYear(frequency: LoanPaymentFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "SEMI_ANNUAL":
      return 2;
    case "ANNUAL":
      return 1;
  }
}

export function getMonthsPerPeriod(frequency: LoanPaymentFrequency): number {
  return 12 / getPaymentsPerYear(frequency);
}

/** Number of payment periods in the loan term. */
export function getTotalPeriods(
  termMonths: number,
  frequency: LoanPaymentFrequency,
): number {
  return Math.round(termMonths / getMonthsPerPeriod(frequency));
}

function getPeriodicRate(
  annualInterestRate: number,
  frequency: LoanPaymentFrequency,
): number {
  return annualInterestRate / getPaymentsPerYear(frequency);
}

/**
 * Interest-only periods of a loan: gracePeriods for INTEREST_ONLY_THEN
 * (0 when not set, at most one period short of the term), 0 for every other
 * type. The one rule shared by the calculator and the tracker.
 */
export function resolveGracePeriods(
  terms: Pick<
    LoanTerms,
    "loanType" | "gracePeriods" | "termMonths" | "paymentFrequency"
  >,
): number {
  if (terms.loanType !== "INTEREST_ONLY_THEN") return 0;
  const totalPeriods = getTotalPeriods(
    terms.termMonths,
    terms.paymentFrequency,
  );
  const grace = Math.round(terms.gracePeriods ?? 0);
  return Math.min(Math.max(0, grace), Math.max(0, totalPeriods - 1));
}

/** [year, zero-based month, day] of a `YYYY-MM-DD` (or other parseable) date. */
function parseCalendarDate(isoDate: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (match) {
    return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  }
  const parsed = new Date(isoDate);
  return [parsed.getFullYear(), parsed.getMonth(), parsed.getDate()];
}

/**
 * Add calendar months to a `YYYY-MM-DD` date, clamping to the end of the
 * target month (Jan 31 + 1 month → Feb 28/29).
 */
export function addMonthsToISODate(isoDate: string, months: number): string {
  const [year, month, day] = parseCalendarDate(isoDate);
  const monthIndex = year * 12 + month + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12;
  const daysInMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, daysInMonth))}`;
}

/** Whole calendar months from one `YYYY-MM-DD` date to a later one (≥ 0). */
export function monthsBetweenISODates(from: string, to: string): number {
  const [fy, fm, fd] = parseCalendarDate(from);
  const [ty, tm, td] = parseCalendarDate(to);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

/**
 * Due date D_k of a loan: startDate + k periods (D_0 = startDate). Computed
 * from the start date (not by chaining) so month-end anchors don't drift.
 */
export function getDueDate(
  loan: Pick<LoanTerms, "startDate" | "paymentFrequency">,
  k: number,
): string {
  return addMonthsToISODate(
    loan.startDate,
    k * getMonthsPerPeriod(loan.paymentFrequency),
  );
}

// ───────────────────────────────────────────────────────────────
// Balance helpers & payment classification
// ───────────────────────────────────────────────────────────────

/** Extra payments reduce principal without covering a due date. */
export function isExtraPaymentType(paymentType: LoanPaymentType): boolean {
  return paymentType === "additional_principal" || paymentType === "prepayment";
}

function isLoanPaidOff(
  loan: Pick<ScheduleLoan, "currentBalance" | "status">,
): boolean {
  return (
    loan.status === "paid_off" || loan.currentBalance <= PAID_OFF_THRESHOLD
  );
}

/** Rounds a balance to cents and snaps anything at or below the threshold to 0. */
export function settleLoanBalance(balance: number): number {
  const rounded = roundMoney(Math.max(0, balance));
  return rounded <= PAID_OFF_THRESHOLD ? 0 : rounded;
}

/** Principal can never exceed what is still owed. */
export function capPrincipalPortion(
  balanceBefore: number,
  principal: number,
): number {
  return roundMoney(
    Math.min(Math.max(0, principal), Math.max(0, balanceBefore)),
  );
}

function sortByPaymentDate<T extends SchedulePayment>(payments: T[]): T[] {
  return [...payments].sort((a, b) => {
    if (a.paymentDate !== b.paymentDate) {
      return a.paymentDate < b.paymentDate ? -1 : 1;
    }
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

// ───────────────────────────────────────────────────────────────
// Payment split
// ───────────────────────────────────────────────────────────────

/** What a payment is split on (see {@link paymentSplitBasis}). */
export interface LoanSplitBasis {
  /** Balance owed just before the payment. */
  balance: number;
  annualInterestRate: number;
  paymentFrequency: LoanPaymentFrequency;
  /**
   * A due date already partly paid by earlier partial payments: its period
   * interest is charged on its opening balance, minus the interest those
   * payments already booked, so it is charged only once.
   */
  openPeriod?: OpenPeriod | null;
}

/** A due date partly paid by partial payments. */
export interface OpenPeriod {
  /** Balance owed before the first partial payment of that due date. */
  openingBalance: number;
  /** Interest the partial payments of that due date already booked. */
  interestBooked: number;
}

export interface LoanPaymentSplit {
  principalPortion: number;
  interestPortion: number;
  feesPortion: number;
  /**
   * Part of the amount the loan could not absorb because principal is capped
   * at the balance. The stored amount is reduced by it, so that
   * amount = principal + interest + fees always holds.
   */
  overpayment: number;
  /** principal + interest + fees. */
  amount: number;
}

/**
 * Split a payment into fees, interest and principal, so that
 * amount = principal + interest + fees.
 *
 * - Fees come first (an entered fee, at most the amount).
 * - An entered principal (or, failing that, an entered interest) is kept and
 *   the other portion is the rest of the amount: the amount wins over an
 *   entered pair that doesn't add up.
 * - Without entered portions, extra payments go entirely to principal and
 *   regular ones pay one period of interest on `balance`, the balance the
 *   payment applies to (see {@link paymentSplitBasis}). When partial
 *   payments already booked part of that period's interest, only the rest
 *   is charged.
 * - Principal is capped at `balance`; what the loan can't absorb is reported
 *   as `overpayment` and left out of the amount.
 */
export function splitLoanPayment(
  basis: LoanSplitBasis,
  amount: number,
  paymentType: LoanPaymentType,
  entered: { principal?: number; interest?: number; fees?: number } = {},
): LoanPaymentSplit {
  const finite = (x: number | undefined): x is number =>
    x !== undefined && Number.isFinite(x);
  const clamp = (x: number, max: number) =>
    roundMoney(Math.min(Math.max(0, x), Math.max(0, max)));

  const total = roundMoney(Math.max(0, amount));
  const fees = finite(entered.fees) ? clamp(entered.fees, total) : 0;
  const rest = roundMoney(total - fees);

  let principal: number;
  if (finite(entered.principal)) {
    principal = clamp(entered.principal, rest);
  } else if (finite(entered.interest)) {
    principal = roundMoney(rest - clamp(entered.interest, rest));
  } else if (isExtraPaymentType(paymentType)) {
    principal = rest;
  } else {
    const open = basis.openPeriod;
    const periodInterest = roundMoney(
      Math.max(0, open ? open.openingBalance : basis.balance) *
        getPeriodicRate(basis.annualInterestRate, basis.paymentFrequency),
    );
    const interestDue = roundMoney(
      Math.max(0, periodInterest - (open?.interestBooked ?? 0)),
    );
    principal = roundMoney(rest - Math.min(interestDue, rest));
  }
  const interest = roundMoney(rest - principal);

  const principalPortion = capPrincipalPortion(basis.balance, principal);
  const overpayment = roundMoney(principal - principalPortion);
  return {
    principalPortion,
    interestPortion: interest,
    feesPortion: fees,
    overpayment,
    amount: roundMoney(total - overpayment),
  };
}

// ───────────────────────────────────────────────────────────────
// Projection engine
// ───────────────────────────────────────────────────────────────

/** Everything `amortize` needs to project a loan from one period onwards. */
interface AmortizationPlan {
  terms: LoanTerms;
  /** Rate used for the projection (a What-If may override the contract). */
  annualInterestRate: number;
  /** First due-date index to project. */
  fromPeriod: number;
  /** Balance owed just before D_fromPeriod. */
  openingBalance: number;
  /** ANNUITY: the agreed payment; derived over the remaining periods when absent. */
  annuityPayment?: number;
  extraPerPeriod?: number;
  /** First due date the recurring extra applies to. */
  extraPerPeriodFrom?: string;
  prepayments?: DatedPrepayment[];
  prepaymentEffect?: PrepaymentEffect;
  /** `YYYY-MM-DD` used to flag overdue rows. */
  today?: string;
  /** Stop after this many rows (the next payment only needs one). */
  maxRows?: number;
}

/** Caps prepayments by maxAnnualPrepaymentRate per calendar year. */
function createPrepaymentCap(terms: LoanTerms) {
  const rate = terms.maxAnnualPrepaymentRate;
  const maxPerYear =
    rate !== undefined && rate > 0
      ? roundMoney(terms.originalPrincipal * rate)
      : Infinity;
  const usedByYear = new Map<string, number>();
  return (isoDate: string, requested: number): number => {
    const year = isoDate.slice(0, 4);
    const used = usedByYear.get(year) ?? 0;
    const allowed = roundMoney(
      Math.min(Math.max(0, requested), Math.max(0, maxPerYear - used)),
    );
    usedByYear.set(year, used + allowed);
    return allowed;
  };
}

/**
 * Project a loan period by period from `plan.fromPeriod`, applying the loan
 * type's rule, prepayments and the final-period settlement.
 */
function amortize(plan: AmortizationPlan): LoanProjection {
  const { terms } = plan;
  const rate = getPeriodicRate(plan.annualInterestRate, terms.paymentFrequency);
  const totalPeriods = getTotalPeriods(
    terms.termMonths,
    terms.paymentFrequency,
  );
  const grace = resolveGracePeriods(terms);
  const fromPeriod = Math.max(1, plan.fromPeriod);
  // Past the term with a balance left, one more row settles it
  const lastPeriod = Math.min(
    Math.max(totalPeriods, fromPeriod),
    fromPeriod + MAX_PROJECTED_PERIODS - 1,
  );
  const effect = plan.prepaymentEffect ?? "reduce_term";
  const extraPerPeriod = Math.max(0, plan.extraPerPeriod ?? 0);
  const cap = createPrepaymentCap(terms);
  const penaltyRate = Math.max(0, terms.prepaymentPenaltyRate ?? 0);
  const prepayments = [...(plan.prepayments ?? [])]
    .filter((p) => p.amount > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let nextPrepayment = 0;
  /** Sum of the one-time prepayments dated on or before `date`, consumed. */
  const takePrepaymentsUntil = (date: string): Array<DatedPrepayment> => {
    const taken: DatedPrepayment[] = [];
    while (
      nextPrepayment < prepayments.length &&
      prepayments[nextPrepayment].date <= date
    ) {
      taken.push(prepayments[nextPrepayment++]);
    }
    return taken;
  };

  let balance = roundMoney(Math.max(0, plan.openingBalance));
  const balanceBeforeAnyPrepayment = balance;
  let totalPenalty = 0;
  let prepaymentsCapped = 0;

  const applyPrepayments = (
    dueOrDate: string,
    requested: DatedPrepayment[],
    extra: number,
    available: number,
  ): { amount: number; penalty: number } => {
    let allowed = 0;
    let requestedTotal = extra;
    if (extra > 0) allowed += cap(dueOrDate, extra);
    for (const p of requested) {
      requestedTotal += p.amount;
      allowed += cap(p.date, p.amount);
    }
    prepaymentsCapped = roundMoney(
      prepaymentsCapped + Math.max(0, requestedTotal - allowed),
    );
    const amount = roundMoney(Math.min(allowed, Math.max(0, available)));
    const penalty = roundMoney(amount * penaltyRate);
    totalPenalty = roundMoney(totalPenalty + penalty);
    return { amount, penalty };
  };

  // Prepayments dated before the first projected period reduce the opening
  // balance (e.g. a calculator prepayment on the start date)
  const initial = applyPrepayments(
    getDueDate(terms, fromPeriod - 1),
    takePrepaymentsUntil(getDueDate(terms, fromPeriod - 1)),
    0,
    balance,
  );
  balance = roundMoney(balance - initial.amount);

  // The fixed regular payment of ANNUITY and of INTEREST_ONLY_THEN after its
  // grace periods: the agreed payment, or an annuity fixed once over the
  // remaining periods (for INTEREST_ONLY_THEN at the end of the grace
  // periods). Under reduce_term a prepayment doesn't lower it.
  const annuityOver = (b: number, periods: number) =>
    calculateAnnuityPayment(b, rate, Math.max(1, periods));
  const remainingFrom = (k: number) => lastPeriod - k + 1;
  /** Periods left to amortise over after period k (none during grace). */
  const amortisingAfter = (k: number) =>
    Math.max(1, lastPeriod - Math.max(k, grace));
  const isAnnuityType =
    terms.loanType === "ANNUITY" || terms.loanType === "INTEREST_ONLY_THEN";
  const amortisesNow = terms.loanType === "ANNUITY" || fromPeriod > grace;
  let annuityPayment: number | null = null;
  if (isAnnuityType && plan.annuityPayment && plan.annuityPayment > 0) {
    annuityPayment = plan.annuityPayment;
  } else if (amortisesNow && isAnnuityType) {
    annuityPayment = annuityOver(
      balanceBeforeAnyPrepayment,
      remainingFrom(fromPeriod),
    );
  }
  if (effect === "reduce_payment" && initial.amount > 0 && annuityPayment) {
    annuityPayment = annuityOver(balance, amortisingAfter(fromPeriod - 1));
  }
  let constantPrincipal =
    totalPeriods > 0
      ? roundMoney(terms.originalPrincipal / totalPeriods)
      : balance;
  if (
    terms.loanType === "CONSTANT_PRINCIPAL" &&
    effect === "reduce_payment" &&
    initial.amount > 0
  ) {
    constantPrincipal = roundMoney(balance / remainingFrom(fromPeriod));
  }
  // Prepaid during the INTEREST_ONLY_THEN grace phase (reduce_term keeps the
  // post-grace payment as if they hadn't happened)
  let prepaidBeforeAnnuity = effect === "reduce_term" ? initial.amount : 0;

  const rows: ProjectedRow[] = [];
  let paymentBelowInterest = false;
  let finalBalloon = 0;
  for (
    let k = fromPeriod;
    k <= lastPeriod && balance > PAID_OFF_THRESHOLD;
    k++
  ) {
    if (plan.maxRows !== undefined && rows.length >= plan.maxRows) break;
    const dueDate = getDueDate(terms, k);
    const openingBalance = balance;
    const interest = roundMoney(openingBalance * rate);

    let principal: number;
    if (k === lastPeriod) {
      principal = openingBalance;
    } else {
      switch (terms.loanType) {
        case "CONSTANT_PRINCIPAL":
          principal = constantPrincipal;
          break;
        case "BULLET":
          principal = 0;
          break;
        case "INTEREST_ONLY_THEN":
        case "ANNUITY": {
          if (k <= grace) {
            principal = 0;
            break;
          }
          annuityPayment ??= annuityOver(
            openingBalance + prepaidBeforeAnnuity,
            remainingFrom(k),
          );
          if (annuityPayment < interest) paymentBelowInterest = true;
          principal = annuityPayment - interest;
          break;
        }
      }
    }
    principal = capPrincipalPortion(openingBalance, principal);
    if (
      k === lastPeriod &&
      k > grace &&
      annuityPayment !== null &&
      principal - (annuityPayment - interest) > annuityPayment
    ) {
      finalBalloon = principal;
    }

    const extra =
      extraPerPeriod > 0 &&
      (!plan.extraPerPeriodFrom || dueDate >= plan.extraPerPeriodFrom)
        ? extraPerPeriod
        : 0;
    const prepaid =
      k === lastPeriod
        ? applyPrepayments(dueDate, takePrepaymentsUntil(dueDate), 0, 0)
        : applyPrepayments(
            dueDate,
            takePrepaymentsUntil(dueDate),
            extra,
            openingBalance - principal,
          );
    const closingBalance = settleLoanBalance(
      openingBalance - principal - prepaid.amount,
    );

    if (prepaid.amount > 0 && closingBalance > 0) {
      if (effect === "reduce_payment") {
        if (annuityPayment !== null) {
          annuityPayment = annuityOver(closingBalance, amortisingAfter(k));
        }
        if (terms.loanType === "CONSTANT_PRINCIPAL") {
          constantPrincipal = roundMoney(
            closingBalance / Math.max(1, lastPeriod - k),
          );
        }
      } else if (annuityPayment === null) {
        prepaidBeforeAnnuity = roundMoney(
          prepaidBeforeAnnuity + prepaid.amount,
        );
      }
    }

    rows.push({
      period: k,
      dueDate,
      openingBalance,
      interest,
      principal,
      payment: roundMoney(principal + interest),
      prepayment: prepaid.amount,
      penalty: prepaid.penalty,
      closingBalance,
      overdue: plan.today !== undefined && dueDate < plan.today,
    });
    balance = closingBalance;
  }

  const sum = (pick: (r: ProjectedRow) => number) =>
    roundMoney(rows.reduce((s, r) => s + pick(r), 0));
  const totalPrepayments = roundMoney(
    initial.amount + sum((r) => r.prepayment),
  );
  return {
    rows,
    initialPrepayment: initial.amount,
    totalInterest: sum((r) => r.interest),
    totalPrincipal: roundMoney(sum((r) => r.principal) + totalPrepayments),
    totalPayments: sum((r) => r.payment),
    totalPrepayments,
    totalPenalty,
    prepaymentsCapped,
    paymentBelowInterest,
    finalBalloon,
    payoffDate: rows.length > 0 ? rows[rows.length - 1].dueDate : null,
  };
}

// ───────────────────────────────────────────────────────────────
// Recorded payments
// ───────────────────────────────────────────────────────────────

interface RecordedWalk<T extends SchedulePayment> {
  /** Payments sorted by payment date. */
  sorted: T[];
  /** Due dates fully covered by regular payments. */
  coveredPeriods: number;
  /** Due date each sorted payment covers (undefined for extra payments). */
  dueDateByIndex: Array<string | undefined>;
  openingBalanceByIndex: number[];
  closingBalanceByIndex: number[];
  /** The due date left partly paid after each sorted payment, if any. */
  openPeriodByIndex: Array<OpenPeriod | null>;
  /** Balance before the first payment. */
  initialBalance: number;
  /**
   * currentBalance + principal repaid exceeds originalPrincipal: the stored
   * balance was raised by hand or the loan negatively amortised, so the
   * reconstructed history can't be trusted.
   */
  historyInconsistent: boolean;
}

/** The scheduled amount due at D_k for a balance owed just before it. */
function scheduledAmountAt(
  loan: ScheduleLoan,
  k: number,
  balance: number,
): number {
  return (
    amortize({
      terms: loan,
      annualInterestRate: loan.annualInterestRate,
      fromPeriod: k,
      openingBalance: balance,
      annuityPayment: agreedAnnuityPayment(loan),
      maxRows: 1,
    }).rows[0]?.payment ?? 0
  );
}

/**
 * Walk the recorded payments in payment-date order: which due date each one
 * covers and the balance before and after it. Partial payments share the
 * open due date until they add up to that due date's scheduled amount; any
 * other regular payment completes it.
 */
function walkRecordedPayments<T extends SchedulePayment>(
  loan: ScheduleLoan,
  payments: T[],
): RecordedWalk<T> {
  const sorted = sortByPaymentDate(payments);
  const repaidPrincipal = sorted.reduce(
    (sum, p) => sum + Math.max(0, p.principalPortion),
    0,
  );
  const initialBalance = roundMoney(
    Math.max(0, loan.currentBalance) + repaidPrincipal,
  );

  let coveredPeriods = 0;
  let pendingPartial = 0;
  let partialThreshold: number | null = null;
  let openPeriod: OpenPeriod | null = null;
  let balance = initialBalance;
  const dueDateByIndex: Array<string | undefined> = [];
  const openingBalanceByIndex: number[] = [];
  const closingBalanceByIndex: number[] = [];
  const openPeriodByIndex: Array<OpenPeriod | null> = [];

  for (const p of sorted) {
    const openingBalance = balance;
    if (isExtraPaymentType(p.paymentType)) {
      dueDateByIndex.push(undefined);
    } else {
      const k = coveredPeriods + 1;
      dueDateByIndex.push(getDueDate(loan, k));
      let completes = true;
      if (p.paymentType === "partial") {
        partialThreshold ??= scheduledAmountAt(loan, k, openingBalance);
        pendingPartial += p.amount;
        completes = partialThreshold - pendingPartial <= PAID_OFF_THRESHOLD;
      }
      if (completes) {
        coveredPeriods++;
        pendingPartial = 0;
        partialThreshold = null;
        openPeriod = null;
      } else {
        const open = openPeriod as OpenPeriod | null;
        openPeriod = {
          openingBalance: open ? open.openingBalance : openingBalance,
          interestBooked: roundMoney(
            (open ? open.interestBooked : 0) + p.interestPortion,
          ),
        };
      }
    }
    balance = roundMoney(
      openingBalance - capPrincipalPortion(openingBalance, p.principalPortion),
    );
    openingBalanceByIndex.push(openingBalance);
    closingBalanceByIndex.push(balance);
    openPeriodByIndex.push(openPeriod);
  }

  return {
    sorted,
    coveredPeriods,
    dueDateByIndex,
    openingBalanceByIndex,
    closingBalanceByIndex,
    openPeriodByIndex,
    initialBalance,
    historyInconsistent:
      initialBalance - loan.originalPrincipal > PAID_OFF_THRESHOLD,
  };
}

/**
 * What a new payment made on `paymentDate` is split on: the walked balance
 * after every recorded payment made on or before that date (a back-dated
 * payment is split on the balance owed then, not on today's balance), and
 * the due date those payments left partly paid, so its interest isn't
 * charged twice.
 */
export function paymentSplitBasis(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  paymentDate: string,
): LoanSplitBasis {
  const walk = walkRecordedPayments(loan, payments);
  let balance = walk.initialBalance;
  let openPeriod: OpenPeriod | null = null;
  for (let i = 0; i < walk.sorted.length; i++) {
    if (walk.sorted[i].paymentDate > paymentDate) break;
    balance = walk.closingBalanceByIndex[i];
    openPeriod = walk.openPeriodByIndex[i];
  }
  return {
    balance,
    annualInterestRate: loan.annualInterestRate,
    paymentFrequency: loan.paymentFrequency,
    openPeriod,
  };
}

/**
 * The first due date not covered by a regular payment, i.e. the date of the
 * first projected schedule row (past the term, the date the residual balance
 * is due). Null once the loan is paid off.
 */
export function computeNextPaymentDate(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
): string | null {
  if (isLoanPaidOff(loan)) return null;
  const { coveredPeriods } = walkRecordedPayments(loan, payments);
  return getDueDate(loan, coveredPeriods + 1);
}

// ───────────────────────────────────────────────────────────────
// Projections of a tracked loan
// ───────────────────────────────────────────────────────────────

/** Options of a What-If projection. */
export interface ProjectLoanOptions {
  /** Extra principal paid with every regular payment (per period, not per month). */
  extraPerPeriod?: number;
  /** First due date the recurring extra applies to. */
  extraPerPeriodFrom?: string;
  oneTimePrepayments?: DatedPrepayment[];
  /** New annual rate (refinancing); the regular payment is re-derived. */
  newRate?: number;
  prepaymentEffect?: PrepaymentEffect;
}

/**
 * Project a tracked loan from its first uncovered due date and current
 * balance. With no options this is exactly the projected part of
 * {@link buildLoanSchedule}; the What-If tab compares two calls.
 */
export function projectLoan(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  options: ProjectLoanOptions = {},
  today?: string,
): LoanProjection {
  const { coveredPeriods } = walkRecordedPayments(loan, payments);
  const newRate =
    options.newRate !== undefined &&
    Number.isFinite(options.newRate) &&
    options.newRate !== loan.annualInterestRate
      ? options.newRate
      : undefined;
  return amortize({
    terms: loan,
    annualInterestRate: newRate ?? loan.annualInterestRate,
    fromPeriod: coveredPeriods + 1,
    openingBalance: isLoanPaidOff(loan) ? 0 : loan.currentBalance,
    // A new rate re-derives the annuity over the remaining periods
    annuityPayment:
      newRate === undefined ? agreedAnnuityPayment(loan) : undefined,
    extraPerPeriod: options.extraPerPeriod,
    extraPerPeriodFrom: options.extraPerPeriodFrom,
    prepayments: options.oneTimePrepayments,
    prepaymentEffect: options.prepaymentEffect,
    today,
  });
}

export interface NextLoanPayment {
  dueDate: string;
  amount: number;
  overdue: boolean;
}

/** The next scheduled payment (the first projected row), null once paid off. */
export function nextLoanPayment(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  today: string,
): NextLoanPayment | null {
  return firstPaymentOf(projectLoan(loan, payments, {}, today));
}

function regularPaymentOf(
  loan: ScheduleLoan,
  projection: LoanProjection,
): number {
  const [first, second] = projection.rows;
  if (!first) return 0;
  if (second) return first.payment;
  // Only the final row is left: count what recurs, not the settlement
  if (loan.loanType === "BULLET") return first.interest;
  const agreed = agreedAnnuityPayment(loan);
  if (projection.finalBalloon > 0 && agreed !== undefined) {
    return Math.min(first.payment, agreed);
  }
  return first.payment;
}

function firstPaymentOf(projection: LoanProjection): NextLoanPayment | null {
  const row = projection.rows[0];
  return row
    ? { dueDate: row.dueDate, amount: row.payment, overdue: row.overdue }
    : null;
}

/**
 * The regular payment agreed at origination: the annuity for ANNUITY, the
 * first (largest) payment for CONSTANT_PRINCIPAL, the interest payment for
 * BULLET and, for INTEREST_ONLY_THEN, the annuity paid after the grace
 * periods (the interest-only payment is `originalPrincipal × rate / ppy`).
 */
export function initialScheduledPayment(
  terms: Omit<
    LoanTerms,
    "startDate" | "maxAnnualPrepaymentRate" | "prepaymentPenaltyRate"
  >,
): number {
  if (terms.originalPrincipal <= 0) return 0;
  const projection = amortize({
    terms: { ...terms, startDate: "2000-01-01" },
    annualInterestRate: terms.annualInterestRate,
    fromPeriod: 1,
    openingBalance: terms.originalPrincipal,
    maxRows: resolveGracePeriods(terms) + 1,
  });
  return projection.rows[projection.rows.length - 1]?.payment ?? 0;
}

/**
 * The regular payment to store after an edit. A payment the user changed is
 * kept. Otherwise, when the rate or the balance of an ANNUITY or
 * INTEREST_ONLY_THEN loan changes, the payment is re-derived over the
 * remaining periods (what a bank does for a variable rate), so a too-low
 * payment can't silently negative-amortise into a final balloon.
 */
export function scheduledPaymentAfterEdit(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  edits: {
    currentBalance?: number;
    annualInterestRate?: number;
    scheduledPayment?: number;
  },
): number {
  if (
    edits.scheduledPayment !== undefined &&
    Number.isFinite(edits.scheduledPayment) &&
    roundMoney(edits.scheduledPayment) !== roundMoney(loan.scheduledPayment)
  ) {
    return roundMoney(edits.scheduledPayment);
  }
  const balance = edits.currentBalance ?? loan.currentBalance;
  const rate = edits.annualInterestRate ?? loan.annualInterestRate;
  const changed =
    balance !== loan.currentBalance || rate !== loan.annualInterestRate;
  if (
    !changed ||
    (loan.loanType !== "ANNUITY" && loan.loanType !== "INTEREST_ONLY_THEN") ||
    balance <= PAID_OFF_THRESHOLD
  ) {
    return loan.scheduledPayment;
  }

  return rederiveScheduledPayment(loan, payments, balance, rate);
}

/**
 * The ANNUITY / INTEREST_ONLY_THEN payment that repays `balance` over the
 * periods left after the recorded payments (for INTEREST_ONLY_THEN, over
 * the periods after the grace periods).
 */
export function rederiveScheduledPayment(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  balance: number = loan.currentBalance,
  annualInterestRate: number = loan.annualInterestRate,
): number {
  const { coveredPeriods } = walkRecordedPayments(loan, payments);
  const grace = resolveGracePeriods(loan);
  const projection = amortize({
    terms: loan,
    annualInterestRate,
    fromPeriod: coveredPeriods + 1,
    openingBalance: balance,
    maxRows: Math.max(1, grace - coveredPeriods + 1),
  });
  const firstAmortising = projection.rows.find((r) => r.period > grace);
  return firstAmortising?.payment ?? loan.scheduledPayment;
}

/**
 * The stored payment is what the old add-loan dialog computed for an
 * INTEREST_ONLY_THEN loan: an annuity of the original principal over the
 * whole term, ignoring the grace periods. A payment the user typed in
 * doesn't match it and is left alone by the backfill.
 */
export function isLegacyFullTermAnnuityPayment(
  loan: Pick<
    ScheduleLoan,
    | "loanType"
    | "originalPrincipal"
    | "annualInterestRate"
    | "termMonths"
    | "paymentFrequency"
    | "scheduledPayment"
  >,
): boolean {
  if (loan.loanType !== "INTEREST_ONLY_THEN") return false;
  const periods = getTotalPeriods(loan.termMonths, loan.paymentFrequency);
  if (periods <= 0) return false;
  const legacy = calculateAnnuityPayment(
    loan.originalPrincipal,
    getPeriodicRate(loan.annualInterestRate, loan.paymentFrequency),
    periods,
  );
  return Math.abs(legacy - loan.scheduledPayment) <= PAID_OFF_THRESHOLD;
}

/**
 * The stored payment of an INTEREST_ONLY_THEN loan predates
 * `scheduledPayment` meaning the post-grace annuity: either the old add-loan
 * dialog's full-term annuity ({@link isLegacyFullTermAnnuityPayment}) or the
 * old createLoan fallback, which stored the interest-only payment
 * (originalPrincipal × periodic rate). Projecting with either leaves an
 * undersized payment and a large final balloon.
 */
export function isLegacyInterestOnlyThenPayment(
  loan: Parameters<typeof isLegacyFullTermAnnuityPayment>[0],
): boolean {
  if (loan.loanType !== "INTEREST_ONLY_THEN") return false;
  if (isLegacyFullTermAnnuityPayment(loan)) return true;
  const interestOnly = roundMoney(
    loan.originalPrincipal *
      getPeriodicRate(loan.annualInterestRate, loan.paymentFrequency),
  );
  return (
    interestOnly > 0 &&
    Math.abs(interestOnly - loan.scheduledPayment) <= PAID_OFF_THRESHOLD
  );
}

/**
 * The agreed regular payment the engine projects with. A legacy
 * INTEREST_ONLY_THEN payment (see {@link isLegacyInterestOnlyThenPayment})
 * isn't one: until `migrations:backfillInterestOnlyScheduledPayments`
 * rewrites it, the post-grace annuity is derived over the remaining periods
 * instead, as the tracker did before.
 */
function agreedAnnuityPayment(loan: ScheduleLoan): number | undefined {
  return isLegacyInterestOnlyThenPayment(loan)
    ? undefined
    : loan.scheduledPayment;
}

// ───────────────────────────────────────────────────────────────
// Schedule & KPIs
// ───────────────────────────────────────────────────────────────

type ScheduleRowDraft = Omit<
  LoanScheduleRow,
  "period" | "cumulativeInterest" | "cumulativePrincipal"
>;

/**
 * Full payment schedule: every recorded payment (oldest first) followed by
 * the projected payments still due.
 *
 * @param today `YYYY-MM-DD` used to flag overdue projected rows.
 */
export function buildLoanSchedule(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  today: string,
): LoanScheduleRow[] {
  const walk = walkRecordedPayments(loan, payments);

  const drafts: ScheduleRowDraft[] = walk.sorted.map((p, i) => {
    const openingBalance = walk.openingBalanceByIndex[i];
    return {
      date: p.paymentDate,
      dueDate: walk.dueDateByIndex[i],
      openingBalance,
      payment: p.amount,
      principal: capPrincipalPortion(openingBalance, p.principalPortion),
      interest: p.interestPortion,
      closingBalance: walk.closingBalanceByIndex[i],
      status: isExtraPaymentType(p.paymentType) ? "extra" : "paid",
      overdue: false,
      paymentId: p._id,
      paymentType: p.paymentType,
    };
  });

  for (const row of projectLoan(loan, payments, {}, today).rows) {
    drafts.push({
      date: row.dueDate,
      dueDate: row.dueDate,
      openingBalance: row.openingBalance,
      payment: row.payment,
      principal: row.principal,
      interest: row.interest,
      closingBalance: row.closingBalance,
      status: "scheduled",
      overdue: row.overdue,
    });
  }

  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  return drafts.map((row, index) => {
    cumulativeInterest = roundMoney(cumulativeInterest + row.interest);
    cumulativePrincipal = roundMoney(cumulativePrincipal + row.principal);
    return {
      ...row,
      period: index + 1,
      cumulativeInterest,
      cumulativePrincipal,
    };
  });
}

export interface LoanKpis {
  /** originalPrincipal − currentBalance (never negative). */
  principalRepaid: number;
  /** principalRepaid as a percentage of originalPrincipal (0–100). */
  progress: number;
  /** Sum of every recorded payment amount. */
  totalPaid: number;
  /** Sum of the interest of every recorded payment. */
  interestPaid: number;
  /** Interest still to be paid under the current plan. */
  projectedInterest: number;
  /** interestPaid + projectedInterest. */
  totalInterest: number;
  /** Sum of the regular payments still due. */
  remainingPayments: number;
  remainingPeriods: number;
  /** Calendar months from today to the projected payoff (0 once paid off). */
  remainingMonths: number;
  /** Last projected due date, or the actual end date once paid off. */
  projectedPayoffDate: string | null;
  nextPayment: NextLoanPayment | null;
  /**
   * The recurring payment, for monthly totals: the next payment, but never a
   * final settlement (a final BULLET row counts only its interest, a final
   * balloon the agreed payment). 0 once paid off.
   */
  regularPayment: number;
  paymentBelowInterest: boolean;
  /** See {@link LoanProjection.finalBalloon}. */
  finalBalloon: number;
  historyInconsistent: boolean;
}

/** The KPIs every loan view shows, all derived from the same schedule. */
export function loanKpis(
  loan: ScheduleLoan,
  payments: SchedulePayment[],
  today: string,
): LoanKpis {
  const walk = walkRecordedPayments(loan, payments);
  const projection = projectLoan(loan, payments, {}, today);
  const principalRepaid = roundMoney(
    Math.max(0, loan.originalPrincipal - loan.currentBalance),
  );
  const interestPaid = roundMoney(
    payments.reduce((sum, p) => sum + p.interestPortion, 0),
  );
  const lastPaymentDate = walk.sorted[walk.sorted.length - 1]?.paymentDate;
  return {
    principalRepaid,
    progress:
      loan.originalPrincipal > 0
        ? Math.min(100, (principalRepaid / loan.originalPrincipal) * 100)
        : 0,
    totalPaid: roundMoney(payments.reduce((sum, p) => sum + p.amount, 0)),
    interestPaid,
    projectedInterest: projection.totalInterest,
    totalInterest: roundMoney(interestPaid + projection.totalInterest),
    remainingPayments: projection.totalPayments,
    remainingPeriods: projection.rows.length,
    remainingMonths: projection.payoffDate
      ? monthsBetweenISODates(today, projection.payoffDate)
      : 0,
    projectedPayoffDate:
      projection.payoffDate ?? loan.actualEndDate ?? lastPaymentDate ?? null,
    nextPayment: firstPaymentOf(projection),
    regularPayment: regularPaymentOf(loan, projection),
    paymentBelowInterest: projection.paymentBelowInterest,
    finalBalloon: projection.finalBalloon,
    historyInconsistent: walk.historyInconsistent,
  };
}

// ───────────────────────────────────────────────────────────────
// Loan calculator (a loan that hasn't started yet)
// ───────────────────────────────────────────────────────────────

/** Input of the loan calculator. */
export interface LoanInput {
  loanType: LoanType;
  /** Initial loan amount (Darlehensbetrag). */
  principal: number;
  /** Annual interest rate as decimal (e.g., 0.05 for 5%). */
  annualInterestRate: number;
  /** Total loan term in payment periods. */
  termPeriods: number;
  paymentFrequency: LoanPaymentFrequency;
  /** `YYYY-MM-DD`; the first payment is due one period later. */
  startDate: string;
  /** ANNUITY: agreed payment (derived when absent). */
  fixedPayment?: number;
  /** INTEREST_ONLY_THEN: number of interest-only periods. */
  gracePeriods?: number;
  /** One-time prepayments (one on the start date reduces the opening balance). */
  prepayments?: DatedPrepayment[];
  /** Extra principal paid with every regular payment. */
  extraPerPeriod?: number;
  prepaymentEffect?: PrepaymentEffect;
  maxAnnualPrepaymentRate?: number;
  prepaymentPenaltyRate?: number;
}

/** Single row in the calculator's amortization schedule. */
export interface AmortizationRow {
  periodIndex: number;
  /** `YYYY-MM-DD` the payment is due. */
  paymentDate: string;
  openingBalance: number;
  interestAmount: number;
  /** Regular payment (principal + interest). */
  scheduledPayment: number;
  principalPayment: number;
  prepaymentAmount: number;
  totalPayment: number;
  closingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

/** Summary of the loan calculation. */
export interface LoanSummary {
  principal: number;
  totalInterest: number;
  /** Everything paid: regular payments plus prepayments. */
  totalPayment: number;
  totalPrepayments: number;
  totalPenalty: number;
  numberOfPayments: number;
  effectiveTermPeriods: number;
  /** First regular payment (the annuity for ANNUITY). */
  typicalPayment: number;
  /** Annual effective interest rate (Effektiver Jahreszins). */
  effectiveAnnualRate: number;
  paymentBelowInterest: boolean;
  schedule: AmortizationRow[];
}

/** Full amortization schedule of a new loan (a thin adapter over the engine). */
export function calculateLoanSchedule(input: LoanInput): LoanSummary {
  const terms: LoanTerms = {
    loanType: input.loanType,
    originalPrincipal: input.principal,
    annualInterestRate: input.annualInterestRate,
    termMonths: input.termPeriods * getMonthsPerPeriod(input.paymentFrequency),
    paymentFrequency: input.paymentFrequency,
    startDate: input.startDate,
    gracePeriods: input.gracePeriods,
    maxAnnualPrepaymentRate: input.maxAnnualPrepaymentRate,
    prepaymentPenaltyRate: input.prepaymentPenaltyRate,
  };
  const projection = amortize({
    terms,
    annualInterestRate: input.annualInterestRate,
    fromPeriod: 1,
    openingBalance: input.principal,
    annuityPayment: input.fixedPayment,
    extraPerPeriod: input.extraPerPeriod,
    prepayments: input.prepayments,
    prepaymentEffect: input.prepaymentEffect,
  });

  let cumulativeInterest = 0;
  let cumulativePrincipal = projection.initialPrepayment;
  const schedule = projection.rows.map((row, i): AmortizationRow => {
    // The first row also carries the prepayment made on the start date
    const prepaymentAmount = roundMoney(
      row.prepayment + (i === 0 ? projection.initialPrepayment : 0),
    );
    cumulativeInterest = roundMoney(cumulativeInterest + row.interest);
    cumulativePrincipal = roundMoney(
      cumulativePrincipal + row.principal + row.prepayment,
    );
    return {
      periodIndex: row.period,
      paymentDate: row.dueDate,
      openingBalance: row.openingBalance,
      interestAmount: row.interest,
      scheduledPayment: row.payment,
      principalPayment: row.principal,
      prepaymentAmount,
      totalPayment: roundMoney(row.payment + prepaymentAmount),
      closingBalance: row.closingBalance,
      cumulativeInterest,
      cumulativePrincipal,
    };
  });

  const periodicRate = getPeriodicRate(
    input.annualInterestRate,
    input.paymentFrequency,
  );
  return {
    principal: input.principal,
    totalInterest: projection.totalInterest,
    totalPayment: roundMoney(
      projection.totalPayments + projection.totalPrepayments,
    ),
    totalPrepayments: projection.totalPrepayments,
    totalPenalty: projection.totalPenalty,
    numberOfPayments: schedule.length,
    effectiveTermPeriods: schedule.length,
    typicalPayment: schedule[0]?.scheduledPayment ?? 0,
    effectiveAnnualRate:
      Math.pow(1 + periodicRate, getPaymentsPerYear(input.paymentFrequency)) -
      1,
    paymentBelowInterest: projection.paymentBelowInterest,
    schedule,
  };
}
