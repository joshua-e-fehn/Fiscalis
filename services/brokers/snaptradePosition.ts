/**
 * Pure mapping of a SnapTrade holdings response (positions, option
 * positions, cash balances, account total) into what Fiscalis stores.
 *
 * Kept framework- and SDK-free so they can be unit-tested here and bundled
 * into Convex functions: the one SnapTrade sync in
 * frontend/convex/actions/snaptrade.ts maps a response with
 * mapSnaptradeHoldings, and brokers.replaceAccountHoldings derives the
 * account's balance and cash with snaptradeAccountFields.
 *
 * SDK shape (snaptrade-typescript-sdk 9.x, models/position.d.ts,
 * position-symbol.d.ts, universal-symbol.d.ts):
 *
 *   Position.symbol         -> PositionSymbol (account-scoped, mostly deprecated)
 *   Position.symbol.symbol  -> UniversalSymbol { symbol, description,
 *                              currency: { code }, type: { code }, figi_code }
 *   Position.currency       -> { code } — the currency `price` is quoted in
 *
 * The ticker, type, currency and FIGI live on the UniversalSymbol, one level
 * below `position.symbol`. Reading them from `position.symbol` yields the
 * object itself as the ticker ("[object Object]"), type "other" and USD.
 */

import {
  toBase,
  type FxRates,
} from "../finance/currency";

/**
 * SnapTrade SecurityType.code values (models/security-type.d.ts):
 * ad ADR, bnd Bond, cs Common Stock, cef Closed End Fund, crypto,
 * et ETF, oef Open Ended Fund, pm Precious Metals, ps Preferred Stock,
 * rt Right, struct Structured Product, ut Unit, wi When Issued, wt Warrant.
 * Long names are kept for older payloads and other callers.
 */
const ASSET_TYPE_MAP: Record<string, string> = {
  // SnapTrade security-type codes
  cs: "equity",
  ad: "equity",
  ps: "equity",
  et: "etf",
  oef: "mutual_fund",
  cef: "mutual_fund",
  bnd: "bond",
  pm: "precious_metal",
  crypto: "cryptocurrency",
  rt: "other",
  wt: "other",
  ut: "other",
  struct: "other",
  wi: "other",
  // Long names
  equity: "equity",
  stock: "equity",
  etf: "etf",
  mutual_fund: "mutual_fund",
  bond: "bond",
  option: "option",
  cryptocurrency: "cryptocurrency",
  forex: "forex",
  fx: "forex",
  future: "futures",
  futures: "futures",
};

/**
 * Normalize a SnapTrade security type code to the brokerPositions.assetType
 * vocabulary: equity | etf | mutual_fund | bond | option | cryptocurrency |
 * forex | futures | precious_metal | other.
 */
export function normalizeAssetType(
  snaptradeType: string | undefined | null,
): string {
  if (!snaptradeType) return "other";
  const normalized = snaptradeType.toLowerCase().replace(/[^a-z_]/g, "_");
  return ASSET_TYPE_MAP[normalized] ?? "other";
}

/** Structural subset of the SDK's Position that the mapping reads. */
export interface SnaptradePositionLike {
  symbol?: {
    id?: string;
    description?: string;
    symbol?: {
      id?: string;
      symbol?: string;
      description?: string | null;
      currency?: { code?: string } | null;
      type?: { code?: string } | null;
      figi_code?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  currency?: { code?: string } | null;
  units?: number | null;
  price?: number | null;
  average_purchase_price?: number | null;
  /** A money-market-like position the broker also counts in its cash */
  cash_equivalent?: boolean | null;
}

export interface SnaptradeSymbolFields {
  symbol: string;
  symbolId?: string;
  name?: string;
  assetType: string;
  currency: string;
  isin?: string;
  cusip?: string;
  figi?: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Read the identifying fields of a position from its UniversalSymbol.
 * Returns null when the position has no ticker (it cannot be stored).
 *
 * Currency: the position's own currency is the one `price` (and so market
 * value) is quoted in, so it wins; the listing currency comes next, and
 * `fallbackCurrency` (the account's currency) is used when the payload has
 * neither.
 */
export function readSnaptradeSymbolFields(
  position: SnaptradePositionLike,
  fallbackCurrency: string,
): SnaptradeSymbolFields | null {
  const universal = position.symbol?.symbol;
  const ticker = optionalString(universal?.symbol);
  if (!universal || !ticker) return null;

  return {
    symbol: ticker,
    symbolId: optionalString(universal.id) ?? optionalString(position.symbol?.id),
    name:
      optionalString(universal.description) ??
      optionalString(position.symbol?.description),
    assetType: normalizeAssetType(universal.type?.code),
    currency:
      optionalString(position.currency?.code) ??
      optionalString(universal.currency?.code) ??
      fallbackCurrency,
    isin: optionalString(universal.isin),
    cusip: optionalString(universal.cusip),
    figi: optionalString(universal.figi_code),
  };
}

// ═══════════════════════════════════════════════════════════════
// Holdings response
// ═══════════════════════════════════════════════════════════════

/** Structural subset of the SDK's OptionsPosition that the mapping reads. */
export interface SnaptradeOptionPositionLike {
  symbol?: {
    option_symbol?: {
      id?: string;
      ticker?: string;
      option_type?: string;
      strike_price?: number;
      expiration_date?: string;
      is_mini_option?: boolean;
      underlying_symbol?: {
        symbol?: string;
        currency?: { code?: string } | null;
        [key: string]: unknown;
      } | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  /** Price per share of the underlying (not per contract) */
  price?: number | null;
  /** Contracts; negative for a short position */
  units?: number | null;
  /** Cost per contract */
  average_purchase_price?: number | null;
  currency?: { code?: string } | null;
}

/** Structural subset of the SDK's AccountHoldingsAccount. */
export interface SnaptradeHoldingsLike {
  account?: {
    balance?: {
      total?: { amount?: number | null; currency?: string | null } | null;
    } | null;
    [key: string]: unknown;
  } | null;
  balances?: Array<{
    currency?: { code?: string } | null;
    cash?: number | null;
    [key: string]: unknown;
  }> | null;
  positions?: SnaptradePositionLike[] | null;
  option_positions?: SnaptradeOptionPositionLike[] | null;
  /** Deprecated by SnapTrade in favour of account.balance.total */
  total_value?: { value?: number | null; currency?: string | null } | null;
}

/** One position as stored in brokerPositions (native currency). */
export interface MappedSnaptradePosition extends SnaptradeSymbolFields {
  quantity: number;
  currentPrice: number;
  marketValue: number;
  averageCostBasis?: number;
  totalCostBasis?: number;
}

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface MappedSnaptradeHoldings {
  positions: MappedSnaptradePosition[];
  /**
   * Cash per currency as reported. Undefined when the response carried no
   * cash figure at all (absence, which keeps the stored cash); an empty
   * list is a reported zero.
   */
  cashBalances?: MoneyAmount[];
  /**
   * Value of positions flagged cash_equivalent. SnapTrade counts these in
   * the cash balance as well, so they are taken out of cash once.
   */
  cashEquivalents: MoneyAmount[];
  /** The broker-reported total account value; undefined when absent */
  total?: { amount: number; currency?: string };
}

/** Standard listed options cover 100 shares, mini options 10. */
function optionMultiplier(isMini: boolean | undefined): number {
  return isMini ? 10 : 100;
}

function readOptionPosition(
  position: SnaptradeOptionPositionLike,
  fallbackCurrency: string,
): MappedSnaptradePosition | null {
  const option = position.symbol?.option_symbol;
  const ticker = optionalString(option?.ticker);
  if (!option || !ticker) return null;

  const multiplier = optionMultiplier(option.is_mini_option);
  const quantity = position.units ?? 0;
  const pricePerContract = (position.price ?? 0) * multiplier;
  const averageCostBasis =
    position.average_purchase_price != null &&
    position.average_purchase_price > 0
      ? position.average_purchase_price
      : undefined;
  const underlying = optionalString(option.underlying_symbol?.symbol);
  const name = [
    underlying,
    option.expiration_date,
    option.strike_price,
    option.option_type,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");

  return {
    symbol: ticker,
    symbolId: optionalString(option.id),
    name: name || undefined,
    assetType: "option",
    currency:
      optionalString(position.currency?.code) ??
      optionalString(option.underlying_symbol?.currency?.code) ??
      fallbackCurrency,
    quantity,
    currentPrice: pricePerContract,
    marketValue: quantity * pricePerContract,
    averageCostBasis,
    totalCostBasis:
      averageCostBasis !== undefined ? averageCostBasis * quantity : undefined,
  };
}

function readStockPosition(
  position: SnaptradePositionLike,
  fallbackCurrency: string,
): MappedSnaptradePosition | null {
  const symbolFields = readSnaptradeSymbolFields(position, fallbackCurrency);
  if (!symbolFields) return null;
  const quantity = position.units ?? 0;
  const currentPrice = position.price ?? 0;
  const averageCostBasis =
    position.average_purchase_price != null &&
    position.average_purchase_price > 0
      ? position.average_purchase_price
      : undefined;
  return {
    ...symbolFields,
    quantity,
    currentPrice,
    marketValue: quantity * currentPrice,
    averageCostBasis,
    totalCostBasis:
      averageCostBasis !== undefined ? averageCostBasis * quantity : undefined,
  };
}

/**
 * Map one account's holdings response. Positions without a ticker are
 * dropped; option positions are valued units × price × contract multiplier
 * so the stored positions add up to the broker's total. `accountCurrency`
 * is used for any amount the payload gives no currency for.
 */
export function mapSnaptradeHoldings(
  holdings: SnaptradeHoldingsLike,
  accountCurrency: string,
): MappedSnaptradeHoldings {
  const positions: MappedSnaptradePosition[] = [];
  const cashEquivalents: MoneyAmount[] = [];
  for (const position of holdings.positions ?? []) {
    const mapped = readStockPosition(position, accountCurrency);
    if (!mapped) continue;
    positions.push(mapped);
    if (position.cash_equivalent) {
      cashEquivalents.push({
        amount: mapped.marketValue,
        currency: mapped.currency,
      });
    }
  }
  for (const option of holdings.option_positions ?? []) {
    const mapped = readOptionPosition(option, accountCurrency);
    if (mapped) positions.push(mapped);
  }

  let cashBalances: MoneyAmount[] | undefined;
  if (Array.isArray(holdings.balances)) {
    const reported = holdings.balances.filter(
      (b) => typeof b.cash === "number" && Number.isFinite(b.cash),
    );
    // Entries that all lack a cash figure are an absence, not a zero
    if (reported.length > 0 || holdings.balances.length === 0) {
      cashBalances = reported.map((b) => ({
        amount: b.cash as number,
        currency: optionalString(b.currency?.code) ?? accountCurrency,
      }));
    }
  }

  const accountTotal = holdings.account?.balance?.total;
  const total =
    typeof accountTotal?.amount === "number"
      ? {
          amount: accountTotal.amount,
          currency: optionalString(accountTotal.currency),
        }
      : typeof holdings.total_value?.value === "number"
        ? {
            amount: holdings.total_value.value,
            currency: optionalString(holdings.total_value.currency),
          }
        : undefined;

  return { positions, cashBalances, cashEquivalents, total };
}

/** `amount` in `from` expressed in `to`, via the base-currency rates. */
function convertBetween(
  amount: number,
  from: string,
  to: string,
  rates: FxRates,
): number | undefined {
  if (from === to) return amount;
  const inBase = toBase(amount, from, rates);
  const unit = toBase(1, to, rates);
  if (!inBase.ok || !unit.ok || unit.rate === 0) return undefined;
  return inBase.value / unit.rate;
}

/** Stored balance and cash of a broker account after a holdings sync. */
export interface SnaptradeAccountFields {
  /** Total account value in `balanceCurrency` */
  balance: number;
  balanceCurrency: string;
  /** Part of `balance` that could not be converted (no rate) was left out */
  balanceIsMixed: boolean;
  /**
   * Cash in `balanceCurrency`, signed: negative is a margin debit.
   * Undefined when the response reported no cash (keep the stored value).
   */
  cash?: number;
  /** "liabilities" for a margin debit, else "cash"; undefined with cash */
  cashInvestmentCategory?: "cash" | "liabilities";
  cashInvestmentSubcategory?: "broker-cash" | "margin-loans";
}

/**
 * Balance and cash of an account from its mapped holdings, all in one
 * currency (the broker total's, else the account's). Cash in other
 * currencies is converted into it; the balance is the broker total, or,
 * when the broker sent none, positions plus cash. Cash-equivalent
 * positions are taken out of cash (SnapTrade counts them in both). A
 * negative cash balance
 * is a margin debit and is classified as a liability at write time.
 */
export function snaptradeAccountFields(
  mapped: MappedSnaptradeHoldings,
  accountCurrency: string,
  rates: FxRates,
): SnaptradeAccountFields {
  const balanceCurrency = mapped.total?.currency ?? accountCurrency;
  let balanceIsMixed = false;

  const sumIn = (amounts: MoneyAmount[]): number => {
    let sum = 0;
    for (const { amount, currency } of amounts) {
      const converted = convertBetween(amount, currency, balanceCurrency, rates);
      if (converted === undefined) balanceIsMixed = true;
      else sum += converted;
    }
    return sum;
  };

  const cash =
    mapped.cashBalances !== undefined
      ? sumIn(mapped.cashBalances) - sumIn(mapped.cashEquivalents)
      : undefined;

  let balance: number;
  if (mapped.total !== undefined) {
    balance = mapped.total.amount;
    // A cash conversion gap does not affect a broker-reported total
    balanceIsMixed = false;
  } else {
    balance =
      sumIn(
        mapped.positions.map((p) => ({
          amount: p.marketValue,
          currency: p.currency,
        })),
      ) + (cash ?? 0);
  }

  return {
    balance,
    balanceCurrency,
    balanceIsMixed,
    cash,
    ...(cash === undefined
      ? {}
      : cash < 0
        ? {
            cashInvestmentCategory: "liabilities" as const,
            cashInvestmentSubcategory: "margin-loans" as const,
          }
        : {
            cashInvestmentCategory: "cash" as const,
            cashInvestmentSubcategory: "broker-cash" as const,
          }),
  };
}

/** Unrealised P/L of a position in its own currency; undefined without cost. */
export function positionProfitLoss(position: {
  marketValue?: number;
  totalCostBasis?: number;
}): { unrealizedPL?: number; unrealizedPLPercent?: number } {
  const { marketValue, totalCostBasis } = position;
  if (marketValue === undefined || totalCostBasis === undefined) return {};
  const unrealizedPL = marketValue - totalCostBasis;
  return {
    unrealizedPL,
    unrealizedPLPercent:
      totalCostBasis !== 0
        ? (unrealizedPL / Math.abs(totalCostBasis)) * 100
        : undefined,
  };
}

/**
 * Keys a user's classification override is carried across a sync by: the
 * ISIN when the position has one (it survives ticker changes), and the
 * ticker. Positions are replaced per account, so the account is implied.
 */
export function positionOverrideKeys(position: {
  symbol: string;
  isin?: string | null;
}): string[] {
  const keys: string[] = [];
  if (position.isin) keys.push(`isin:${position.isin.toUpperCase()}`);
  keys.push(`symbol:${position.symbol.toUpperCase()}`);
  return keys;
}
