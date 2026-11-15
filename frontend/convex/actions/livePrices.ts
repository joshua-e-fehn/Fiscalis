"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { fetchTicker } from "../lib/bitpanda";
import { decrypt } from "../lib/encryption";
import { tryUserRateLimit } from "../lib/rateLimit";
import { scheduledSyncEnabled } from "../lib/scheduledSync";
import {
  getSnaptradeClient,
  requiresReauthentication,
  withSnaptradeRetry,
} from "../lib/snaptrade";
import { describeError } from "../../../services/security/providerError";
import {
  QUOTE_BATCH_SIZE,
  batches,
  quotePricesById,
  tickerPrices,
} from "../../../services/pricing/livePrices";

/**
 * The live price refresh crons (ENG-239, services/pricing/livePrices.ts).
 * Both fail softly: a provider outage leaves the stored prices as they
 * are, and the next run or the next full sync catches up.
 */

/**
 * Every BITPANDA_TICKER_REFRESH_MINUTES: Bitpanda's public ticker into
 * assetPrices, then the Bitpanda holdings it prices. The ticker needs no
 * key and carries no user data, so it runs on every deployment, like the
 * gold.de ingest; the re-pricing calls no account provider.
 */
export const refreshBitpandaTicker = internalAction({
  args: {},
  handler: async (ctx): Promise<{ stored: number }> => {
    try {
      const prices = tickerPrices(await fetchTicker());
      const result: { stored: number } = await ctx.runMutation(
        internal.assetPrices.storeBitpandaTicker,
        { prices },
      );
      return result;
    } catch (error) {
      console.warn("[LIVE PRICES] Bitpanda ticker:", describeError(error));
      return { stored: 0 };
    }
  },
});

/** assetPrices.quoteTargets, spelled out: Convex needs it to infer `api` */
interface QuoteTargetsPage {
  targets: {
    userId: string;
    accounts: {
      accountId: Id<"brokerAccounts">;
      snaptradeAccountId: string;
      symbolIds: string[];
    }[];
  }[];
  continueCursor: string;
  isDone: boolean;
}

/**
 * Hourly in trading hours (SNAPTRADE_QUOTES_CRON): SnapTrade quotes for
 * the symbols each user holds, applied to their positions. It calls
 * SnapTrade with the user's credentials, so only where scheduled syncs
 * are enabled (SCHEDULED_SYNC_ENABLED), and each user spends one
 * quoteRefresh token per run (services/security/rateLimit.ts); a user
 * whose bucket is empty is skipped until the next run.
 */
export const refreshSnaptradeQuotes = internalAction({
  args: {},
  handler: async (ctx): Promise<{ users: number; repriced: number }> => {
    if (!scheduledSyncEnabled()) return { users: 0, repriced: 0 };

    let snaptrade;
    try {
      snaptrade = getSnaptradeClient();
    } catch (error) {
      console.warn("[LIVE PRICES] SnapTrade not configured:", describeError(error));
      return { users: 0, repriced: 0 };
    }

    let users = 0;
    let repriced = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: QuoteTargetsPage = await ctx.runQuery(
        internal.assetPrices.quoteTargets,
        { cursor },
      );

      for (const target of page.targets) {
        if (!(await tryUserRateLimit(ctx, "quoteRefresh", target.userId))) {
          continue;
        }
        // One user's failure (a secret that no longer decrypts, a write
        // error) must not stop the refresh for the users after them
        try {
          const user: Doc<"snaptradeUsers"> | null = await ctx.runQuery(
            internal.brokers.getSnaptradeUserInternal,
            { userId: target.userId },
          );
          if (!user) continue;
          const credentials = {
            userId: user.snaptradeUserId,
            userSecret: decrypt(user.snaptradeUserSecret),
          };
          users++;

          accounts: for (const account of target.accounts) {
            const quotes = [];
            for (const ids of batches(account.symbolIds, QUOTE_BATCH_SIZE)) {
              try {
                const response = await withSnaptradeRetry(() =>
                  snaptrade.trading.getUserAccountQuotes({
                    ...credentials,
                    accountId: account.snaptradeAccountId,
                    symbols: ids.join(","),
                    useTicker: false,
                  }),
                );
                for (const [symbolId, price] of quotePricesById(response.data)) {
                  quotes.push({
                    symbolId,
                    ticker: price.symbol,
                    price: price.price,
                    currency: price.currency,
                  });
                }
              } catch (error) {
                // Quotes are best effort: the nightly sync still prices the
                // account, and its status is the sync's to set
                console.warn("[LIVE PRICES] SnapTrade quotes:", describeError(error));
                if (requiresReauthentication(error)) break accounts;
              }
            }
            if (quotes.length === 0) continue;
            const result: { repriced: number } = await ctx.runMutation(
              internal.assetPrices.applySnaptradeQuotes,
              { userId: target.userId, accountId: account.accountId, quotes },
            );
            repriced += result.repriced;
          }
        } catch (error) {
          console.warn("[LIVE PRICES] SnapTrade user refresh:", describeError(error));
        }
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return { users, repriced };
  },
});
