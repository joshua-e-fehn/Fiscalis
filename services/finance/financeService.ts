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
  timeInterval: TimeInterval
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
  interestInterval: TimeInterval = "year"
): Number {
  const priceDifferenceInPercent =
    pointB.capitalValue.valueOf() / pointA.capitalValue.valueOf();
  const timeDifference = pointB.time.getTime() - pointA.time.getTime();
  const timeDifferenceInTimeIntervals = millisecondsToTimeIntervals(
    timeDifference,
    interestInterval
  );
  return (
    Math.pow(priceDifferenceInPercent, 1 / timeDifferenceInTimeIntervals) - 1
  );
}

export function calculateAverageInterest(
  pointA: capitalPointInTime,
  pointB: capitalPointInTime,
  interestInterval: TimeInterval = "year"
): Number {
  const priceDifference =
    pointB.capitalValue.valueOf() - pointA.capitalValue.valueOf();
  const timeDifference = pointB.time.getTime() - pointA.time.getTime();
  const timeDifferenceInTimeIntervals = millisecondsToTimeIntervals(
    timeDifference,
    interestInterval
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
  interestRate: number
): number {
  return Math.log(endCapital / startCapital) / Math.log(1 + interestRate);
}

export function calculateCapitalGainDurationWithInterest(
  startCapital: number,
  endCapital: number,
  interestRate: number
): number {
  return (endCapital - startCapital) / (startCapital * interestRate);
}

export function calculateEndCapitalValueWithCompoundInterest(
  startCapital: number,
  interestRate: number,
  interestIntervalAmount: number
) {
  return startCapital * Math.pow(1 + interestRate, interestIntervalAmount);
}

export function calculateEndCapitalValueWithInterest(
  startCapital: number,
  interestRate: number,
  interestIntervalAmount: number
) {
  return startCapital + startCapital * interestRate * interestIntervalAmount;
}

export function calculateStartCapitalValueWithCompoundInterest(
  endCapital: number,
  interestRate: number,
  interestIntervalAmount: number
) {
  return endCapital / Math.pow(1 + interestRate, interestIntervalAmount);
}

export function calculateStartCapitalValueWithInterest(
  endCapital: number,
  interestRate: number,
  interestIntervalAmount: number
) {
  return endCapital / (1 + interestRate * interestIntervalAmount);
}
