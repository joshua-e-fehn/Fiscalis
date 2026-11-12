// TODO: Protect from rounding errors / floating point errors by using a BigNumber library

// ═══════════════════════════════════════════════════════════════
// Time Constants (exported for reuse in performance calculations)
// ═══════════════════════════════════════════════════════════════

export const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365.25; // Average number of days per year considering leap years
const DAYS_PER_WEEK = 7;
const WEEKS_PER_YEAR = 52.178571428571429;
const MONTHS_PER_YEAR = 12.175;
const QUARTER_PER_YEAR = 4;
export const MS_PER_MINUTE = 60000;
export const MS_PER_HOUR = 3600000;
export const MS_PER_DAY = 86400000;
export const MS_PER_WEEK = 604800000;
export const MS_PER_YEAR = 31557600000;
export const MS_PER_MONTH = 2592000000;
export const MS_PER_QUARTER = MS_PER_YEAR / QUARTER_PER_YEAR;

// Extended time constants for performance calculations
export const MS_PER_3_MONTHS = MS_PER_MONTH * 3;
export const MS_PER_6_MONTHS = MS_PER_MONTH * 6;
export const MS_PER_3_YEARS = MS_PER_YEAR * 3;
export const MS_PER_5_YEARS = MS_PER_YEAR * 5;

/**
 * Convenience object for millisecond constants
 * Provides a namespace for all time-related millisecond values
 */
export const MS = {
  SECOND: MS_PER_SECOND,
  MINUTE: MS_PER_MINUTE,
  HOUR: MS_PER_HOUR,
  DAY: MS_PER_DAY,
  WEEK: MS_PER_WEEK,
  MONTH: MS_PER_MONTH,
  QUARTER: MS_PER_QUARTER,
  YEAR: MS_PER_YEAR,
  "3_MONTHS": MS_PER_3_MONTHS,
  "6_MONTHS": MS_PER_6_MONTHS,
  "3_YEARS": MS_PER_3_YEARS,
  "5_YEARS": MS_PER_5_YEARS,
} as const;

export type TimeRange =
  | "Hour"
  | "Day"
  | "Week"
  | "Month"
  | "3Month"
  | "6Month"
  | "Year"
  | "3Year"
  | "5Year"
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
    case "3Month":
      return MS_PER_3_MONTHS;
    case "6Month":
      return MS_PER_6_MONTHS;
    case "Year":
      return MS_PER_YEAR;
    case "3Year":
      return MS_PER_3_YEARS;
    case "5Year":
      return MS_PER_5_YEARS;
    case "YTD": {
      // Time from start of year until now in UTC
      const currentYear = now.getUTCFullYear();
      const startOfYearUTC = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
      return now.getTime() - startOfYearUTC.getTime();
    }
    case "ALL": {
      // From January 1, 2024 (UTC) until now (platform launch)
      const startOf2024UTC = new Date(Date.UTC(2024, 0, 1, 0, 0, 0, 0));
      return now.getTime() - startOf2024UTC.getTime();
    }
    default:
      return MS_PER_DAY; // Default to 1 day
  }
}

/**
 * Get the start timestamp for a given time range
 * @param now - Reference time the range ends at (default: Date.now())
 * @returns Unix timestamp in milliseconds
 */
export function getTimeRangeStartTimestamp(
  timeRange: TimeRange,
  now: number = Date.now(),
): number {

  switch (timeRange) {
    case "Hour":
      return now - MS_PER_HOUR;
    case "Day":
      return now - MS_PER_DAY;
    case "Week":
      return now - MS_PER_WEEK;
    case "Month":
      return now - MS_PER_MONTH;
    case "3Month":
      return now - MS_PER_3_MONTHS;
    case "6Month":
      return now - MS_PER_6_MONTHS;
    case "Year":
      return now - MS_PER_YEAR;
    case "3Year":
      return now - MS_PER_3_YEARS;
    case "5Year":
      return now - MS_PER_5_YEARS;
    case "YTD": {
      const currentYear = new Date(now).getUTCFullYear();
      return new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0)).getTime();
    }
    case "ALL":
      // Platform launch date
      return new Date(Date.UTC(2024, 0, 1, 0, 0, 0, 0)).getTime();
    default:
      return now - MS_PER_DAY;
  }
}

/**
 * Get the recommended aggregation interval for a time range
 * Used for chart data point density
 */
export function getDefaultIntervalForRange(timeRange: TimeRange): TimeInterval {
  switch (timeRange) {
    case "Hour":
      return "minute";
    case "Day":
      return "hour";
    case "Week":
    case "Month":
    case "3Month":
      return "day";
    case "6Month":
    case "Year":
    case "YTD":
      return "day"; // Could be "week" for performance optimization
    case "3Year":
    case "5Year":
    case "ALL":
      return "week"; // Or "month" for very long ranges
    default:
      return "day";
  }
}

// ═══════════════════════════════════════════════════════════════
// Price history windows (one fetch per metal, sliced per range)
// ═══════════════════════════════════════════════════════════════

const ALL_TIME_RANGES: readonly TimeRange[] = [
  "Hour",
  "Day",
  "Week",
  "Month",
  "3Month",
  "6Month",
  "Year",
  "3Year",
  "5Year",
  "YTD",
  "ALL",
];

/**
 * How far before a range's start prices are needed, so the start takes the
 * last close at or before it (31 Dec for YTD, Friday over a weekend).
 */
export const PRICE_LOOKBACK_MS = 7 * MS_PER_DAY;

export interface PriceHistoryWindow {
  /** Aggregation interval: the range's default interval */
  interval: TimeInterval;
  /** Fetch start (ms): a UTC midnight, so it is stable within a day */
  from: number;
}

/**
 * The one price-history fetch that serves a range: every range with the
 * same default interval shares it, so it starts at the widest of their
 * starts less PRICE_LOOKBACK_MS, floored to UTC midnight (the same window
 * all day). Callers slice it with sliceFrom instead of fetching each range.
 */
export function priceHistoryWindow(
  timeRange: TimeRange,
  now: number = Date.now(),
): PriceHistoryWindow {
  const interval = getDefaultIntervalForRange(timeRange);
  // Starts measured from today's UTC midnight lie at or before the real
  // ones, and do not move during the day
  const today = utcMidnight(now);
  const widestStart = Math.min(
    ...ALL_TIME_RANGES.filter(
      (r) => getDefaultIntervalForRange(r) === interval,
    ).map((r) => getTimeRangeStartTimestamp(r, today)),
  );
  return { interval, from: utcMidnight(widestStart - PRICE_LOOKBACK_MS) };
}

function utcMidnight(ms: number): number {
  return ms - (((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY);
}

/** The points at or after `from` (ms), in their order. */
export function sliceFrom<T extends { timestamp: number }>(
  points: readonly T[],
  from: number,
): T[] {
  return points.filter((p) => p.timestamp >= from);
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
// Money & annuity primitives (the loan engine lives in loanScheduleService.ts)
// ============================================================================

/**
 * Round to 2 decimal places (cents)
 */
export function roundMoney(value: number): number {
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
    return roundMoney(principal / numberOfPeriods);
  }

  const factor = Math.pow(1 + periodicRate, numberOfPeriods);
  const payment = (principal * (periodicRate * factor)) / (factor - 1);
  return roundMoney(payment);
}
