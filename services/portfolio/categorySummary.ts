/**
 * Value, cost basis and unrealised P/L of a set of holdings, under one
 * policy shared by the category queries, the category hooks, the vault
 * summary and the server-side net worth:
 *
 * - value counts every holding;
 * - cost and P/L count only the holdings with a known cost basis, so a
 *   holding without one (a transfer-in, a Bitpanda wallet) is neither free
 *   profit nor a zero-cost position;
 * - `coverage` says which share of the value the cost basis covers.
 *
 * Framework-free: imported by Convex functions, React hooks and vitest.
 */

import {
  costLine,
  sumCostCoveredValue,
  type HoldingValuation,
} from "./unrealizedProfitLoss";
import { BASE_CURRENCY, toBase, type FxRates } from "../finance/currency";
import {
  getPaymentsPerYear,
  type LoanPaymentFrequency,
} from "../finance/loanScheduleService";

export type { HoldingValuation };

export interface HoldingsSummary {
  /** Value of all holdings */
  value: number;
  /** Number of holdings */
  count: number;
  /** Cost basis of the holdings that have one; null when none has */
  costBasis: number | null;
  /** Value of the holdings that have a cost basis */
  coveredValue: number;
  /** coveredValue − costBasis; null when no holding has a cost basis */
  profitLoss: number | null;
  /** profitLoss / costBasis × 100; null when costBasis is not positive */
  profitLossPercent: number | null;
  /** coveredValue / value (0..1); null when value is not positive */
  coverage: number | null;
}

export function summarizeHoldings(
  holdings: HoldingValuation[],
): HoldingsSummary {
  const value = holdings.reduce((sum, h) => sum + h.value, 0);
  const withCost = holdings.filter(
    (h): h is { value: number; costBasis: number } => h.costBasis != null,
  );
  const coveredValue = sumCostCoveredValue(withCost);
  const costBasis =
    withCost.length > 0
      ? withCost.reduce((sum, h) => sum + h.costBasis, 0)
      : null;
  const profitLoss = costBasis === null ? null : coveredValue - costBasis;

  return {
    value,
    count: holdings.length,
    costBasis,
    coveredValue,
    profitLoss,
    profitLossPercent: percentOf(profitLoss, costBasis),
    coverage: value > 0 ? coveredValue / value : null,
  };
}

function percentOf(part: number | null, whole: number | null): number | null {
  return part !== null && whole !== null && whole > 0
    ? (part / whole) * 100
    : null;
}

// ═══════════════════════════════════════════════════════════════
// Provider positions
// ═══════════════════════════════════════════════════════════════

/**
 * The fields of a stored provider position (broker or Bitpanda) we read:
 * only the base-currency (EUR) fields stamped at sync time
 * (services/finance/currency.ts), never the native amounts.
 */
export interface PositionLike {
  _id: string;
  symbol?: string;
  name?: string;
  investmentSubcategory?: string;
  /** Value in the base currency (EUR); absent when it has no rate */
  valueInBaseCurrency?: number;
  /** Total cost basis in the base currency, converted with the value's rate */
  costBasisInBaseCurrency?: number;
}

/** A holding normalised for summaries: base-currency value and cost. */
export interface CategoryHolding extends HoldingValuation {
  id: string;
  name: string;
  subcategory: string;
}

/** Value in EUR; 0 for a position that could not be converted. */
export function positionValue(p: PositionLike): number {
  return p.valueInBaseCurrency ?? 0;
}

/** Cost basis in EUR; null without one (or without a rate). */
export function positionCostBasis(p: PositionLike): number | null {
  return p.costBasisInBaseCurrency ?? null;
}

export function positionToHolding(p: PositionLike): CategoryHolding {
  return {
    id: p._id,
    name: p.symbol ?? p.name ?? "Unknown",
    subcategory: p.investmentSubcategory ?? "unknown",
    value: positionValue(p),
    costBasis: positionCostBasis(p),
  };
}

/** A synced provider trade (Bitpanda), its amount in its own currency. */
export interface ProviderTrade {
  /** buy | sell | deposit | withdrawal | transfer | reward | other */
  type: string;
  symbol: string;
  quantity: number;
  /** Fiat amount paid (buy) or received (sell) */
  amount: number;
  currency: string;
  /** ISO 8601, or epoch seconds as a string (see tradeTime) */
  transactionDate: string;
}

/** A symbol's cost book from its trades. */
export interface AverageCost {
  /** EUR cost per unit of the quantity the trades account for */
  perUnit: number;
  /** Units the trades account for: bought plus rewarded, less sold or withdrawn */
  quantity: number;
  /**
   * Cost per unit in the currency every buy in the book was paid in, when
   * that is one currency other than EUR. perUnit converts it at today's
   * rate and so moves with the exchange rate; this does not, so a snapshot
   * flow can be read from it (holdingNetFlow).
   */
  native?: { perUnit: number; currency: string };
}

/** A symbol's running cost book while its trades are replayed. */
interface CostBook {
  quantity: number;
  /** EUR, each buy converted at today's rate */
  cost: number;
  /** Cost by the currency it was paid in */
  native: Map<string, number>;
  /** A buy since the book last emptied has no rate */
  unknown: boolean;
}

/**
 * Time of a trade in ms. Stored dates are ISO 8601, or epoch seconds (or
 * ms) as a string when the provider sent a unix time; unknown is 0.
 */
function tradeTime(date: string): number {
  if (/^\d+(\.\d+)?$/.test(date.trim())) {
    const n = Number(date);
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Cost book in EUR by symbol (upper-case), from the trades replayed in
 * date order: a buy adds its quantity and EUR amount; a reward adds its
 * quantity at zero cost (it is income, so it shows as P/L, never as money
 * put in); a sell removes its quantity at the running average (so the
 * average does not change), and so does a withdrawal (units sent out of
 * Bitpanda are no longer held); selling out starts the book afresh.
 * Deposits and transfers carry no price and are left out (a holding larger
 * than its book is uncovered, see bitpandaCostBasis). A
 * symbol is missing when nothing bought is still held or a buy since the
 * book last emptied has a currency without a rate. A book paid in one
 * foreign currency also keeps its cost in that currency (AverageCost.native);
 * one paid in several keeps only the EUR cost at today's rates, which an
 * exchange rate move shifts.
 */
export function averageCostPerUnit(
  trades: readonly ProviderTrade[],
  toEur: (amount: number, currency: string) => number | null,
): Map<string, AverageCost> {
  const books = new Map<string, CostBook>();
  const ordered = [...trades].sort(
    (a, b) => tradeTime(a.transactionDate) - tradeTime(b.transactionDate),
  );
  for (const t of ordered) {
    if (
      t.type !== "buy" &&
      t.type !== "sell" &&
      t.type !== "reward" &&
      t.type !== "withdrawal"
    ) {
      continue;
    }
    const quantity = Math.abs(t.quantity);
    if (!(quantity > 0)) continue;
    const symbol = t.symbol.toUpperCase();
    const book = books.get(symbol) ?? {
      quantity: 0,
      cost: 0,
      native: new Map<string, number>(),
      unknown: false,
    };
    books.set(symbol, book);
    if (t.type === "buy") {
      const paid = Math.abs(t.amount);
      const currency = t.currency.toUpperCase();
      const eur = toEur(paid, t.currency);
      if (eur === null) book.unknown = true;
      else {
        book.cost += eur;
        book.native.set(currency, (book.native.get(currency) ?? 0) + paid);
      }
      book.quantity += quantity;
    } else if (t.type === "reward") {
      book.quantity += quantity;
    } else if (book.quantity > 0) {
      const sold = Math.min(quantity, book.quantity);
      const kept = 1 - sold / book.quantity;
      book.cost *= kept;
      for (const [currency, paid] of book.native) {
        book.native.set(currency, paid * kept);
      }
      book.quantity -= sold;
      // Sold out: the next buy starts a fresh book, so a buy that could
      // not be priced no longer leaves later ones uncosted
      if (book.quantity <= 1e-12) {
        book.quantity = 0;
        book.cost = 0;
        book.native.clear();
        book.unknown = false;
      }
    }
  }
  const average = new Map<string, AverageCost>();
  for (const [symbol, book] of books) {
    if (!book.unknown && book.quantity > 1e-12 && book.cost > 0) {
      const only = book.native.size === 1 ? [...book.native][0] : undefined;
      average.set(symbol, {
        perUnit: book.cost / book.quantity,
        quantity: book.quantity,
        ...(only && only[0] !== BASE_CURRENCY
          ? { native: { perUnit: only[1] / book.quantity, currency: only[0] } }
          : {}),
      });
    }
  }
  return average;
}

/** Quantity held beyond the trades' that is still rounding (fees, dust). */
const UNTRADED_QUANTITY_TOLERANCE = 0.001;

/** A Bitpanda holding's cost basis (bitpandaCostBasis). */
export interface BitpandaCost {
  /** EUR at today's rates */
  base: number;
  /** In the one foreign currency it was paid in (AverageCost.native) */
  native?: { amount: number; currency: string };
}

/**
 * Cost basis of a Bitpanda holding: the average cost of its symbol times
 * the quantity held. Undefined for fiat wallets (cash), symbols without an
 * average (averageCostPerUnit), and holdings larger than their trades
 * account for: units transferred in have an unknown cost, so the holding is
 * left uncovered rather than costed at the buys' price.
 */
export function bitpandaCostBasis(
  holding: { assetType: string; symbol: string; quantity: number },
  averageCost: ReadonlyMap<string, AverageCost>,
): BitpandaCost | undefined {
  if (holding.assetType === "fiat") return undefined;
  const book = averageCost.get(holding.symbol.toUpperCase());
  if (book === undefined) return undefined;
  if (holding.quantity > book.quantity * (1 + UNTRADED_QUANTITY_TOLERANCE)) {
    return undefined;
  }
  return {
    base: book.perUnit * holding.quantity,
    ...(book.native
      ? {
          native: {
            amount: book.native.perUnit * holding.quantity,
            currency: book.native.currency,
          },
        }
      : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// Accounts and loans
// ═══════════════════════════════════════════════════════════════

/** Bank (Plaid) account balance in EUR; 0 when it could not be converted. */
export function bankAccountValue(account: {
  valueInBaseCurrency?: number;
}): number {
  return account.valueInBaseCurrency ?? 0;
}

/** The stored cash fields of a broker account the readers use. */
export interface BrokerAccountCashLike {
  cash?: number;
  cashValueInBaseCurrency?: number;
  /** Written at sync: "liabilities" for a margin debit, else "cash" */
  cashInvestmentCategory?: string;
}

/** Whether an account's cash is a margin debit (a liability). */
function isMarginDebit(account: BrokerAccountCashLike): boolean {
  return (
    (account.cashInvestmentCategory ??
      ((account.cash ?? 0) < 0 ? "liabilities" : "cash")) === "liabilities"
  );
}

/**
 * Uninvested cash of a broker account in EUR, from the explicit cash the
 * sync stored (services/brokers/snaptradePosition.ts). 0 for a margin
 * debit (see brokerAccountMarginDebt) and for cash without a base value.
 * The account's total balance is never read as cash.
 */
export function brokerAccountCash(account: BrokerAccountCashLike): number {
  if (isMarginDebit(account)) return 0;
  return Math.max(0, account.cashValueInBaseCurrency ?? 0);
}

/**
 * Margin debit of a broker account in EUR, as a positive amount owed:
 * negative account cash, stored as a liabilities/margin-loans balance.
 */
export function brokerAccountMarginDebt(
  account: BrokerAccountCashLike,
): number {
  if (!isMarginDebit(account)) return 0;
  return Math.abs(account.cashValueInBaseCurrency ?? 0);
}

/**
 * Total balance of a broker account in EUR; 0 without a base value (a
 * balance summed across currencies with no rate, see balanceIsMixed).
 */
export function brokerAccountValue(account: {
  balanceInBaseCurrency?: number;
}): number {
  return account.balanceInBaseCurrency ?? 0;
}

/**
 * EUR totals over broker accounts: their balances and their uninvested
 * cash (brokerAccountCash, so a margin debit and the balance never count).
 */
export function brokerAccountTotals(
  accounts: readonly (BrokerAccountCashLike & {
    balanceInBaseCurrency?: number;
  })[],
): { value: number; cash: number } {
  let value = 0;
  let cash = 0;
  for (const account of accounts) {
    value += brokerAccountValue(account);
    cash += brokerAccountCash(account);
  }
  return { value, cash };
}

/**
 * Loan statuses that count as a liability (D1): paid off and refinanced
 * loans do not.
 */
export function loanCountsAsLiability(status: string): boolean {
  return status === "active" || status === "defaulted";
}

/**
 * Outstanding loan balance in EUR, converted at read time by the loan's
 * currency: positive = owed (a negative balance is an overpayment, which
 * the aggregator counts as a small asset). 0 for a loan that does not count
 * (loanCountsAsLiability) or whose currency has no rate (never read 1:1 as
 * EUR).
 */
export function loanBalanceInBase(
  loan: { currentBalance: number; currency: string; status: string },
  rates: FxRates,
): number {
  if (!loanCountsAsLiability(loan.status)) return 0;
  const converted = toBase(loan.currentBalance, loan.currency, rates);
  return converted.ok ? converted.value : 0;
}

/**
 * A loan's scheduled payment as a monthly equivalent in EUR: the payment
 * times its payments per year, divided by 12 (a quarterly 300 is 100 a
 * month). 0 for a loan that does not count or has no rate.
 */
export function loanMonthlyPaymentInBase(
  loan: {
    scheduledPayment: number;
    paymentFrequency: LoanPaymentFrequency;
    currency: string;
    status: string;
  },
  rates: FxRates,
): number {
  if (!loanCountsAsLiability(loan.status)) return 0;
  const monthly =
    (loan.scheduledPayment * getPaymentsPerYear(loan.paymentFrequency)) / 12;
  const converted = toBase(monthly, loan.currency, rates);
  return converted.ok ? converted.value : 0;
}

// ═══════════════════════════════════════════════════════════════
// Category summary
// ═══════════════════════════════════════════════════════════════

export interface CategorySummaryData extends HoldingsSummary {
  bySubcategory: Record<string, HoldingsSummary>;
}

/** Category totals plus the same summary per subcategory. */
export function buildCategorySummary(
  holdings: CategoryHolding[],
): CategorySummaryData {
  const groups = new Map<string, CategoryHolding[]>();
  for (const h of holdings) {
    const group = groups.get(h.subcategory);
    if (group) group.push(h);
    else groups.set(h.subcategory, [h]);
  }
  const bySubcategory: Record<string, HoldingsSummary> = {};
  for (const [subcategory, group] of groups) {
    bySubcategory[subcategory] = summarizeHoldings(group);
  }
  return { ...summarizeHoldings(holdings), bySubcategory };
}

/** Unrealised P/L of one holding; null without a cost basis. */
export function holdingProfitLoss(h: HoldingValuation): {
  profitLoss: number | null;
  profitLossPercent: number | null;
} {
  const profitLoss = h.costBasis != null ? h.value - h.costBasis : null;
  return {
    profitLoss,
    profitLossPercent: percentOf(profitLoss, h.costBasis ?? null),
  };
}

/** The `limit` largest holdings by value. */
export function topHoldings<T extends { value: number }>(
  holdings: T[],
  limit: number,
): T[] {
  return [...holdings].sort((a, b) => b.value - a.value).slice(0, limit);
}

/**
 * Split allocation slices into the ones shown individually and an "other"
 * remainder: a slice is shown when it is at least `thresholdPercent` of the
 * total and fewer than `maxSlices - 1` larger slices are shown already
 * (one slot stays for "other"). Input order is kept; pass it sorted.
 */
export function groupSmallSlices<T extends { value: number }>(
  slices: T[],
  options: { thresholdPercent: number; maxSlices: number },
): { shown: T[]; otherValue: number; total: number } {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const shown: T[] = [];
  let otherValue = 0;
  for (const slice of slices) {
    const percent = total > 0 ? (slice.value / total) * 100 : 0;
    if (
      percent >= options.thresholdPercent &&
      shown.length < options.maxSlices - 1
    ) {
      shown.push(slice);
    } else {
      otherValue += slice.value;
    }
  }
  return { shown, otherValue, total };
}

// ═══════════════════════════════════════════════════════════════
// P/L shown on a category page
// ═══════════════════════════════════════════════════════════════

export type ProfitLossSource = "cost-basis" | "since-tracking";

/**
 * A category's performance since its first snapshot (the performance
 * engine with the "firstPoint" baseline): net of flows when flowAdjusted.
 */
export interface TrackedChange {
  change: number;
  changePercent: number | null;
  /** Timestamp the history starts at */
  since: number;
  flowAdjusted: boolean;
  flowsEstimated: boolean;
}

export interface ResolvedProfitLoss {
  /** The holdings' cost basis; never inferred from a snapshot */
  costBasis: number | null;
  /**
   * The line a chart draws against the category's full value:
   * currentValue − profitLoss, so the chart's gap and the KPI agree even when
   * only some holdings carry a cost basis. Since tracking started it is the
   * value then plus the net flows since. Null when there is no P/L.
   */
  costLine: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  /** Where the figures come from; null when there is no P/L to show */
  source: ProfitLossSource | null;
  /** since-tracking: when the history starts; null otherwise */
  since: number | null;
  /**
   * since-tracking: the figure is net of purchases and deposits. When false
   * (or flowsEstimated) it is shown as a change since tracking started, not
   * as a profit.
   */
  flowAdjusted: boolean;
  flowsEstimated: boolean;
}

/**
 * The one precedence chain for a category's P/L, used for both the KPI card
 * and the chart's cost line (`costLine`) so they never disagree:
 *
 * 1. the holdings' own cost basis (coverage-based, from the summary);
 * 2. otherwise the performance since tracking started, net of flows where
 *    they are known. The first snapshot is never taken as a cost basis:
 *    deposits since then are not profit (D2).
 */
export function resolveCategoryProfitLoss(input: {
  currentValue: number;
  holdings: Pick<
    HoldingsSummary,
    "costBasis" | "profitLoss" | "profitLossPercent"
  > | null;
  sinceTracking: TrackedChange | null;
}): ResolvedProfitLoss {
  const { currentValue, holdings, sinceTracking } = input;

  if (holdings && holdings.costBasis !== null && holdings.profitLoss !== null) {
    return {
      costBasis: holdings.costBasis,
      costLine: costLine(currentValue, holdings.profitLoss),
      profitLoss: holdings.profitLoss,
      profitLossPercent:
        holdings.profitLossPercent ??
        percentOf(holdings.profitLoss, holdings.costBasis),
      source: "cost-basis",
      since: null,
      flowAdjusted: false,
      flowsEstimated: false,
    };
  }

  if (sinceTracking && currentValue > 0) {
    return {
      costBasis: null,
      costLine: costLine(currentValue, sinceTracking.change),
      profitLoss: sinceTracking.change,
      profitLossPercent: sinceTracking.changePercent,
      source: "since-tracking",
      since: sinceTracking.since,
      flowAdjusted: sinceTracking.flowAdjusted,
      flowsEstimated: sinceTracking.flowsEstimated,
    };
  }

  return {
    costBasis: null,
    costLine: null,
    profitLoss: null,
    profitLossPercent: null,
    source: null,
    since: null,
    flowAdjusted: false,
    flowsEstimated: false,
  };
}
