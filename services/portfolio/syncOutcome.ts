/**
 * What a "sync all" run did, as data the UI words in the viewer's language
 * (frontend/providers/syncProvider.tsx, syncAllButton.tsx). The run itself
 * is convex/actions/syncAll.ts syncAllProviders.
 */

export const SYNC_PROVIDERS = ["plaid", "snaptrade", "bitpanda"] as const;
export type SyncProviderId = (typeof SYNC_PROVIDERS)[number];

/** The fields of SyncAllResult (convex/actions/syncAll.ts) read here. */
export interface SyncResultCounts {
  success: boolean;
  plaid: { success: boolean; itemsSynced: number; error?: string };
  snaptrade: { success: boolean; positionsProcessed: number; error?: string };
  bitpanda: { success: boolean; connectionsSynced: number; error?: string };
}

/** A provider that synced something, with how many items it synced. */
export interface SyncedProvider {
  provider: SyncProviderId;
  count: number;
}

export type SyncOutcome =
  | { status: "success"; synced: SyncedProvider[] }
  | { status: "partial"; synced: SyncedProvider[]; failed: SyncProviderId[] }
  | {
      status: "error";
      failed: SyncProviderId[];
      /** Set when the run was refused by the rate limit: minutes to wait */
      retryAfterMinutes?: number;
    };

/**
 * Sorts each provider into synced (succeeded with something to show: bank
 * items, broker positions, Bitpanda connections) or failed (reported an
 * error). A provider that succeeded with nothing to sync is in neither.
 */
export function summarizeSyncResult(result: SyncResultCounts): SyncOutcome {
  const counts: Record<
    SyncProviderId,
    { success: boolean; count: number; error?: string }
  > = {
    plaid: { ...result.plaid, count: result.plaid.itemsSynced },
    snaptrade: { ...result.snaptrade, count: result.snaptrade.positionsProcessed },
    bitpanda: { ...result.bitpanda, count: result.bitpanda.connectionsSynced },
  };

  const synced: SyncedProvider[] = [];
  const failed: SyncProviderId[] = [];
  for (const provider of SYNC_PROVIDERS) {
    const { success, count, error } = counts[provider];
    if (success && count > 0) synced.push({ provider, count });
    else if (error) failed.push(provider);
  }

  if (result.success) return { status: "success", synced };
  if (synced.length > 0) return { status: "partial", synced, failed };
  return { status: "error", failed };
}
