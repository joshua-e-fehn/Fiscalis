import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  syncErrorCode,
  type SyncOutcome,
  type SyncProvider,
  type SyncTrigger,
} from "../../../services/health/syncRuns";
import { describeError } from "../../../services/security/providerError";

export type { SyncTrigger } from "../../../services/health/syncRuns";

/**
 * Run one provider sync and record it in the syncRuns ledger
 * (convex/syncRuns.ts): a running row first, then its outcome. A throw is
 * recorded as failed with syncErrorCode(error) and rethrown; otherwise
 * `judge` turns the result into the outcome (success by default).
 *
 * The ledger never breaks a sync: a failed write is logged and the sync
 * goes on. A run whose action dies stays running and the digest reports it
 * as stuck.
 */
export async function withSyncRun<T>(
  ctx: ActionCtx,
  run: { provider: SyncProvider; userId: string; trigger: SyncTrigger },
  sync: () => Promise<T>,
  judge: (result: T) => SyncOutcome = () => ({ status: "success" }),
): Promise<T> {
  let runId: Id<"syncRuns"> | null = null;
  try {
    runId = await ctx.runMutation(internal.syncRuns.startRun, run);
  } catch (error) {
    console.error(`[SYNC RUNS] Could not open a ${run.provider} run:`, describeError(error));
  }

  const finish = async (outcome: SyncOutcome) => {
    if (!runId) return;
    try {
      await ctx.runMutation(internal.syncRuns.finishRun, { runId, ...outcome });
    } catch (error) {
      console.error(`[SYNC RUNS] Could not close a ${run.provider} run:`, describeError(error));
    }
  };

  let result: T;
  try {
    result = await sync();
  } catch (error) {
    await finish({ status: "failed", errorCode: syncErrorCode(error) });
    throw error;
  }
  await finish(judge(result));
  return result;
}
