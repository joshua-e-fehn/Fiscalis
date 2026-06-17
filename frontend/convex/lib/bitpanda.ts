"use node";

/**
 * Bitpanda public API client + normalizers.
 *
 * Unlike the OAuth aggregators (Plaid, SnapTrade, Vezgo), the Bitpanda
 * consumer API is a direct REST API authenticated with a per-user,
 * read-only API key sent in the `X-Api-Key` header. There is no SDK and
 * no token refresh — a connection is just an encrypted API key.
 *
 * Bitpanda holds a mix of asset classes (crypto, precious metals, other
 * commodities, fractional stocks/ETFs, crypto indices, fiat). The wallet
 * endpoints return balances in *asset units* (not fiat), so we value each
 * holding in EUR using Bitpanda's public, unauthenticated ticker.
 *
 * NOTE: The exact JSON shape of `/asset-wallets` varies by what the
 * account holds and by which products Bitpanda exposes to the public API.
 * The wallet parser below walks the response tree defensively rather than
 * hard-coding a single shape — see `extractWalletGroups`.
 *
 * This file is imported by Convex actions which run in Node.js.
 */

import { convertCurrency } from "./classification/currency";

const BITPANDA_API_BASE = "https://api.bitpanda.com/v1";

/** Error thrown when the API key is invalid/revoked (401/403). */
export class BitpandaAuthError extends Error {
  constructor(message = "Bitpanda API key is invalid or has been revoked") {
    super(message);
    this.name = "BitpandaAuthError";
  }
}

/** Error thrown for other (non-auth) Bitpanda API failures. */
export class BitpandaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BitpandaApiError";
    this.status = status;
  }
}

// ═══════════════════════════════════════════════════════════════
// LOW-LEVEL FETCH
// ═══════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

interface FetchOptions {
  /** Query params appended to the path */
  params?: Record<string, string | number | undefined>;
  /** Whether to send the API key header (false for the public ticker) */
  authenticated?: boolean;
}

async function bitpandaFetchRaw(
  apiKey: string | null,
  path: string,
  options: FetchOptions = {},
): Promise<any> {
  const { params, authenticated = true } = options;

  const url = new URL(`${BITPANDA_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (authenticated) {
    if (!apiKey) throw new BitpandaAuthError("Missing Bitpanda API key");
    headers["X-Api-Key"] = apiKey;
  }

  const res = await fetch(url.toString(), { method: "GET", headers });

  if (res.status === 401 || res.status === 403) {
    throw new BitpandaAuthError();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BitpandaApiError(
      res.status,
      `Bitpanda API error ${res.status} for ${path}: ${body.slice(0, 200)}`,
    );
  }

  return res.json();
}

/**
 * Fetch every page of a cursor-paginated list endpoint and return the
 * concatenated `data` arrays. Bitpanda list endpoints expose the next
 * cursor under `meta.next_cursor` (older responses used `links.next`).
 */
async function bitpandaFetchAll(
  apiKey: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<any[]> {
  const items: any[] = [];
  let cursor: string | undefined;
  const pageSize = 250;
  // Hard cap on pages as a runaway guard.
  for (let page = 0; page < 200; page++) {
    const json: any = await bitpandaFetchRaw(apiKey, path, {
      params: { ...params, page_size: pageSize, cursor },
    });

    const data = Array.isArray(json?.data) ? json.data : [];
    items.push(...data);

    const nextCursor: string | undefined =
      json?.meta?.next_cursor ?? json?.meta?.cursors?.after ?? undefined;

    if (!nextCursor || data.length === 0) break;
    cursor = nextCursor;
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API WRAPPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate an API key with a cheap authenticated call.
 * Throws BitpandaAuthError if the key is rejected.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  await bitpandaFetchRaw(apiKey, "/fiatwallets");
  return true;
}

/** Public ticker: { SYMBOL: { EUR: "123.45", USD: "...", ... } }. No auth. */
export async function fetchTicker(): Promise<Record<string, Record<string, string>>> {
  const json = await bitpandaFetchRaw(null, "/ticker", {
    authenticated: false,
  });
  return (json ?? {}) as Record<string, Record<string, string>>;
}

export async function fetchAssetWallets(apiKey: string): Promise<any> {
  return bitpandaFetchRaw(apiKey, "/asset-wallets");
}

export async function fetchFiatWallets(apiKey: string): Promise<any[]> {
  const json = await bitpandaFetchRaw(apiKey, "/fiatwallets");
  return Array.isArray(json?.data) ? json.data : [];
}

export async function fetchTrades(apiKey: string): Promise<any[]> {
  return bitpandaFetchAll(apiKey, "/trades");
}

export async function fetchCryptoTransactions(apiKey: string): Promise<any[]> {
  return bitpandaFetchAll(apiKey, "/wallets/transactions");
}

export async function fetchFiatTransactions(apiKey: string): Promise<any[]> {
  return bitpandaFetchAll(apiKey, "/fiatwallets/transactions");
}

export async function fetchCommodityTransactions(
  apiKey: string,
): Promise<any[]> {
  return bitpandaFetchAll(apiKey, "/assets/transactions/commodity");
}

// ═══════════════════════════════════════════════════════════════
// NORMALIZED SHAPES
// ═══════════════════════════════════════════════════════════════

/** A single Bitpanda holding, valued in EUR. */
export interface BitpandaHolding {
  /** Normalized asset class: crypto | metal | commodity | stock | etf | index | fiat */
  assetType: string;
  symbol: string;
  name?: string;
  quantity: number;
  /** Price per unit in EUR (undefined when no price is available) */
  currentPrice?: number;
  /** Holding value in EUR */
  marketValue?: number;
  /** Currency the value is expressed in — always EUR here */
  currency: string;
}

/** A single Bitpanda transaction. */
export interface BitpandaTransaction {
  bitpandaTransactionId: string;
  type: string; // buy | sell | deposit | withdrawal | transfer | reward | other
  symbol: string;
  quantity: number;
  price?: number;
  amount: number;
  currency: string;
  fees?: number;
  transactionDate: string; // ISO 8601
}

// ═══════════════════════════════════════════════════════════════
// WALLET TREE PARSING (defensive)
// ═══════════════════════════════════════════════════════════════

/** Map a Bitpanda asset-class key (from the wallet tree path) to our normalized assetType. */
function normalizeAssetClass(pathKeys: string[]): string {
  const keys = pathKeys.map((k) => k.toLowerCase());
  if (keys.includes("metal")) return "metal";
  if (keys.includes("commodity") || keys.includes("commodities"))
    return "commodity";
  if (keys.includes("cryptocoin") || keys.includes("crypto")) return "crypto";
  if (keys.includes("index") || keys.includes("indices")) return "index";
  if (keys.includes("etf")) return "etf";
  if (
    keys.includes("security") ||
    keys.includes("securities") ||
    keys.includes("stock") ||
    keys.includes("stocks")
  )
    return "stock";
  if (keys.includes("fiat")) return "fiat";
  // Fall back to the deepest meaningful key
  return keys[keys.length - 1] ?? "crypto";
}

interface WalletGroup {
  assetType: string;
  wallets: any[];
}

/**
 * Walk the `/asset-wallets` response and collect every `wallets` array with
 * the asset-class path that led to it. Resilient to nesting differences
 * (e.g. `commodity.metal.wallets` vs `metal.wallets`).
 */
function extractWalletGroups(node: any, pathKeys: string[] = []): WalletGroup[] {
  const groups: WalletGroup[] = [];
  if (!node || typeof node !== "object") return groups;

  const attributes = node.attributes ?? node;

  // A node that directly carries a wallets array
  if (Array.isArray(attributes?.wallets)) {
    groups.push({
      assetType: normalizeAssetClass(pathKeys),
      wallets: attributes.wallets,
    });
  }

  // Recurse into child asset-class objects
  if (attributes && typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "wallets") continue;
      if (value && typeof value === "object") {
        groups.push(...extractWalletGroups(value, [...pathKeys, key]));
      }
    }
  }

  return groups;
}

/** Probe a wallet's attributes for the asset symbol across known field names. */
function readSymbol(attrs: any): string {
  return (
    attrs?.cryptocoin_symbol ??
    attrs?.fiat_symbol ??
    attrs?.symbol ??
    attrs?.asset_symbol ??
    attrs?.commodity_symbol ??
    "UNKNOWN"
  )
    .toString()
    .toUpperCase();
}

/** Probe a wallet's attributes for the balance/quantity. */
function readBalance(attrs: any): number {
  const raw = attrs?.balance ?? attrs?.amount ?? attrs?.quantity ?? 0;
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return Number.isFinite(n) ? n : 0;
}

function readName(attrs: any): string | undefined {
  return attrs?.name ?? attrs?.asset_name ?? undefined;
}

/** Price per unit in EUR from the public ticker, if present. */
function priceFromTicker(
  ticker: Record<string, Record<string, string>>,
  symbol: string,
): number | undefined {
  const entry = ticker[symbol] ?? ticker[symbol.toUpperCase()];
  const raw = entry?.EUR;
  if (raw === undefined) return undefined;
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return Number.isFinite(n) ? n : undefined;
}

// ═══════════════════════════════════════════════════════════════
// NORMALIZERS
// ═══════════════════════════════════════════════════════════════

/**
 * Flatten asset-wallets + fiat wallets into normalized holdings, valued in EUR.
 * Zero-balance wallets are dropped.
 */
export function normalizeHoldings(
  assetWalletsResponse: any,
  fiatWallets: any[],
  ticker: Record<string, Record<string, string>>,
): BitpandaHolding[] {
  const holdings: BitpandaHolding[] = [];

  // Asset wallets (crypto, metals, commodities, stocks/ETFs, indices)
  const groups = extractWalletGroups(assetWalletsResponse?.data);
  for (const group of groups) {
    if (group.assetType === "fiat") continue; // fiat handled below
    for (const wallet of group.wallets) {
      const attrs = wallet?.attributes ?? wallet;
      const quantity = readBalance(attrs);
      if (quantity <= 0) continue;

      const symbol = readSymbol(attrs);
      const price = priceFromTicker(ticker, symbol);
      const marketValue =
        price !== undefined ? quantity * price : undefined;

      holdings.push({
        assetType: group.assetType,
        symbol,
        name: readName(attrs),
        quantity,
        currentPrice: price,
        marketValue:
          marketValue !== undefined
            ? Math.round(marketValue * 100) / 100
            : undefined,
        currency: "EUR",
      });
    }
  }

  // Fiat wallets — balance already in its own currency → convert to EUR
  for (const wallet of fiatWallets) {
    const attrs = wallet?.attributes ?? wallet;
    const quantity = readBalance(attrs);
    if (quantity <= 0) continue;

    const symbol = readSymbol(attrs); // e.g. "EUR", "USD"
    const conversion = convertCurrency(quantity, symbol, "EUR");

    holdings.push({
      assetType: "fiat",
      symbol,
      name: readName(attrs) ?? symbol,
      quantity,
      currentPrice: conversion.exchangeRate,
      marketValue: conversion.baseValue,
      currency: "EUR",
    });
  }

  return holdings;
}

/** Normalize a raw Bitpanda transaction `type` to our small string set. */
export function normalizeTransactionType(raw: string): string {
  const t = (raw ?? "").toLowerCase();
  switch (t) {
    case "buy":
    case "purchase":
      return "buy";
    case "sell":
      return "sell";
    case "deposit":
    case "incoming":
      return "deposit";
    case "withdrawal":
    case "outgoing":
      return "withdrawal";
    case "transfer":
      return "transfer";
    case "reward":
    case "interest":
    case "staking":
      return "reward";
    default:
      return t || "other";
  }
}

/** Read an ISO date out of a Bitpanda transaction's time object. */
function readTransactionDate(attrs: any): string {
  return (
    attrs?.time?.date_iso8601 ??
    attrs?.time?.unix ??
    attrs?.created_at ??
    attrs?.date ??
    new Date(0).toISOString()
  ).toString();
}

function toNumber(raw: any): number {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize trades + crypto/fiat/commodity transactions into a single list.
 * `kind` tags which endpoint a record came from so we can read its fields.
 */
export function normalizeTransactions(input: {
  trades: any[];
  cryptoTransactions: any[];
  fiatTransactions: any[];
  commodityTransactions: any[];
}): BitpandaTransaction[] {
  const out: BitpandaTransaction[] = [];

  const pushRecord = (record: any, fallbackPrefix: string) => {
    const attrs = record?.attributes ?? record;
    const id = (record?.id ?? attrs?.id ?? `${fallbackPrefix}-${out.length}`)
      .toString();

    const symbol = readSymbol(attrs);
    const quantity = toNumber(
      attrs?.amount_cryptocoin ??
        attrs?.amount_asset ??
        attrs?.amount ??
        attrs?.quantity,
    );
    const amount = toNumber(
      attrs?.amount_fiat ?? attrs?.amount_eur ?? attrs?.fiat_amount,
    );
    const price = attrs?.price !== undefined ? toNumber(attrs.price) : undefined;
    const fees =
      attrs?.fee !== undefined || attrs?.fees !== undefined
        ? toNumber(attrs?.fee ?? attrs?.fees)
        : undefined;

    out.push({
      bitpandaTransactionId: id,
      type: normalizeTransactionType(attrs?.type ?? attrs?.transaction_type),
      symbol,
      quantity,
      price,
      amount,
      currency: (attrs?.fiat_symbol ?? attrs?.currency ?? "EUR")
        .toString()
        .toUpperCase(),
      fees,
      transactionDate: readTransactionDate(attrs),
    });
  };

  // Order matters: trades first so a buy/sell from /trades wins over the
  // duplicate the same event produces in /wallets/transactions.
  for (const r of input.trades) pushRecord(r, "trade");
  for (const r of input.cryptoTransactions) pushRecord(r, "crypto");
  for (const r of input.fiatTransactions) pushRecord(r, "fiat");
  for (const r of input.commodityTransactions) pushRecord(r, "commodity");

  // A single buy/sell is reported by multiple Bitpanda endpoints (e.g.
  // /trades and /wallets/transactions) with different IDs. Collapse those by
  // a signature of the event so we don't store the same transaction twice.
  const seen = new Set<string>();
  return out.filter((tx) => {
    const key = [
      tx.type,
      tx.symbol.toUpperCase(),
      tx.quantity.toFixed(8),
      tx.amount.toFixed(2),
      tx.transactionDate.slice(0, 10),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */
