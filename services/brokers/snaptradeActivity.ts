/**
 * Pure mapping of SnapTrade account activities (the account's transaction
 * history) into brokerTransactions rows, and the incremental, paginated
 * fetch window. The one SnapTrade sync (frontend/convex/actions/snaptrade.ts)
 * fetches them after an account's holdings; the snapshot writer reads the
 * stored BUY/SELL rows as exact flows (services/portfolio/flows.ts).
 *
 * SDK shape (snaptrade-typescript-sdk 9.x, models/account-universal-
 * activity.d.ts): { id, symbol: { id, symbol } | null, units, price,
 * amount (signed, in currency), currency: { code }, type, description,
 * trade_date, settlement_date, fee }. The endpoint
 * (accountInformation.getAccountActivities) returns at most `limit` rows a
 * page, newest first, with { offset, limit, total } pagination; its data
 * is cached by SnapTrade and refreshed once a day.
 */

/** The fields of an activity this module reads (structural, SDK-free). */
export interface SnaptradeActivityLike {
  id?: string;
  symbol?: { id?: string; symbol?: string } | null;
  units?: number;
  price?: number;
  amount?: number | null;
  currency?: { code?: string };
  type?: string;
  description?: string;
  trade_date?: string | null;
  settlement_date?: string;
  fee?: number;
}

/** A brokerTransactions row's provider fields (schema: brokerTransactions). */
export interface StoredSnaptradeActivity {
  snaptradeActivityId: string;
  type: string;
  symbol?: string;
  symbolId?: string;
  description?: string;
  quantity?: number;
  price?: number;
  amount: number;
  currency: string;
  fees?: number;
  settlementDate?: string;
  tradeDate: string;
}

const finite = (n: number | null | undefined) =>
  n != null && Number.isFinite(n) ? n : undefined;
const text = (s: string | null | undefined) => (s ? s : undefined);

/**
 * One activity as a brokerTransactions row; null without an id or a trade
 * date, which cannot be deduplicated or placed in time. The amount keeps
 * SnapTrade's sign; a missing currency is the account's.
 */
export function mapSnaptradeActivity(
  activity: SnaptradeActivityLike,
  accountCurrency: string,
): StoredSnaptradeActivity | null {
  const id = text(activity.id);
  const tradeDate = text(activity.trade_date);
  if (!id || !tradeDate) return null;
  return {
    snaptradeActivityId: id,
    type: (text(activity.type) ?? "UNKNOWN").toUpperCase(),
    symbol: text(activity.symbol?.symbol),
    symbolId: text(activity.symbol?.id),
    description: text(activity.description),
    quantity: finite(activity.units),
    price: finite(activity.price),
    amount: finite(activity.amount) ?? 0,
    currency: (text(activity.currency?.code) ?? accountCurrency).toUpperCase(),
    fees: finite(activity.fee),
    settlementDate: text(activity.settlement_date),
    tradeDate,
  };
}

/** Days re-fetched before the newest stored activity, for late-booked ones. */
export const ACTIVITY_OVERLAP_DAYS = 7;

/** Page size requested from the activities endpoint (its maximum). */
export const ACTIVITY_PAGE_SIZE = 1000;

/**
 * Start date (YYYY-MM-DD) of an incremental fetch: ACTIVITY_OVERLAP_DAYS
 * before the newest stored activity's trade date, undefined (the whole
 * history) when none is stored or its date cannot be read.
 */
export function activitiesStartDate(
  newestTradeDate: string | null | undefined,
): string | undefined {
  const t = newestTradeDate ? Date.parse(newestTradeDate) : NaN;
  if (!Number.isFinite(t)) return undefined;
  return new Date(t - ACTIVITY_OVERLAP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Offset of the next page, or null when this page was the last: it came
 * back short, empty, or reached the reported total.
 */
export function nextActivitiesOffset(
  offset: number,
  received: number,
  limit: number,
  total: number | undefined,
): number | null {
  const next = offset + received;
  if (received === 0 || received < limit) return null;
  if (total !== undefined && next >= total) return null;
  return next;
}

/**
 * Every page of an account's activities in the fetch window, oldest page
 * first. The endpoint pages newest first, while the next incremental fetch
 * starts from the newest stored activity (activitiesStartDate): storing a
 * newest page before an older one has been fetched would move that start
 * past history never stored, and a later failed page would skip it for
 * good. So nothing is returned unless every page arrives (a failed fetch
 * rejects, and the next sync fetches the same window again), and the pages
 * come back in the order to store them: each stored page then leaves the
 * newest stored date a safe start, even when a later store fails.
 */
export async function fetchActivityPagesOldestFirst<Row>(
  fetchPage: (offset: number) => Promise<{ rows: Row[]; total?: number }>,
  limit: number = ACTIVITY_PAGE_SIZE,
): Promise<Row[][]> {
  const pages: Row[][] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const { rows, total } = await fetchPage(offset);
    if (rows.length > 0) pages.push(rows);
    offset = nextActivitiesOffset(offset, rows.length, limit, total);
  }
  return pages.reverse();
}
