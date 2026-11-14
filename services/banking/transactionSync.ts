/**
 * Pure helpers for incremental transaction sync (ENG-230).
 *
 * Plaid: /transactions/sync returns pages of added / modified / removed
 * changes after a stored cursor. mergeSyncPages folds those pages into one
 * set of upserts and removals, so a transaction added and then removed
 * within one sync is never written.
 *
 * Bitpanda: the API has no "changed since" parameter, so a sync re-reads
 * only a recent window (newest pages first) and replaces the stored rows
 * inside it. bitpandaSyncCutoff picks the window start; pageReachesCutoff
 * tells the pager when it has read far enough.
 */

/** A transaction as stored in plaidTransactions (without user/sync fields). */
export interface PlaidTransactionRecord {
  itemId: string;
  accountId: string;
  plaidTransactionId: string;
  amount: number;
  /** ISO 4217 code, else Plaid's unofficial code; absent when Plaid sent neither */
  currency?: string;
  date: string;
  name: string;
  merchantName?: string;
  category?: string;
  pending: boolean;
}

/** The fields of a Plaid `Transaction` the mapper reads. */
export interface PlaidTransactionLike {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  date: string;
  name?: string | null;
  merchant_name?: string | null;
  category?: string[] | null;
  personal_finance_category?: { primary?: string | null } | null;
  pending: boolean;
}

/** Map a Plaid transaction onto the stored shape. */
export function toPlaidTransactionRecord(
  itemId: string,
  txn: PlaidTransactionLike,
): PlaidTransactionRecord {
  const legacyCategory = txn.category?.length
    ? txn.category.join(", ")
    : undefined;
  return {
    itemId,
    accountId: txn.account_id,
    plaidTransactionId: txn.transaction_id,
    amount: txn.amount,
    currency:
      txn.iso_currency_code ?? txn.unofficial_currency_code ?? undefined,
    date: txn.date,
    name: txn.name ?? txn.merchant_name ?? "",
    merchantName: txn.merchant_name ?? undefined,
    // The legacy hierarchy is deprecated; newer items only carry the
    // personal finance category
    category:
      legacyCategory ?? txn.personal_finance_category?.primary ?? undefined,
    pending: txn.pending,
  };
}

/** One /transactions/sync page, already mapped. */
export interface SyncPage<T extends { plaidTransactionId: string }> {
  added: T[];
  modified: T[];
  removed: string[];
}

/**
 * Fold sync pages, in order, into the final upserts and removals: a later
 * page wins over an earlier one for the same transaction id.
 */
export function mergeSyncPages<T extends { plaidTransactionId: string }>(
  pages: SyncPage<T>[],
): { upserts: T[]; removed: string[] } {
  const upserts = new Map<string, T>();
  const removed = new Set<string>();
  for (const page of pages) {
    for (const txn of [...page.added, ...page.modified]) {
      removed.delete(txn.plaidTransactionId);
      upserts.set(txn.plaidTransactionId, txn);
    }
    for (const id of page.removed) {
      upserts.delete(id);
      removed.add(id);
    }
  }
  return { upserts: [...upserts.values()], removed: [...removed] };
}

/** Split a list into chunks of at most `size` (mutation-sized batches). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Days before the newest stored Bitpanda transaction a sync re-reads. */
export const BITPANDA_SYNC_OVERLAP_DAYS = 14;

/**
 * Start of the window an incremental Bitpanda sync re-reads (ISO 8601), or
 * undefined for a full sync (nothing stored yet, or an unreadable date).
 * The overlap covers late-settling records and the wallet copy of a trade
 * that Bitpanda lists after the trade itself.
 */
export function bitpandaSyncCutoff(
  newestStoredDate: string | undefined,
  overlapDays: number = BITPANDA_SYNC_OVERLAP_DAYS,
): string | undefined {
  if (!newestStoredDate) return undefined;
  const newest = Date.parse(newestStoredDate);
  if (!Number.isFinite(newest)) return undefined;
  return new Date(newest - overlapDays * 86_400_000).toISOString();
}

/**
 * Whether a page of an endpoint listed newest first ends the window: every
 * record is before the cutoff. A page not in descending date order (or with
 * unreadable dates) never ends it, so an endpoint that lists oldest first
 * is still read in full rather than cut short.
 */
export function pageReachesCutoff(
  pageDates: string[],
  cutoff: string,
): boolean {
  if (pageDates.length === 0) return false;
  const times = pageDates.map((d) => Date.parse(d));
  if (times.some((t) => !Number.isFinite(t))) return false;
  for (let i = 1; i < times.length; i++) {
    if (times[i] > times[i - 1]) return false;
  }
  const cutoffTime = Date.parse(cutoff);
  return times.every((t) => t < cutoffTime);
}

/** The newest ISO date among the records, or undefined when none parse. */
export function newestDate(dates: string[]): string | undefined {
  let best: { iso: string; time: number } | undefined;
  for (const iso of dates) {
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) continue;
    if (!best || time > best.time) best = { iso, time };
  }
  return best?.iso;
}

/** One /transactions/sync response, already mapped. */
export interface FetchedSyncPage<T extends { plaidTransactionId: string }>
  extends SyncPage<T> {
  nextCursor: string;
  hasMore: boolean;
  /** Plaid's transactions_update_status */
  updateStatus?: string;
  accountIds: string[];
}

/** Plaid's error when the item changed while a sync was paginating. */
export const MUTATION_DURING_PAGINATION =
  "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

/** Upper bound on pages per sync, as a runaway guard. */
const MAX_SYNC_PAGES = 200;

/**
 * Read every page after `startCursor`. When Plaid reports that the item
 * changed mid-pagination, the whole loop restarts from `startCursor`, as
 * Plaid requires (at most `maxRestarts` times).
 */
export async function collectSyncPages<T extends { plaidTransactionId: string }>(
  fetchPage: (cursor: string | undefined) => Promise<FetchedSyncPage<T>>,
  startCursor: string | undefined,
  options: {
    isRestartError: (error: unknown) => boolean;
    maxRestarts?: number;
  },
): Promise<{
  pages: FetchedSyncPage<T>[];
  nextCursor: string | undefined;
  updateStatus?: string;
  accountIds: string[];
}> {
  const maxRestarts = options.maxRestarts ?? 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const pages: FetchedSyncPage<T>[] = [];
      let cursor = startCursor;
      for (let i = 0; i < MAX_SYNC_PAGES; i++) {
        const page = await fetchPage(cursor);
        pages.push(page);
        cursor = page.nextCursor;
        if (!page.hasMore) break;
      }
      const last = pages[pages.length - 1];
      return {
        pages,
        nextCursor: cursor,
        updateStatus: last?.updateStatus,
        accountIds: [...new Set(pages.flatMap((p) => p.accountIds))],
      };
    } catch (error) {
      if (attempt >= maxRestarts || !options.isRestartError(error)) throw error;
    }
  }
}
