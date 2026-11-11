/**
 * Currency conversion to the base currency (EUR): the one FX path shared by
 * the provider syncs (Plaid accounts, SnapTrade positions and accounts,
 * Bitpanda fiat wallets), the server-side aggregators (net worth, category
 * queries) and the backfill migration.
 *
 * Rates come from the Convex `fxRates` table, a daily mirror of the SQL
 * `currency_exchange_rates` store (USD, CHF) and the ECB euro reference
 * rates (every other ECB currency, GBP included) - see convex/fxRates.ts.
 * A mirrored rate older than FX_MAX_AGE_DAYS is still used but flagged
 * `source: "stale"`. A currency the mirror does not cover falls back to
 * FALLBACK_EUR_PER_UNIT, flagged `source: "fallback"`. A currency in none
 * is an explicit `unknown_currency` result: it never converts at 1.0.
 *
 * Framework-free so the Convex bundle, Next.js and vitest can all import it.
 */

export const BASE_CURRENCY = "EUR";

/** ISO 4217 code for "no currency", stored when a provider reports none. */
export const NO_CURRENCY = "XXX";

// ═══════════════════════════════════════════════════════════════
// Rates
// ═══════════════════════════════════════════════════════════════

/**
 * "market": mirrored or live quote; "stale": a mirrored quote older than
 * FX_MAX_AGE_DAYS (the mirror stopped updating); "fallback": static
 * last-resort table
 */
export type FxRateSource = "market" | "stale" | "fallback";

/** A mirrored rate older than this is flagged "stale". */
export const FX_MAX_AGE_DAYS = 7;
const DAY_MS = 86_400_000;

export interface FxRate {
  /** EUR for one unit of the currency */
  eurPerUnit: number;
  /** Day the rate was observed (YYYY-MM-DD); absent for fallback rates */
  date?: string;
  source: FxRateSource;
}

/** Rates keyed by ISO 4217 code. EUR is implicit (identity). */
export type FxRates = Readonly<Record<string, FxRate>>;

/** One daily row as served by `GET /api/fx/rates/daily` and stored in Convex. */
export interface FxDailyRate {
  /** UTC day, YYYY-MM-DD */
  date: string;
  /** ISO 4217 code */
  currency: string;
  /** Units of the currency per 1 EUR (the SQL store's from_eur_to_xxx) */
  unitsPerEur: number;
}

/**
 * Last-resort rates (EUR per unit), approximate values from January 2025.
 * Used only for currencies the market mirror has no rate for, and every
 * value converted with them is stamped `source: "fallback"`.
 */
const FALLBACK_EUR_PER_UNIT: Readonly<Record<string, number>> = {
  USD: 0.92,
  GBP: 1.19,
  CHF: 1.06,
  JPY: 0.0061,
  CAD: 0.66,
  AUD: 0.59,
  CNY: 0.13,
  HKD: 0.12,
  SGD: 0.69,
  SEK: 0.088,
  NOK: 0.084,
  DKK: 0.134,
  PLN: 0.23,
  CZK: 0.04,
  HUF: 0.0024,
  BRL: 0.15,
  MXN: 0.046,
  INR: 0.011,
  KRW: 0.00065,
  NZD: 0.55,
  ZAR: 0.051,
  TRY: 0.026,
  ILS: 0.25,
  AED: 0.25,
  THB: 0.027,
  TWD: 0.029,
  RUB: 0.0092,
};

export const FALLBACK_FX_RATES: FxRates = Object.fromEntries(
  Object.entries(FALLBACK_EUR_PER_UNIT).map(([code, eurPerUnit]) => [
    code,
    { eurPerUnit, source: "fallback" as const },
  ]),
);

/**
 * Currencies the ECB publishes euro reference rates for (the daily EXR
 * series); the mirror fills them from the ECB data API.
 */
export const ECB_CURRENCIES: readonly string[] = [
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "GBP", "HKD",
  "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR", "NOK",
  "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
];

/** Every currency the mirror may hold a rate for (latest row read per code). */
export const MIRRORED_CURRENCIES: readonly string[] = [
  ...new Set([...ECB_CURRENCIES, ...Object.keys(FALLBACK_EUR_PER_UNIT)]),
].sort();

/**
 * Rate table from daily rows: the latest row per currency as a market rate,
 * over the fallback table for every currency the rows do not cover. Given
 * `now`, a latest row older than FX_MAX_AGE_DAYS is flagged "stale".
 */
export function fxRatesFromDaily(
  rows: readonly FxDailyRate[],
  now?: number,
): FxRates {
  const staleBefore =
    now === undefined
      ? undefined
      : new Date(now - FX_MAX_AGE_DAYS * DAY_MS).toISOString().slice(0, 10);
  const latest = new Map<string, FxDailyRate>();
  for (const row of rows) {
    const code = normalizeCurrency(row.currency)?.code;
    if (!code || !(row.unitsPerEur > 0)) continue;
    const seen = latest.get(code);
    if (!seen || row.date > seen.date) latest.set(code, row);
  }
  const rates: Record<string, FxRate> = { ...FALLBACK_FX_RATES };
  for (const [code, row] of latest) {
    rates[code] = {
      eurPerUnit: 1 / row.unitsPerEur,
      date: row.date,
      source:
        staleBefore !== undefined && row.date < staleBefore
          ? "stale"
          : "market",
    };
  }
  return rates;
}

/** `rates` with a market rate for one currency added or replaced. */
export function withMarketRate(
  rates: FxRates,
  currency: string,
  eurPerUnit: number,
  date?: string,
): FxRates {
  const code = normalizeCurrency(currency)?.code;
  if (!code || code === BASE_CURRENCY || !(eurPerUnit > 0)) return rates;
  return { ...rates, [code]: { eurPerUnit, date, source: "market" } };
}

/**
 * Validate a `GET /api/fx/rates/daily` payload into rows, dropping malformed
 * ones. Returns [] for anything that is not the expected shape.
 */
export function parseFxDailyRates(payload: unknown): FxDailyRate[] {
  const list =
    payload && typeof payload === "object" && "rates" in payload
      ? (payload as { rates: unknown }).rates
      : null;
  if (!Array.isArray(list)) return [];
  const rows: FxDailyRate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { date, currency, unitsPerEur } = item as Record<string, unknown>;
    const rate =
      typeof unitsPerEur === "string" ? Number(unitsPerEur) : unitsPerEur;
    if (
      typeof date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      typeof currency === "string" &&
      /^[A-Z]{3}$/.test(currency) &&
      currency !== BASE_CURRENCY &&
      typeof rate === "number" &&
      Number.isFinite(rate) &&
      rate > 0
    ) {
      rows.push({ date, currency, unitsPerEur: rate });
    }
  }
  return rows;
}

/**
 * Rows from an ECB data API CSV response (`/service/data/EXR/D..EUR.SP00.A
 * ?format=csvdata`): one row per currency and day, OBS_VALUE being units of
 * the currency per 1 EUR. Columns are found by header name; malformed rows
 * and missing observations are dropped.
 */
export function parseEcbCsv(csv: string): FxDailyRate[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const iCurrency = col("CURRENCY");
  const iDenom = col("CURRENCY_DENOM");
  const iDate = col("TIME_PERIOD");
  const iValue = col("OBS_VALUE");
  if (iCurrency < 0 || iDate < 0 || iValue < 0) return [];

  return parseFxDailyRates({
    rates: lines.slice(1).flatMap((line) => {
      const cells = splitCsvLine(line);
      if (iDenom >= 0 && cells[iDenom] !== BASE_CURRENCY) return [];
      return [
        {
          date: cells[iDate],
          currency: cells[iCurrency],
          unitsPerEur: cells[iValue],
        },
      ];
    }),
  });
}

/** One CSV line into cells, honouring double-quoted cells ("" escapes). */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/**
 * Daily rows from two sources: every `primary` row, plus the `secondary`
 * rows for (day, currency) pairs the primary does not have. The SQL store
 * is primary for USD/CHF; the ECB fills every other currency and any day
 * the SQL store missed.
 */
export function mergeFxDailyRates(
  primary: readonly FxDailyRate[],
  secondary: readonly FxDailyRate[],
): FxDailyRate[] {
  const seen = new Set(primary.map((r) => `${r.date}|${r.currency}`));
  return [
    ...primary,
    ...secondary.filter((r) => !seen.has(`${r.date}|${r.currency}`)),
  ];
}

/**
 * [from, to] (YYYY-MM-DD, inclusive) as consecutive windows of at most
 * `maxDays` days, so a long backfill is fetched in requests the source
 * accepts.
 */
export function dayWindows(
  from: string,
  to: string,
  maxDays: number,
): Array<{ from: string; to: string }> {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const end = Date.parse(to);
  const windows: Array<{ from: string; to: string }> = [];
  for (let start = Date.parse(from); start <= end; ) {
    const stop = Math.min(start + (maxDays - 1) * DAY_MS, end);
    windows.push({ from: iso(start), to: iso(stop) });
    start = stop + DAY_MS;
  }
  return windows;
}

// ═══════════════════════════════════════════════════════════════
// Currency codes
// ═══════════════════════════════════════════════════════════════

/**
 * Minor-unit quote codes some exchanges use (LSE prices in pence, JSE in
 * cents, TASE in agorot), mapped to the major currency; amounts are 1/100.
 */
const MINOR_UNIT_CODES: Readonly<Record<string, string>> = {
  GBX: "GBP",
  ZAC: "ZAR",
  ILA: "ILS",
};
/** Mixed-case spellings of the same quotes: "GBp" is pence, "GBP" pounds */
const MINOR_UNIT_ALIASES: Readonly<Record<string, string>> = {
  GBp: "GBX",
  ZAc: "ZAC",
};

/**
 * The ISO code an amount is in and the divisor to its major unit, or null
 * when the code is missing, malformed or "XXX" (ISO 4217 "no currency").
 * "GBp"/"GBX" (pence) become GBP with divisor 100; "GBP" stays pounds.
 */
export function normalizeCurrency(
  currency: string | null | undefined,
): { code: string; divisor: number } | null {
  const raw = currency?.trim();
  if (!raw) return null;
  const code = MINOR_UNIT_ALIASES[raw] ?? raw.toUpperCase();
  const major = MINOR_UNIT_CODES[code];
  if (major) return { code: major, divisor: 100 };
  if (!/^[A-Z]{3}$/.test(code) || code === NO_CURRENCY) return null;
  return { code, divisor: 1 };
}

// ═══════════════════════════════════════════════════════════════
// Conversion
// ═══════════════════════════════════════════════════════════════

export type FxConversion =
  | {
      ok: true;
      /** Amount in EUR */
      value: number;
      /** EUR per unit of the amount as given (minor units included) */
      rate: number;
      /** Day of the rate; absent for identity and fallback rates */
      rateDate?: string;
      source: "identity" | FxRateSource;
    }
  | {
      ok: false;
      /** missing_currency: none given or "XXX"; unknown_currency: no rate */
      reason: "missing_currency" | "unknown_currency";
    };

export function toBase(
  amount: number,
  currency: string | null | undefined,
  rates: FxRates,
): FxConversion {
  const normalized = normalizeCurrency(currency);
  if (!normalized) {
    const raw = currency?.trim();
    return {
      ok: false,
      reason:
        !raw || raw.toUpperCase() === NO_CURRENCY
          ? "missing_currency"
          : "unknown_currency",
    };
  }
  const { code, divisor } = normalized;
  if (code === BASE_CURRENCY) {
    const rate = 1 / divisor;
    return { ok: true, value: amount * rate, rate, source: "identity" };
  }
  const fx = rates[code];
  if (!fx) return { ok: false, reason: "unknown_currency" };
  const rate = fx.eurPerUnit / divisor;
  return {
    ok: true,
    value: amount * rate,
    rate,
    ...(fx.date ? { rateDate: fx.date } : {}),
    source: fx.source,
  };
}

// ═══════════════════════════════════════════════════════════════
// Base-currency fields stamped on provider documents at sync time
// ═══════════════════════════════════════════════════════════════

/** How a stored base-currency value was obtained; "unknown": not converted */
export type ExchangeRateSource = "identity" | FxRateSource | "unknown";

interface RateStamp {
  exchangeRateDate?: string;
  exchangeRateSource: ExchangeRateSource;
  baseCurrency: string;
}

function rateOf(
  currency: string | null | undefined,
  rates: FxRates,
): { rate?: number; stamp: RateStamp } {
  const conversion = toBase(1, currency, rates);
  if (!conversion.ok) {
    return {
      stamp: { exchangeRateSource: "unknown", baseCurrency: BASE_CURRENCY },
    };
  }
  return {
    rate: conversion.rate,
    stamp: {
      exchangeRateDate: conversion.rateDate,
      exchangeRateSource: conversion.source,
      baseCurrency: BASE_CURRENCY,
    },
  };
}

const times = (amount: number | undefined, rate: number | undefined) =>
  amount === undefined || rate === undefined ? undefined : amount * rate;

/**
 * Base-currency fields of a broker position: value, cost basis and
 * unrealised P/L converted with one rate (P/L = value − cost in EUR).
 * Fields are undefined, so a patch clears stale values, when the currency
 * has no rate or the native amount is absent.
 */
export function positionBaseFields(
  position: {
    marketValue?: number;
    totalCostBasis?: number;
    currency: string;
  },
  rates: FxRates,
) {
  const { rate, stamp } = rateOf(position.currency, rates);
  const valueInBaseCurrency = times(position.marketValue, rate);
  const costBasisInBaseCurrency = times(position.totalCostBasis, rate);
  return {
    valueInBaseCurrency,
    costBasisInBaseCurrency,
    unrealizedPLInBaseCurrency:
      valueInBaseCurrency !== undefined && costBasisInBaseCurrency !== undefined
        ? valueInBaseCurrency - costBasisInBaseCurrency
        : undefined,
    exchangeRateUsed: rate,
    // Deprecated; cleared so a restamped row carries no stale timestamp
    exchangeRateTimestamp: undefined,
    ...stamp,
  };
}

/** Base-currency fields of a bank (Plaid) account balance. */
export function bankAccountBaseFields(
  account: { currentBalance?: number; currency: string },
  rates: FxRates,
) {
  const { rate, stamp } = rateOf(account.currency, rates);
  return {
    valueInBaseCurrency: times(account.currentBalance, rate),
    exchangeRateUsed: rate,
    // Deprecated; cleared so a restamped row carries no stale timestamp
    exchangeRateTimestamp: undefined,
    ...stamp,
  };
}

/**
 * Base-currency fields of a broker account's total balance and cash, in
 * `balanceCurrency` when the provider reported one, else `currency`.
 * `balanceIsMixed`: the balance is a sum over holdings in several
 * currencies (no provider total), so it gets no base value.
 */
export function brokerAccountBaseFields(
  account: {
    balance?: number;
    cash?: number;
    currency: string;
    balanceCurrency?: string;
  },
  rates: FxRates,
  options: { balanceIsMixed?: boolean } = {},
) {
  const { rate, stamp } = rateOf(
    account.balanceCurrency ?? account.currency,
    rates,
  );
  return {
    balanceInBaseCurrency: options.balanceIsMixed
      ? undefined
      : times(account.balance, rate),
    cashValueInBaseCurrency: times(account.cash, rate),
    cashExchangeRateUsed: rate,
    exchangeRateDate: stamp.exchangeRateDate,
    exchangeRateSource: stamp.exchangeRateSource,
  };
}

// ═══════════════════════════════════════════════════════════════
// Rows written before the base-currency fields existed
// ═══════════════════════════════════════════════════════════════

/*
 * A row without `exchangeRateSource` was stored before sync-time stamping
 * (or before migrations:backfillBaseCurrencyFields ran). Its base fields are
 * missing or come from the retired hardcoded table, so readers stamp it at
 * read time with the current rates instead of counting it as 0. A row with
 * a source - "unknown" included - is returned as stored.
 */

type Stamped = { exchangeRateSource?: ExchangeRateSource };

export function positionWithBaseFields<
  T extends Stamped & {
    marketValue?: number;
    totalCostBasis?: number;
    currency: string;
  },
>(position: T, rates: FxRates): T {
  return position.exchangeRateSource !== undefined
    ? position
    : { ...position, ...positionBaseFields(position, rates) };
}

export function bankAccountWithBaseFields<
  T extends Stamped & { currentBalance?: number; currency: string },
>(account: T, rates: FxRates): T {
  return account.exchangeRateSource !== undefined
    ? account
    : { ...account, ...bankAccountBaseFields(account, rates) };
}

export function brokerAccountWithBaseFields<
  T extends Stamped & {
    balance?: number;
    cash?: number;
    currency: string;
    balanceCurrency?: string;
  },
>(account: T, rates: FxRates): T {
  return account.exchangeRateSource !== undefined
    ? account
    : { ...account, ...brokerAccountBaseFields(account, rates) };
}
