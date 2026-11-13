"use node";

/**
 * Bitpanda public API client.
 *
 * Unlike the OAuth aggregators (Plaid, SnapTrade, Vezgo), the Bitpanda
 * consumer API is a direct REST API authenticated with a per-user,
 * read-only API key sent in the `X-Api-Key` header. There is no SDK and
 * no token refresh — a connection is just an encrypted API key.
 *
 * Bitpanda holds a mix of asset classes (crypto, precious metals, other
 * commodities, fractional stocks/ETFs, crypto indices, fiat). The wallet
 * endpoints return balances in *asset units* (not fiat); the pure parsing
 * and EUR valuation of these raw responses lives in
 * services/bitpanda/normalize.ts.
 *
 * This file is imported by Convex actions which run in Node.js.
 */

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

/* eslint-enable @typescript-eslint/no-explicit-any */
