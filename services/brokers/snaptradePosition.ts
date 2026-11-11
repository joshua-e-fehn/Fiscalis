/**
 * Pure mapping helpers for SnapTrade positions.
 *
 * Kept framework- and SDK-free so they can be unit-tested here and bundled
 * into Convex actions (frontend/convex/actions/snaptrade.ts).
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
 * value) is quoted in, so it wins; the listing currency is the fallback.
 */
export function readSnaptradeSymbolFields(
  position: SnaptradePositionLike,
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
      "USD",
    isin: optionalString(universal.isin),
    cusip: optionalString(universal.cusip),
    figi: optionalString(universal.figi_code),
  };
}
