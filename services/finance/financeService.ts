// TODO: Protect from rounding errors / floating point errors by using a BigNumber library
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365.25; // Average number of days per year considering leap years
const DAYS_PER_WEEK = 7;
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;
const MS_PER_HOUR = MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;
const MS_PER_WEEK = MS_PER_DAY * DAYS_PER_WEEK;
const MS_PER_YEAR = MS_PER_DAY * DAYS_PER_YEAR;
const MS_PER_MONTH = MS_PER_YEAR / MONTHS_PER_YEAR;

export type PeriodDuration =
  | "Hour"
  | "Day"
  | "Week"
  | "Month"
  | "Year"
  | "YTD"
  | "ALL";

export function getTimePeriodInMilliseconds(periodDuration: PeriodDuration) {
  const localNow = new Date();
  const localStartOf2025 = new Date(2025, 0, 1); // January 1, 2025
  const standardNow = new Date(
    localNow.getTime() + localNow.getTimezoneOffset() * 60000
  );
  const standardStartOf2025 = new Date(
    localStartOf2025.getTime() + localStartOf2025.getTimezoneOffset() * 60000
  );
  const localStartOfYear = new Date(localNow.getFullYear(), 0, 1);
  const standardStartOfYear = new Date(
    localStartOfYear.getTime() + localStartOfYear.getTimezoneOffset() * 60000
  );

  switch (periodDuration) {
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
    case "YTD":
      return standardNow.getTime() - standardStartOfYear.getTime();
    case "ALL":
      return standardNow.getTime() - standardStartOf2025.getTime();
    default:
      return MS_PER_YEAR;
  }
}

function millisecondsToPeriodDuration(
  milliseconds: number,
  periodDuration: PeriodDuration
): number {
  switch (periodDuration) {
    case "Month":
      return (milliseconds / MS_PER_YEAR) * MONTHS_PER_YEAR;
    case "Week":
      return ((milliseconds / MS_PER_YEAR) * DAYS_PER_YEAR) / DAYS_PER_WEEK;
    case "Day":
      return (milliseconds / MS_PER_YEAR) * DAYS_PER_YEAR;
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
  interestPeriodDuration?: PeriodDuration
): Number {
  const priceDifferenceInPercent =
    pointB.capitalValue.valueOf() / pointA.capitalValue.valueOf();
  const timeDifference = pointB.time.getTime() - pointA.time.getTime();
  let timeDifferenceInPeriodDuration;
  switch (interestPeriodDuration) {
    case "Month":
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Month"
      );
      break;
    case "Week":
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Week"
      );
      break;
    case "Day":
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Day"
      );
      break;
    default:
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Year"
      );
      break;
  }
  return (
    Math.pow(priceDifferenceInPercent, 1 / timeDifferenceInPeriodDuration) - 1
  );
}

export function calculateAverageInterest(
  pointA: capitalPointInTime,
  pointB: capitalPointInTime,
  interestPeriodDuration?: PeriodDuration
): Number {
  const priceDifference =
    pointB.capitalValue.valueOf() - pointA.capitalValue.valueOf();
  const timeDifference = pointB.time.getTime() - pointA.time.getTime();
  let timeDifferenceInPeriodDuration;
  switch (interestPeriodDuration) {
    case "Month":
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Month"
      );
      break;
    case "Week":
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Week"
      );
      break;
    case "Day":
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Day"
      );
      break;
    default:
      timeDifferenceInPeriodDuration = millisecondsToPeriodDuration(
        timeDifference,
        "Year"
      );
      break;
  }
  return (
    priceDifference /
    pointA.capitalValue.valueOf() /
    timeDifferenceInPeriodDuration
  );
}

export function calculateCapitalGainDurationWithCompoundInterest(
  startCapital: number,
  endCapital: number,
  interestRate: number,
  interestPeriodDuration?: PeriodDuration
): number {
  return Math.log(endCapital - startCapital) / Math.log(1 + interestRate);
}

export function calculateCapitalGainDurationWithInterest(
  startCapital: number,
  endCapital: number,
  interestRate: number,
  interestPeriodDuration?: PeriodDuration
): number {
  return (endCapital - startCapital) / (startCapital * interestRate);
}

export function calculateEndCapitalValueWithCompoundInterest(
  startCapital: number,
  interestRate: number,
  interestPeriodAmount: number,
  interestPeriodDuration?: PeriodDuration
) {
  return startCapital * Math.pow(1 + interestRate, interestPeriodAmount);
}

export function calculateEndCapitalValueWithInterest(
  startCapital: number,
  interestRate: number,
  interestPeriodAmount: number,
  interestPeriodDuration?: PeriodDuration
) {
  return startCapital + startCapital * interestRate * interestPeriodAmount;
}

export function calculateStartCapitalValueWithCompoundInterest(
  endCapital: number,
  interestRate: number,
  interestPeriodAmount: number,
  interestPeriodDuration?: PeriodDuration
) {
  return endCapital / Math.pow(1 + interestRate, interestPeriodAmount);
}

export function calculateStartCapitalValueWithInterest(
  endCapital: number,
  interestRate: number,
  interestPeriodAmount: number,
  interestPeriodDuration?: PeriodDuration
) {
  return endCapital / (1 + interestRate * interestPeriodAmount);
}
