// TODO: Protect from rounding errors / floating point errors by using a BigNumber library
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365.25; // Average number of days per year considering leap years
const DAYS_PER_WEEK = 7;
const WEEKS_PER_YEAR = 52.178571428571429;
const MONTHS_PER_YEAR = 12.175;
const QUARTER_PER_YEAR = 4;
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const MS_PER_WEEK = 604800000;
const MS_PER_YEAR = 31557600000;
const MS_PER_MONTH = 2592000000;
const MS_PER_QUARTER = MS_PER_YEAR / QUARTER_PER_YEAR;

export type TimeRange =
  | "Hour"
  | "Day"
  | "Week"
  | "Month"
  | "Year"
  | "YTD"
  | "ALL";

export type TimeInterval =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export function getTimeRangeInMilliseconds(timeRange: TimeRange) {
  const now = new Date();

  switch (timeRange) {
    case "Hour":
      return MS_PER_HOUR;
    case "Day":
      return MS_PER_DAY;
    case "Week":
      return MS_PER_WEEK;
    case "Month":
      return MS_PER_MONTH;
    case "Year":
      return MS_PER_YEAR;
    case "YTD": {
      // Time from start of year until now in UTC
      const currentYear = now.getUTCFullYear();
      const startOfYearUTC = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
      return now.getTime() - startOfYearUTC.getTime();
    }
    case "ALL": {
      // From January 1, 2025 (UTC) until now
      const startOf2025UTC = new Date(Date.UTC(2025, 0, 1, 0, 0, 0, 0));
      return now.getTime() - startOf2025UTC.getTime();
    }
    default:
      return MS_PER_DAY; // Default to 1 day
  }
}

export function getTimeIntervalInMilliseconds(timeRange: TimeInterval) {
  switch (timeRange) {
    case "minute":
      return MS_PER_MINUTE;
    case "hour":
      return MS_PER_HOUR;
    case "day":
      return MS_PER_DAY;
    case "week":
      return MS_PER_WEEK;
    case "month":
      return MS_PER_MONTH;
    case "quarter":
      return MS_PER_QUARTER;
    case "year":
      return MS_PER_YEAR;
    default:
      return MS_PER_YEAR;
  }
}

function millisecondsToTimeIntervals(
  milliseconds: number,
  timeInterval: TimeInterval,
): number {
  switch (timeInterval) {
    case "minute":
      return milliseconds / MS_PER_MINUTE;
    case "hour":
      return milliseconds / MS_PER_HOUR;
    case "day":
      return milliseconds / MS_PER_DAY;
    case "week":
      return milliseconds / MS_PER_WEEK;
    case "month":
      return milliseconds / MS_PER_MONTH;
    case "quarter":
      return milliseconds / MS_PER_QUARTER;
    case "year":
      return milliseconds / MS_PER_YEAR;
    default:
      return milliseconds / MS_PER_YEAR;
  }
}

export interface capitalPointInTime {
  time: Date;
  capitalValue: Number;
}

export function calculateAverageCompoundInterest(
  pointA: capitalPointInTime,
  pointB: capitalPointInTime,
  interestInterval: TimeInterval = "year",
): Number {
  const priceDifferenceInPercent =
    pointB.capitalValue.valueOf() / pointA.capitalValue.valueOf();
  const timeDifference = pointB.time.getTime() - pointA.time.getTime();
  const timeDifferenceInTimeIntervals = millisecondsToTimeIntervals(
    timeDifference,
    interestInterval,
  );
  return (
    Math.pow(priceDifferenceInPercent, 1 / timeDifferenceInTimeIntervals) - 1
  );
}

export function calculateAverageInterest(
  pointA: capitalPointInTime,
  pointB: capitalPointInTime,
  interestInterval: TimeInterval = "year",
): Number {
  const priceDifference =
    pointB.capitalValue.valueOf() - pointA.capitalValue.valueOf();
  const timeDifference = pointB.time.getTime() - pointA.time.getTime();
  const timeDifferenceInTimeIntervals = millisecondsToTimeIntervals(
    timeDifference,
    interestInterval,
  );
  return (
    priceDifference /
    pointA.capitalValue.valueOf() /
    timeDifferenceInTimeIntervals
  );
}

export function calculateCapitalGainDurationWithCompoundInterest(
  startCapital: number,
  endCapital: number,
  interestRate: number,
): number {
  return Math.log(endCapital / startCapital) / Math.log(1 + interestRate);
}

export function calculateCapitalGainDurationWithInterest(
  startCapital: number,
  endCapital: number,
  interestRate: number,
): number {
  return (endCapital - startCapital) / (startCapital * interestRate);
}

export function calculateEndCapitalValueWithCompoundInterest(
  startCapital: number,
  interestRate: number,
  interestIntervalAmount: number,
) {
  return startCapital * Math.pow(1 + interestRate, interestIntervalAmount);
}

export function calculateEndCapitalValueWithInterest(
  startCapital: number,
  interestRate: number,
  interestIntervalAmount: number,
) {
  return startCapital + startCapital * interestRate * interestIntervalAmount;
}

export function calculateStartCapitalValueWithCompoundInterest(
  endCapital: number,
  interestRate: number,
  interestIntervalAmount: number,
) {
  return endCapital / Math.pow(1 + interestRate, interestIntervalAmount);
}

export function calculateStartCapitalValueWithInterest(
  endCapital: number,
  interestRate: number,
  interestIntervalAmount: number,
) {
  return endCapital / (1 + interestRate * interestIntervalAmount);
}

// ============================================================================
// Loan Calculator
// ============================================================================

/**
 * Loan types supported by the calculator
 * - ANNUITY: Constant payment (most common)
 * - CONSTANT_PRINCIPAL: Decreasing payments (Tilgungsdarlehen)
 * - BULLET: Interest-only with principal at end (Endfälliges Darlehen)
 * - INTEREST_ONLY_THEN: Interest-only period followed by amortization
 */
export type LoanType =
  | "ANNUITY"
  | "CONSTANT_PRINCIPAL"
  | "BULLET"
  | "INTEREST_ONLY_THEN";

/**
 * Supported payment intervals (subset of TimeInterval for loans)
 */
export type LoanPaymentInterval = "month" | "quarter" | "year";

/**
 * Extra/special prepayment configuration
 */
export interface Prepayment {
  /** Date when the prepayment is made */
  date: Date;
  /** Amount to prepay */
  amount: number;
  /** Whether to reduce the monthly payment (true) or the term (false, default) */
  reducePayment?: boolean;
}

/**
 * Recurring prepayment configuration
 */
export interface RecurringPrepayment {
  /** Amount to prepay each period */
  amount: number;
  /** Interval for the recurring prepayment */
  interval: LoanPaymentInterval;
  /** Start date for recurring prepayments (defaults to loan start) */
  startDate?: Date;
  /** End date for recurring prepayments (defaults to loan end) */
  endDate?: Date;
}

/**
 * Input configuration for loan calculation
 */
export interface LoanInput {
  loanType: LoanType;
  /** Initial loan amount (Darlehensbetrag) */
  principal: number;
  /** Annual interest rate as decimal (e.g., 0.05 for 5%) */
  annualInterestRate: number;
  /** Total loan term in the payment interval units */
  termPeriods: number;
  /** Payment interval */
  paymentInterval: LoanPaymentInterval;
  /** Start date of the loan */
  startDate: Date;

  /** For ANNUITY: optional fixed payment (if not provided, calculated) */
  fixedPayment?: number;

  /** For CONSTANT_PRINCIPAL: optional fixed principal per period */
  fixedPrincipalPerPeriod?: number;

  /** For INTEREST_ONLY_THEN: number of interest-only periods */
  gracePeriods?: number;

  /** One-time extra prepayments */
  prepayments?: Prepayment[];

  /** Recurring prepayments */
  recurringPrepayments?: RecurringPrepayment[];

  /** Maximum allowed annual prepayment as percentage of principal (e.g., 0.05 for 5%) */
  maxAnnualPrepaymentRate?: number;
}

/**
 * Single row in the amortization schedule
 */
export interface AmortizationRow {
  periodIndex: number;
  periodStart: Date;
  periodEnd: Date;
  paymentDate: Date;
  openingBalance: number;
  interestAmount: number;
  scheduledPayment: number;
  principalPayment: number;
  prepaymentAmount: number;
  totalPayment: number;
  closingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

/**
 * Summary of the loan calculation
 */
export interface LoanSummary {
  principal: number;
  totalInterest: number;
  totalPayment: number;
  totalPrepayments: number;
  numberOfPayments: number;
  effectiveTermPeriods: number;
  /** Typical payment amount (first payment for annuity) */
  typicalPayment: number;
  /** Annual effective interest rate (Effektiver Jahreszins) */
  effectiveAnnualRate: number;
  schedule: AmortizationRow[];
}

// ============================================================================
// Loan Helper Functions
// ============================================================================

/**
 * Get the number of periods per year for a given interval
 */
function getPeriodsPerYear(interval: LoanPaymentInterval): number {
  switch (interval) {
    case "month":
      return 12;
    case "quarter":
      return 4;
    case "year":
      return 1;
  }
}

/**
 * Get months per period
 */
function getMonthsPerPeriod(interval: LoanPaymentInterval): number {
  switch (interval) {
    case "month":
      return 1;
    case "quarter":
      return 3;
    case "year":
      return 12;
  }
}

/**
 * Add periods to a date
 */
function addPeriods(
  date: Date,
  periods: number,
  interval: LoanPaymentInterval,
): Date {
  const result = new Date(date);
  const months = periods * getMonthsPerPeriod(interval);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Round to 2 decimal places (cents)
 */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate annuity payment using PMT formula
 * PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
 */
export function calculateAnnuityPayment(
  principal: number,
  periodicRate: number,
  numberOfPeriods: number,
): number {
  if (periodicRate === 0) {
    return principal / numberOfPeriods;
  }

  const factor = Math.pow(1 + periodicRate, numberOfPeriods);
  const payment = (principal * (periodicRate * factor)) / (factor - 1);
  return roundMoney(payment);
}

/**
 * Generate payment periods
 */
function generatePeriods(
  startDate: Date,
  termPeriods: number,
  interval: LoanPaymentInterval,
): { periodStart: Date; periodEnd: Date; paymentDate: Date }[] {
  const periods: { periodStart: Date; periodEnd: Date; paymentDate: Date }[] =
    [];

  let currentStart = new Date(startDate);

  for (let i = 0; i < termPeriods; i++) {
    const periodEnd = addPeriods(currentStart, 1, interval);
    periods.push({
      periodStart: new Date(currentStart),
      periodEnd: new Date(periodEnd),
      paymentDate: new Date(periodEnd), // Payment at end of period
    });
    currentStart = periodEnd;
  }

  return periods;
}

/**
 * Expand recurring prepayments into individual ones
 */
function expandRecurringPrepayments(
  recurring: RecurringPrepayment[],
  loanStart: Date,
  loanEnd: Date,
  principal: number,
  maxAnnualRate?: number,
): Prepayment[] {
  const expanded: Prepayment[] = [];

  for (const rec of recurring) {
    const start = rec.startDate ?? loanStart;
    const end = rec.endDate ?? loanEnd;
    let current = new Date(start);

    // Track annual totals for max rate enforcement
    const annualTotals = new Map<number, number>();

    while (current <= end) {
      const year = current.getFullYear();
      const currentAnnual = annualTotals.get(year) ?? 0;
      const maxAnnual = maxAnnualRate ? principal * maxAnnualRate : Infinity;

      let amount = rec.amount;
      if (currentAnnual + amount > maxAnnual) {
        amount = Math.max(0, maxAnnual - currentAnnual);
      }

      if (amount > 0) {
        expanded.push({
          date: new Date(current),
          amount,
          reducePayment: false,
        });
        annualTotals.set(year, currentAnnual + amount);
      }

      current = addPeriods(current, 1, rec.interval);
    }
  }

  return expanded;
}

/**
 * Index prepayments by period
 */
function indexPrepaymentsByPeriod(
  prepayments: Prepayment[],
  periods: { periodStart: Date; periodEnd: Date }[],
  principal: number,
  maxAnnualRate?: number,
): Map<number, { amount: number; reducePayment: boolean }> {
  const map = new Map<number, { amount: number; reducePayment: boolean }>();
  const annualTotals = new Map<number, number>();

  for (const st of prepayments) {
    const stDate = st.date.getTime();

    for (let i = 0; i < periods.length; i++) {
      const periodStart = periods[i].periodStart.getTime();
      const periodEnd = periods[i].periodEnd.getTime();

      if (stDate > periodStart && stDate <= periodEnd) {
        // Enforce annual maximum
        const year = st.date.getFullYear();
        const currentAnnual = annualTotals.get(year) ?? 0;
        const maxAnnual = maxAnnualRate ? principal * maxAnnualRate : Infinity;

        let amount = st.amount;
        if (currentAnnual + amount > maxAnnual) {
          amount = Math.max(0, maxAnnual - currentAnnual);
        }

        if (amount > 0) {
          const existing = map.get(i);
          map.set(i, {
            amount: (existing?.amount ?? 0) + amount,
            reducePayment: st.reducePayment ?? existing?.reducePayment ?? false,
          });
          annualTotals.set(year, currentAnnual + amount);
        }
        break;
      }
    }
  }

  return map;
}

// ============================================================================
// Main Loan Calculator
// ============================================================================

/**
 * Calculate the full amortization schedule for a loan
 */
export function calculateLoanSchedule(input: LoanInput): LoanSummary {
  const {
    loanType,
    principal,
    annualInterestRate,
    termPeriods,
    paymentInterval,
    startDate,
    prepayments = [],
    recurringPrepayments = [],
    maxAnnualPrepaymentRate,
  } = input;

  const periods = generatePeriods(startDate, termPeriods, paymentInterval);
  const loanEnd = periods[periods.length - 1]?.periodEnd ?? startDate;

  // Expand recurring prepayments
  const expandedRecurring = expandRecurringPrepayments(
    recurringPrepayments,
    startDate,
    loanEnd,
    principal,
    maxAnnualPrepaymentRate,
  );

  // Combine all prepayments
  const allPrepayments = [...prepayments, ...expandedRecurring];
  const prepaymentsByPeriod = indexPrepaymentsByPeriod(
    allPrepayments,
    periods,
    principal,
    maxAnnualPrepaymentRate,
  );

  const periodsPerYear = getPeriodsPerYear(paymentInterval);
  const periodicRate = annualInterestRate / periodsPerYear;

  // Calculate scheduled payment based on loan type
  let scheduledPayment: number;
  let principalPerPeriod: number | null = null;

  switch (loanType) {
    case "ANNUITY":
      scheduledPayment =
        input.fixedPayment ??
        calculateAnnuityPayment(principal, periodicRate, periods.length);
      break;

    case "CONSTANT_PRINCIPAL":
      principalPerPeriod =
        input.fixedPrincipalPerPeriod ?? roundMoney(principal / periods.length);
      scheduledPayment = 0; // Calculated per period
      break;

    case "BULLET":
      scheduledPayment = 0; // Only interest, principal at end
      break;

    case "INTEREST_ONLY_THEN":
      scheduledPayment = 0; // Will be handled per-period
      break;
  }

  // Build amortization schedule
  const schedule: AmortizationRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPrepayments = 0;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  let currentScheduledPayment = scheduledPayment;

  for (let i = 0; i < periods.length && balance > 0.01; i++) {
    const period = periods[i];
    const openingBalance = roundMoney(balance);

    // Calculate interest for this period (simple periodic interest)
    const interestAmount = roundMoney(openingBalance * periodicRate);
    totalInterest += interestAmount;
    cumulativeInterest += interestAmount;

    // Calculate payment based on loan type
    let payment: number;
    let principalPayment: number;

    switch (loanType) {
      case "ANNUITY":
        payment = Math.min(
          currentScheduledPayment,
          openingBalance + interestAmount,
        );
        principalPayment = roundMoney(payment - interestAmount);
        break;

      case "CONSTANT_PRINCIPAL":
        principalPayment = Math.min(principalPerPeriod!, openingBalance);
        payment = roundMoney(interestAmount + principalPayment);
        break;

      case "BULLET":
        if (i === periods.length - 1) {
          // Last period: pay all principal
          principalPayment = openingBalance;
          payment = roundMoney(interestAmount + principalPayment);
        } else {
          // Interest only
          principalPayment = 0;
          payment = interestAmount;
        }
        break;

      case "INTEREST_ONLY_THEN": {
        const gracePeriods =
          input.gracePeriods ?? Math.floor(periods.length / 2);

        if (i < gracePeriods) {
          // Grace period: interest only
          principalPayment = 0;
          payment = interestAmount;
        } else {
          // After grace: annuity on remaining balance and term
          const remainingPeriods = periods.length - i;
          const postGracePayment = calculateAnnuityPayment(
            openingBalance,
            periodicRate,
            remainingPeriods,
          );
          payment = Math.min(postGracePayment, openingBalance + interestAmount);
          principalPayment = roundMoney(payment - interestAmount);
        }
        break;
      }
    }

    // Apply Prepayment
    const prepayment = prepaymentsByPeriod.get(i);
    let prepaymentAmount = 0;

    if (prepayment) {
      prepaymentAmount = Math.min(
        prepayment.amount,
        openingBalance - principalPayment,
      );
      totalPrepayments += prepaymentAmount;

      // If reducePayment is true, recalculate the scheduled payment for remaining term
      if (prepayment.reducePayment && loanType === "ANNUITY") {
        const newBalance = openingBalance - principalPayment - prepaymentAmount;
        const remainingPeriods = periods.length - i - 1;
        if (remainingPeriods > 0 && newBalance > 0) {
          currentScheduledPayment = calculateAnnuityPayment(
            newBalance,
            periodicRate,
            remainingPeriods,
          );
        }
      }
    }

    // Calculate closing balance
    const closingBalance = roundMoney(
      Math.max(0, openingBalance - principalPayment - prepaymentAmount),
    );

    cumulativePrincipal += principalPayment + prepaymentAmount;

    schedule.push({
      periodIndex: i + 1,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      paymentDate: period.paymentDate,
      openingBalance,
      interestAmount,
      scheduledPayment: payment,
      principalPayment: roundMoney(principalPayment),
      prepaymentAmount: roundMoney(prepaymentAmount),
      totalPayment: roundMoney(payment + prepaymentAmount),
      closingBalance,
      cumulativeInterest: roundMoney(cumulativeInterest),
      cumulativePrincipal: roundMoney(cumulativePrincipal),
    });

    balance = closingBalance;

    // Early termination if loan is paid off
    if (balance <= 0) break;
  }

  // Calculate totals
  const totalPayment = schedule.reduce((sum, row) => sum + row.totalPayment, 0);
  const effectiveTermPeriods = schedule.length;

  // Calculate effective annual rate (simplified)
  const effectiveAnnualRate = Math.pow(1 + periodicRate, periodsPerYear) - 1;

  return {
    principal,
    totalInterest: roundMoney(totalInterest),
    totalPayment: roundMoney(totalPayment),
    totalPrepayments: roundMoney(totalPrepayments),
    numberOfPayments: schedule.length,
    effectiveTermPeriods,
    typicalPayment: schedule.length > 0 ? schedule[0].scheduledPayment : 0,
    effectiveAnnualRate,
    schedule,
  };
}

// ============================================================================
// Quick Loan Calculation Functions
// ============================================================================

/**
 * Calculate periodic payment for an annuity loan
 */
export function calculateLoanPayment(
  principal: number,
  annualRate: number,
  termPeriods: number,
  interval: LoanPaymentInterval = "month",
): number {
  const periodsPerYear = getPeriodsPerYear(interval);
  const periodicRate = annualRate / periodsPerYear;
  return calculateAnnuityPayment(principal, periodicRate, termPeriods);
}

/**
 * Calculate total interest for an annuity loan
 */
export function calculateLoanTotalInterest(
  principal: number,
  annualRate: number,
  termPeriods: number,
  interval: LoanPaymentInterval = "month",
): number {
  const payment = calculateLoanPayment(
    principal,
    annualRate,
    termPeriods,
    interval,
  );
  const totalPayment = payment * termPeriods;
  return roundMoney(totalPayment - principal);
}

/**
 * Calculate how much principal you can afford given a payment
 */
export function calculateAffordablePrincipal(
  payment: number,
  annualRate: number,
  termPeriods: number,
  interval: LoanPaymentInterval = "month",
): number {
  const periodsPerYear = getPeriodsPerYear(interval);
  const periodicRate = annualRate / periodsPerYear;

  if (periodicRate === 0) {
    return payment * termPeriods;
  }

  const factor = Math.pow(1 + periodicRate, termPeriods);
  const principal = (payment * (factor - 1)) / (periodicRate * factor);
  return roundMoney(principal);
}

/**
 * Calculate the term needed to pay off a loan
 */
export function calculateLoanTermPeriods(
  principal: number,
  annualRate: number,
  payment: number,
  interval: LoanPaymentInterval = "month",
): number {
  const periodsPerYear = getPeriodsPerYear(interval);
  const periodicRate = annualRate / periodsPerYear;

  if (periodicRate === 0) {
    return Math.ceil(principal / payment);
  }

  // Check if payment is sufficient to cover interest
  const periodicInterest = principal * periodicRate;
  if (payment <= periodicInterest) {
    return Infinity; // Loan will never be paid off
  }

  // n = -log(1 - (P * r) / PMT) / log(1 + r)
  const n =
    -Math.log(1 - (principal * periodicRate) / payment) /
    Math.log(1 + periodicRate);
  return Math.ceil(n);
}

/**
 * Calculate the interest rate given principal, payment, and term
 * Uses Newton-Raphson method
 */
export function calculateLoanInterestRate(
  principal: number,
  payment: number,
  termPeriods: number,
  interval: LoanPaymentInterval = "month",
  maxIterations: number = 100,
  tolerance: number = 0.0000001,
): number {
  const periodsPerYear = getPeriodsPerYear(interval);

  // Initial guess
  let rate = 0.05 / periodsPerYear; // 5% annual as starting point

  for (let i = 0; i < maxIterations; i++) {
    const factor = Math.pow(1 + rate, termPeriods);
    const f = (principal * (rate * factor)) / (factor - 1) - payment;

    // Derivative
    const df =
      principal *
      ((factor * (1 + rate * termPeriods) - rate * termPeriods * factor) /
        Math.pow(factor - 1, 2));

    const newRate = rate - f / df;

    if (Math.abs(newRate - rate) < tolerance) {
      return newRate * periodsPerYear; // Return annual rate
    }

    rate = newRate;

    // Bounds checking
    if (rate < 0) rate = 0.0001;
    if (rate > 1) rate = 1;
  }

  return rate * periodsPerYear;
}

/**
 * Calculate savings from prepayments
 */
export function calculatePrepaymentSavings(
  principal: number,
  annualRate: number,
  termPeriods: number,
  prepayments: Prepayment[],
  interval: LoanPaymentInterval = "month",
): { interestSaved: number; termReduction: number } {
  // Calculate without prepayments
  const withoutPrepayments = calculateLoanSchedule({
    loanType: "ANNUITY",
    principal,
    annualInterestRate: annualRate,
    termPeriods,
    paymentInterval: interval,
    startDate: new Date(),
  });

  // Calculate with prepayments
  const withPrepayments = calculateLoanSchedule({
    loanType: "ANNUITY",
    principal,
    annualInterestRate: annualRate,
    termPeriods,
    paymentInterval: interval,
    startDate: new Date(),
    prepayments,
  });

  return {
    interestSaved: roundMoney(
      withoutPrepayments.totalInterest - withPrepayments.totalInterest,
    ),
    termReduction:
      withoutPrepayments.effectiveTermPeriods -
      withPrepayments.effectiveTermPeriods,
  };
}
