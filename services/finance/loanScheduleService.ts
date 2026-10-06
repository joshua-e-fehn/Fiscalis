// ═══════════════════════════════════════════════════════════════
// Loan payment schedule — recorded payments + projection
// ═══════════════════════════════════════════════════════════════
//
// Framework-free so the loan detail page and the Convex loan mutations share
// one definition of "which due dates are paid" and "what is due next".
// Dates are calendar-only `YYYY-MM-DD` strings; no timezone-sensitive `Date`
// arithmetic.
//
// The model:
//   1. Due dates are D_k = startDate + k payment periods (k = 1..totalPeriods).
//   2. Regular payments (scheduled/late/partial/final) cover D_1, D_2, … in
//      payment-date order, whatever day they were actually paid on. Partial
//      payments share one due date until they add up to a scheduled payment.
//      Extra payments (additional_principal/prepayment) only reduce principal.
//   3. Balances of recorded rows are walked forward from the balance before
//      the first payment (loan.currentBalance + principal repaid since, at
//      most originalPrincipal), so the last paid row closes at the balance the
//      loan KPIs show and a payment that overshot the balance can't inflate
//      the history.
//   4. The projection starts at D_{covered+1} from loan.currentBalance and
//      settles any residual balance at the final period.

import {
  calculateAnnuityPayment,
  roundMoney,
  type LoanType,
} from "./financeService";

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

export type LoanPaymentFrequency =
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL";

export type LoanPaymentType =
  | "scheduled"
  | "additional_principal"
  | "prepayment"
  | "final"
  | "partial"
  | "late";

/** The loan fields the schedule needs (a structural subset of the stored loan). */
export interface ScheduleLoan {
  loanType: LoanType;
  originalPrincipal: number;
  currentBalance: number;
  /** Annual rate as decimal (0.025 = 2.5%). */
  annualInterestRate: number;
  termMonths: number;
  paymentFrequency: LoanPaymentFrequency;
  scheduledPayment: number;
  /** `YYYY-MM-DD`; the first payment is due one period later. */
  startDate: string;
  /** INTEREST_ONLY_THEN: number of leading interest-only periods. */
  gracePeriods?: number;
  status?: string;
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

function getMonthsPerPeriod(frequency: LoanPaymentFrequency): number {
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
  loan: Pick<ScheduleLoan, "annualInterestRate" | "paymentFrequency">,
): number {
  return loan.annualInterestRate / getPaymentsPerYear(loan.paymentFrequency);
}

/** Annuity payment for a whole loan term (rounded to cents). */
export function calculateLoanAnnuityPayment(
  principal: number,
  annualInterestRate: number,
  termMonths: number,
  frequency: LoanPaymentFrequency,
): number {
  return calculateAnnuityPayment(
    principal,
    annualInterestRate / getPaymentsPerYear(frequency),
    getTotalPeriods(termMonths, frequency),
  );
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

/**
 * Due date D_k of a loan: startDate + k periods. Computed from the start date
 * (not by chaining) so month-end anchors don't drift.
 */
export function getDueDate(
  loan: Pick<ScheduleLoan, "startDate" | "paymentFrequency">,
  k: number,
): string {
  return addMonthsToISODate(
    loan.startDate,
    k * getMonthsPerPeriod(loan.paymentFrequency),
  );
}

// ───────────────────────────────────────────────────────────────
// Payment classification
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

function sortByPaymentDate(payments: SchedulePayment[]): SchedulePayment[] {
  return [...payments].sort((a, b) => {
    if (a.paymentDate !== b.paymentDate) {
      return a.paymentDate < b.paymentDate ? -1 : 1;
    }
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

/**
 * The due date each payment (sorted by payment date) applies to, and how many
 * due dates are fully covered. Partial payments share the open due date until
 * they add up to a scheduled payment; any other regular payment completes it.
 */
function assignDueDates(
  loan: Pick<
    ScheduleLoan,
    "startDate" | "paymentFrequency" | "scheduledPayment"
  >,
  sortedPayments: SchedulePayment[],
): { coveredPeriods: number; dueDateByIndex: Array<string | undefined> } {
  let coveredPeriods = 0;
  let pendingPartial = 0;
  const dueDateByIndex = sortedPayments.map((p) => {
    if (isExtraPaymentType(p.paymentType)) return undefined;

    const dueDate = getDueDate(loan, coveredPeriods + 1);
    if (p.paymentType === "partial") {
      pendingPartial += p.amount;
      if (loan.scheduledPayment - pendingPartial > PAID_OFF_THRESHOLD) {
        return dueDate;
      }
    }
    coveredPeriods++;
    pendingPartial = 0;
    return dueDate;
  });
  return { coveredPeriods, dueDateByIndex };
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
  const { coveredPeriods } = assignDueDates(loan, sortByPaymentDate(payments));
  return getDueDate(loan, coveredPeriods + 1);
}

/**
 * Split a payment into interest (one period on the current balance) and
 * principal. Extra payments go entirely to principal. A portion the user
 * entered is kept and the other one is the rest of the amount. Principal is
 * capped at the current balance.
 */
export function splitLoanPayment(
  loan: Pick<
    ScheduleLoan,
    "currentBalance" | "annualInterestRate" | "paymentFrequency"
  >,
  amount: number,
  paymentType: LoanPaymentType,
  entered: { principal?: number; interest?: number } = {},
): { principalPortion: number; interestPortion: number } {
  const { principal, interest } = entered;
  const hasPrincipal = principal !== undefined && Number.isFinite(principal);
  const hasInterest = interest !== undefined && Number.isFinite(interest);
  const result = (principalPortion: number, interestPortion: number) => ({
    principalPortion: capPrincipalPortion(
      loan.currentBalance,
      principalPortion,
    ),
    interestPortion,
  });

  if (hasPrincipal && hasInterest) return result(principal, interest);
  if (hasPrincipal) {
    const principalPart = roundMoney(Math.min(Math.max(0, principal), amount));
    return result(principalPart, roundMoney(amount - principalPart));
  }
  if (hasInterest) {
    const interestPart = roundMoney(Math.min(Math.max(0, interest), amount));
    return result(roundMoney(amount - interestPart), interestPart);
  }

  if (isExtraPaymentType(paymentType)) return result(amount, 0);

  const periodInterest = roundMoney(
    Math.max(0, loan.currentBalance) * getPeriodicRate(loan),
  );
  const interestPortion = Math.min(periodInterest, Math.max(0, amount));
  return result(amount - interestPortion, interestPortion);
}

// ───────────────────────────────────────────────────────────────
// Schedule
// ───────────────────────────────────────────────────────────────

type ScheduleRowDraft = Omit<
  LoanScheduleRow,
  "period" | "cumulativeInterest" | "cumulativePrincipal"
>;

/** Principal due in period k under the loan type's regular rule. */
function regularPrincipal(
  loan: ScheduleLoan,
  k: number,
  lastPeriod: number,
  balance: number,
  interest: number,
): number {
  switch (loan.loanType) {
    case "ANNUITY":
      return Math.min(loan.scheduledPayment, balance + interest) - interest;
    case "CONSTANT_PRINCIPAL": {
      const totalPeriods = getTotalPeriods(
        loan.termMonths,
        loan.paymentFrequency,
      );
      return totalPeriods > 0
        ? Math.min(loan.originalPrincipal / totalPeriods, balance)
        : balance;
    }
    case "BULLET":
      return 0; // principal is settled at the final period
    case "INTEREST_ONLY_THEN": {
      if (k <= (loan.gracePeriods ?? 0)) return 0;
      // Amortize the rest over the remaining periods, as calculateLoanSchedule does
      const payment = calculateAnnuityPayment(
        balance,
        getPeriodicRate(loan),
        lastPeriod - k + 1,
      );
      return Math.min(payment, balance + interest) - interest;
    }
  }
}

function projectRemainingPayments(
  loan: ScheduleLoan,
  coveredPeriods: number,
  today: string,
): ScheduleRowDraft[] {
  const rows: ScheduleRowDraft[] = [];
  const periodicRate = getPeriodicRate(loan);
  const totalPeriods = getTotalPeriods(loan.termMonths, loan.paymentFrequency);
  // Past the term with a balance left, one more row settles it
  const lastPeriod = Math.min(
    Math.max(totalPeriods, coveredPeriods + 1),
    coveredPeriods + MAX_PROJECTED_PERIODS,
  );

  let balance = roundMoney(loan.currentBalance);
  for (
    let k = coveredPeriods + 1;
    k <= lastPeriod && balance > PAID_OFF_THRESHOLD;
    k++
  ) {
    const dueDate = getDueDate(loan, k);
    const interest = roundMoney(balance * periodicRate);
    const principal =
      k === lastPeriod
        ? balance
        : roundMoney(regularPrincipal(loan, k, lastPeriod, balance, interest));
    const closingBalance = roundMoney(balance - principal);

    rows.push({
      date: dueDate,
      dueDate,
      openingBalance: balance,
      payment: roundMoney(principal + interest),
      principal,
      interest,
      closingBalance,
      status: "scheduled",
      overdue: dueDate < today,
    });
    balance = closingBalance;
  }

  return rows;
}

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
  const recorded = sortByPaymentDate(payments);
  const { coveredPeriods, dueDateByIndex } = assignDueDates(loan, recorded);

  // Balance before the first payment: what is owed now plus all principal
  // repaid since, but never more than was borrowed
  const repaidPrincipal = recorded.reduce(
    (sum, p) => sum + p.principalPortion,
    0,
  );
  let balance = roundMoney(
    Math.min(
      loan.originalPrincipal,
      Math.max(0, loan.currentBalance) + repaidPrincipal,
    ),
  );

  const drafts: ScheduleRowDraft[] = recorded.map((p, i) => {
    const openingBalance = balance;
    const principal = capPrincipalPortion(openingBalance, p.principalPortion);
    balance = roundMoney(openingBalance - principal);
    return {
      date: p.paymentDate,
      dueDate: dueDateByIndex[i],
      openingBalance,
      payment: p.amount,
      principal,
      interest: p.interestPortion,
      closingBalance: balance,
      status: isExtraPaymentType(p.paymentType) ? "extra" : "paid",
      overdue: false,
      paymentId: p._id,
      paymentType: p.paymentType,
    };
  });

  if (!isLoanPaidOff(loan)) {
    drafts.push(...projectRemainingPayments(loan, coveredPeriods, today));
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
