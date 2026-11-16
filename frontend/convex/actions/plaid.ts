"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { languageValidator } from "../onboarding";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  TransactionsUpdateStatus,
} from "plaid";
import { encrypt, decrypt } from "../lib/encryption";
import { NO_CURRENCY } from "../../../services/finance/currency";
import { providerSyncSnapshot } from "../../../services/portfolio/aggregate";
import { describeError } from "../../../services/security/providerError";
import {
  plaidLinkLanguage,
  plaidLinkProducts,
} from "../../../services/banking/plaidProducts";
import { enforceUserRateLimit } from "../lib/rateLimit";
import { withSyncRun } from "../lib/syncRuns";
import { syncTriggerValidator } from "../lib/syncRunValidators";
import { userError } from "../lib/userError";
import {
  chunk,
  collectSyncPages,
  mergeSyncPages,
  MUTATION_DURING_PAGINATION,
  toPlaidTransactionRecord,
} from "../../../services/banking/transactionSync";
import { consentExpiryMs } from "../../../services/banking/consentExpiry";
import {
  plaidWebhookEvent,
  plaidWebhookKeyId,
  plaidWebhookUrl,
  verifyPlaidWebhook,
  type PlaidWebhookKey,
} from "../../../services/security/plaidWebhook";

// ═══════════════════════════════════════════════════════════════
// PLAID CLIENT SETUP
// ═══════════════════════════════════════════════════════════════

function getPlaidClient() {
  const env = (process.env.PLAID_ENV ||
    "sandbox") as keyof typeof PlaidEnvironments;

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET":
          env === "production"
            ? process.env.PLAID_PRODUCTION_SECRET!
            : process.env.PLAID_SANDBOX_SECRET!,
      },
    },
  });

  return new PlaidApi(configuration);
}

// Parse country codes from environment
function getCountryCodes(): CountryCode[] {
  const codes = process.env.PLAID_COUNTRY_CODES?.split(",") || ["US"];
  return codes.map((code) => code.trim().toUpperCase() as CountryCode);
}

/**
 * Where Plaid sends this deployment's webhooks: <CONVEX_SITE_URL>/plaid-webhook
 * (http.ts), e.g. https://handsome-gecko-941.convex.site/plaid-webhook in prod.
 */
function getWebhookUrl(): string | undefined {
  return plaidWebhookUrl(process.env.CONVEX_SITE_URL);
}

// Products to request at link time; never auth/identity (ENG-225)
function getProducts(): Products[] {
  return plaidLinkProducts(process.env.PLAID_PRODUCTS) as Products[];
}

/**
 * Plaid Link opens in the language the UI is rendered in, which the client
 * passes (languageForLocale(useLocale()), hooks/convex/banking.ts), else
 * English. Not the stored userSettings.language: that can be a language the
 * UI does not render yet (i18n/locales.ts RENDERED_LANGUAGES), and Plaid
 * should not be German inside an English app. plaidLinkLanguage maps app
 * codes to Plaid's ("pt-PT" → "pt"), English where Plaid has none.
 */
const linkLanguageArg = v.optional(languageValidator);

// ═══════════════════════════════════════════════════════════════
// LINK TOKEN ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a link token for Plaid Link initialization
 */
export const createLinkToken = action({
  args: { language: linkLanguageArg },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    // A new connection: the plan must have room for it (ENG-199)
    await ctx.runQuery(internal.billing.assertConnectionSlot, { userId });
    await enforceUserRateLimit(ctx, "providerLink", userId);
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Fiscalis",
      products: getProducts(),
      country_codes: getCountryCodes(),
      language: plaidLinkLanguage(args.language),
      webhook: getWebhookUrl(),
    });

    return { linkToken: response.data.link_token };
  },
});

/**
 * Create an update link token for re-authentication. Account selection is
 * on, so a reconnect can also share accounts left out at the first link
 * (a DKB Tagesgeldkonto that receives depot sales); the next refresh
 * stores them and their transactions.
 */
export const createUpdateLinkToken = action({
  args: { itemId: v.string(), language: linkLanguageArg },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    await enforceUserRateLimit(ctx, "providerLink", userId);

    // Get the item's access token
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });

    if (!item || item.userId !== userId) {
      userError("connectionNotFound");
    }

    const accessToken = decrypt(item.accessToken);
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Fiscalis",
      access_token: accessToken,
      country_codes: getCountryCodes(),
      language: plaidLinkLanguage(args.language),
      update: { account_selection_enabled: true },
    });

    return { linkToken: response.data.link_token };
  },
});

// ═══════════════════════════════════════════════════════════════
// TOKEN EXCHANGE ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Exchange a public token for an access token and save the item
 */
export const exchangeToken = action({
  args: {
    publicToken: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    // Checked again before the access token is created (ENG-199)
    await ctx.runQuery(internal.billing.assertConnectionSlot, { userId });
    const plaidClient = getPlaidClient();

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: args.publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Fetch institution logo and metadata if institutionId is provided
    let institutionLogo: string | undefined;
    let institutionPrimaryColor: string | undefined;

    if (args.institutionId) {
      try {
        const institutionResponse = await plaidClient.institutionsGetById({
          institution_id: args.institutionId,
          country_codes: getCountryCodes(),
          options: {
            include_optional_metadata: true,
          },
        });

        const institution = institutionResponse.data.institution;
        // Logo is a base64-encoded 152x152 PNG string
        institutionLogo = institution.logo ?? undefined;
        institutionPrimaryColor = institution.primary_color ?? undefined;
      } catch (error) {
        // Log but don't fail the entire operation if we can't get the logo
        console.warn("Failed to fetch institution metadata:", describeError(error));
      }
    }

    // Encrypt the access token before storing
    const encryptedToken = encrypt(accessToken);

    // Save to database. saveItem checks the plan again, atomically; if a
    // parallel connect took the last slot, revoke the item at Plaid rather
    // than leave it live and unseen
    try {
      await ctx.runMutation(internal.banking.saveItem, {
        userId,
        accessToken: encryptedToken,
        itemId,
        institutionId: args.institutionId,
        institutionName: args.institutionName,
        institutionLogo,
        institutionPrimaryColor,
      });
    } catch (error) {
      await removeItemAtPlaid(encryptedToken);
      throw error;
    }

    // Fetch initial accounts
    await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
      itemId,
      trigger: "manual",
    });

    // Take a snapshot after new connection is synced
    await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
      userId,
      source: "plaid-connect",
    });

    return { success: true, itemId };
  },
});

/**
 * Internal action to fetch and update institution logo for an item
 */
export const updateInstitutionLogoInternal = internalAction({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    // Get the item
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });

    if (!item) {
      return { success: false, message: "Item not found" };
    }

    // Skip if no institution ID or already has logo
    if (!item.institutionId) {
      return { success: false, message: "No institution ID available" };
    }

    if (item.institutionLogo) {
      return { success: true, message: "Logo already exists" };
    }

    const plaidClient = getPlaidClient();

    try {
      const institutionResponse = await plaidClient.institutionsGetById({
        institution_id: item.institutionId,
        country_codes: getCountryCodes(),
        options: {
          include_optional_metadata: true,
        },
      });

      const institution = institutionResponse.data.institution;
      const institutionLogo = institution.logo ?? undefined;
      const institutionPrimaryColor = institution.primary_color ?? undefined;

      if (!institutionLogo && !institutionPrimaryColor) {
        return {
          success: false,
          message: "No logo or color available for this institution",
        };
      }

      // Update the item with logo
      await ctx.runMutation(internal.banking.updateItemLogo, {
        itemId: args.itemId,
        institutionLogo,
        institutionPrimaryColor,
      });

      return { success: true, message: "Logo updated" };
    } catch (error) {
      console.error("Failed to fetch institution logo:", describeError(error));
      return { success: false, message: "Failed to fetch logo from Plaid" };
    }
  },
});

/**
 * Fetch and update institution logo for an existing item
 * Useful for migrating existing connections to display logos
 */
export const updateInstitutionLogo = action({
  args: { itemId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get the item to verify ownership
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });

    if (!item || item.userId !== userId) {
      userError("connectionNotFound");
    }

    // Call internal action to do the actual work
    const result = await ctx.runAction(
      internal.actions.plaid.updateInstitutionLogoInternal,
      {
        itemId: args.itemId,
      },
    );

    return result;
  },
});

/**
 * Fetch and update logos for all items belonging to the current user
 */
export const updateAllInstitutionLogos = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get all items for user
    const items = await ctx.runQuery(internal.banking.getItemsByUserInternal, {
      userId,
    });

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      // Skip if no institution ID or already has logo
      if (!item.institutionId) {
        skipped++;
        continue;
      }

      if (item.institutionLogo) {
        skipped++;
        continue;
      }

      try {
        const result = await ctx.runAction(
          internal.actions.plaid.updateInstitutionLogoInternal,
          {
            itemId: item.itemId,
          },
        );
        if (result.success) {
          updated++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to update logo for item ${item.itemId}:`, describeError(error));
        failed++;
      }
    }

    return { success: true, updated, skipped, failed };
  },
});

// ═══════════════════════════════════════════════════════════════
// SYNC ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Internal action to sync accounts for an item
 */
export const syncAccountsInternal = internalAction({
  args: { itemId: v.string(), trigger: syncTriggerValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; accountCount: number }> => {
    // Get item with encrypted token
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });

    if (!item) throw new Error("Item not found");

    // One ledger row per item (convex/syncRuns.ts)
    return withSyncRun(
      ctx,
      { provider: "plaid", userId: item.userId, trigger: args.trigger },
      async () => {
        const accessToken = decrypt(item.accessToken);
        const plaidClient = getPlaidClient();

        try {
          const response = await plaidClient.accountsGet({
            access_token: accessToken,
          });

          const accounts = response.data.accounts.map((acc) => ({
            accountId: acc.account_id,
            name: acc.name,
            officialName: acc.official_name ?? undefined,
            type: acc.type,
            subtype: acc.subtype ?? undefined,
            mask: acc.mask ?? undefined,
            currentBalance: acc.balances.current ?? undefined,
            availableBalance: acc.balances.available ?? undefined,
            // Plaid sets iso_currency_code to null exactly when the account uses
            // a non-ISO currency (unofficial_currency_code). With neither, store
            // "XXX" (ISO 4217 "no currency"): saveAccounts flags it as
            // unconverted instead of reading it as USD.
            currency:
              acc.balances.iso_currency_code ??
              acc.balances.unofficial_currency_code ??
              NO_CURRENCY,
          }));

          await ctx.runMutation(internal.banking.saveAccounts, {
            userId: item.userId,
            itemId: args.itemId,
            accounts,
          });

          // The end of consent, as /item/get reports it (the item in the
          // /accounts/get response is the same object); null clears it
          await ctx.runMutation(internal.banking.updateItemConsent, {
            itemId: args.itemId,
            consentExpiresAt:
              consentExpiryMs(response.data.item.consent_expiration_time) ??
              null,
          });

          // Update item status to active
          await ctx.runMutation(internal.banking.updateItemStatus, {
            itemId: args.itemId,
            status: "active",
          });

          // Fetch and update institution logo if missing
          if (!item.institutionLogo && item.institutionId) {
            try {
              await ctx.runAction(
                internal.actions.plaid.updateInstitutionLogoInternal,
                {
                  itemId: args.itemId,
                },
              );
            } catch (logoError) {
              // Don't fail the sync if logo fetch fails
              console.warn(
                "Failed to fetch institution logo during sync:",
                describeError(logoError),
              );
            }
          }

          return { success: true, accountCount: accounts.length };
        } catch (error: unknown) {
          // Handle Plaid errors
          const plaidError = error as {
            response?: { data?: { error_code?: string } };
          };
          if (plaidError.response?.data?.error_code) {
            await ctx.runMutation(internal.banking.updateItemStatus, {
              itemId: args.itemId,
              status: "error",
              errorCode: plaidError.response.data.error_code,
            });
          }
          throw error;
        }
      },
    );
  },
});

/**
 * Public action to refresh accounts for all items or a specific item
 * @param skipSnapshot - If true, don't create a snapshot (used by syncAll to avoid duplicates)
 */
export const refreshAccounts = action({
  args: {
    itemId: v.optional(v.string()),
    skipSnapshot: v.optional(v.boolean()),
    // The user just completed update mode for itemId (PlaidUpdateButton):
    // a pending disconnect is resolved
    afterReconnect: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    itemsSynced: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; itemsSynced: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    await enforceUserRateLimit(ctx, "providerRefresh", userId);

    if (args.itemId) {
      // Verify ownership
      const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });

      if (!item || item.userId !== userId) {
        userError("connectionNotFound");
      }

      if (args.afterReconnect) {
        await ctx.runMutation(internal.banking.updateItemConsent, {
          itemId: args.itemId,
          disconnectExpectedAt: null,
        });
      }

      await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
        itemId: args.itemId,
        trigger: "manual",
      });

      // Take a portfolio snapshot after sync (unless skipped)
      if (!args.skipSnapshot) {
        try {
          await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
            userId,
            source: "plaid",
          });
        } catch (snapshotError) {
          console.error("Failed to take portfolio snapshot:", describeError(snapshotError));
        }
      }

      return { success: true, itemsSynced: 1 };
    }

    // Sync all items for user
    const userItems = await ctx.runQuery(
      internal.banking.getItemsByUserInternal,
      {
        userId,
      },
    );

    let failed = 0;
    for (const item of userItems) {
      try {
        await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
          itemId: item.itemId,
          trigger: "manual",
        });
      } catch (error) {
        failed++;
        console.error(`Error syncing item ${item.itemId}:`, describeError(error));
      }
    }
    const synced = userItems.length - failed;

    // Snapshot after sync (unless skipped): none when every item failed,
    // tagged partial when only some did
    const snapshot = providerSyncSnapshot(synced, failed);
    if (!args.skipSnapshot && snapshot.take) {
      try {
        await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
          userId,
          source: "plaid",
          partial: snapshot.partial,
        });
      } catch (snapshotError) {
        console.error("Failed to take portfolio snapshot:", describeError(snapshotError));
      }
    }

    return { success: failed === 0, itemsSynced: synced };
  },
});

/**
 * Sync accounts, then transactions, for each of a user's items. Used by
 * the daily sync and "Sync all" (actions/syncAll.ts); internal, no auth.
 */
export const syncAccountsForUserAdmin = internalAction({
  args: { userId: v.string(), trigger: syncTriggerValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; itemsSynced: number }> => {
    console.log(`[ADMIN] Syncing accounts for user: ${args.userId}`);

    const userItems = await ctx.runQuery(
      internal.banking.getItemsByUserInternal,
      {
        userId: args.userId,
      },
    );

    console.log(`Found ${userItems.length} items to sync`);

    let failed = 0;
    for (const item of userItems) {
      try {
        await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
          itemId: item.itemId,
          trigger: args.trigger,
        });
        console.log(`Synced accounts for item ${item.itemId}`);
      } catch (error) {
        failed++;
        console.error(`Error syncing item ${item.itemId}:`, describeError(error));
        continue;
      }
      // New transactions arrive with the daily sync (ENG-190). Balances are
      // what net worth needs, so transactions run as their own scheduled
      // action: a slow first (full-history) pull or a failure neither delays
      // nor fails the item, the other providers or the snapshot
      await ctx.scheduler.runAfter(
        0,
        internal.actions.plaid.syncItemTransactions,
        { itemId: item.itemId, trigger: args.trigger },
      );
    }

    // A failed item makes the daily snapshot partial (syncAll.ts)
    return { success: failed === 0, itemsSynced: userItems.length - failed };
  },
});

/** Plaid's page size limit for /transactions/sync. */
const TRANSACTIONS_SYNC_PAGE_SIZE = 500;
/** Transactions written per mutation. */
const TRANSACTIONS_WRITE_BATCH = 200;

function plaidErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { error_code?: string } } })
    ?.response?.data?.error_code;
}

/**
 * Incremental transaction sync for one item via /transactions/sync
 * (ENG-230). Reads every change after the stored cursor, applies the
 * upserts and removals in batches, then stores the new cursor, so a failed
 * sync replays from the old cursor (the writes are idempotent).
 *
 * An item's first sync (no cursor) reads the full history. Its cursor is
 * only stored once Plaid reports the historical pull complete, and then the
 * rows the sync did not write are deleted: leftovers of /transactions/get
 * that Plaid no longer lists. Until then each sync re-reads from the start.
 */
export const syncItemTransactions = internalAction({
  args: { itemId: v.string(), trigger: syncTriggerValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ upserted: number; removed: number; complete: boolean }> => {
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });
    if (!item) throw new Error("Item not found");

    return withSyncRun(
      ctx,
      {
        provider: "plaid-transactions",
        userId: item.userId,
        trigger: args.trigger,
      },
      async () => {
        const accessToken = decrypt(item.accessToken);
        const plaidClient = getPlaidClient();
        const startCursor = item.transactionsCursor;
        const syncStartedAt = Date.now();

        try {
          const result = await collectSyncPages(
            async (cursor) => {
              const response = await plaidClient.transactionsSync({
                access_token: accessToken,
                cursor,
                count: TRANSACTIONS_SYNC_PAGE_SIZE,
              });
              const data = response.data;
              return {
                added: data.added.map((t) => toPlaidTransactionRecord(item.itemId, t)),
                modified: data.modified.map((t) =>
                  toPlaidTransactionRecord(item.itemId, t),
                ),
                removed: data.removed.map((t) => t.transaction_id),
                nextCursor: data.next_cursor,
                hasMore: data.has_more,
                updateStatus: data.transactions_update_status,
                accountIds: data.accounts.map((a) => a.account_id),
              };
            },
            startCursor,
            {
              isRestartError: (error) =>
                plaidErrorCode(error) === MUTATION_DURING_PAGINATION,
            },
          );

          const { upserts, removed } = mergeSyncPages(result.pages);
          const upsertBatches = chunk(upserts, TRANSACTIONS_WRITE_BATCH);
          const removedBatches = chunk(removed, TRANSACTIONS_WRITE_BATCH);
          for (let i = 0; i < Math.max(upsertBatches.length, removedBatches.length); i++) {
            await ctx.runMutation(internal.banking.applyTransactionChanges, {
              userId: item.userId,
              upserts: upsertBatches[i] ?? [],
              removed: removedBatches[i] ?? [],
            });
          }

          const initial = !startCursor;
          const complete =
            !initial ||
            result.updateStatus ===
              TransactionsUpdateStatus.HistoricalUpdateComplete;

          if (initial && complete) {
            for (const accountId of result.accountIds) {
              let more = true;
              while (more) {
                ({ more } = await ctx.runMutation(
                  internal.banking.reconcileAccountTransactions,
                  { userId: item.userId, accountId, syncStartedAt },
                ));
              }
            }
          }

          if (complete && result.nextCursor) {
            await ctx.runMutation(internal.banking.saveTransactionsCursor, {
              itemId: item.itemId,
              cursor: result.nextCursor,
            });
          }

          return { upserted: upserts.length, removed: removed.length, complete };
        } catch (error: unknown) {
          // Only a login problem flags the item: the balance sync
          // (syncAccountsInternal) owns item health, and a transactions-only
          // failure (e.g. a bank without the product) must not show a working
          // connection as broken
          if (plaidErrorCode(error) === "ITEM_LOGIN_REQUIRED") {
            await ctx.runMutation(internal.banking.updateItemStatus, {
              itemId: item.itemId,
              status: "error",
              errorCode: "ITEM_LOGIN_REQUIRED",
            });
          }
          throw error;
        }
      },
    );
  },
});

/**
 * Sync transactions for one item or all of the user's items.
 */
export const syncTransactions = action({
  args: { itemId: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    itemsSynced: number;
    itemsFailed: number;
    transactionsChanged: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    await enforceUserRateLimit(ctx, "providerRefresh", userId);

    let items;
    if (args.itemId) {
      const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });
      if (!item || item.userId !== userId) {
        userError("connectionNotFound");
      }
      items = [item];
    } else {
      items = await ctx.runQuery(internal.banking.getItemsByUserInternal, {
        userId,
      });
    }

    let itemsFailed = 0;
    let transactionsChanged = 0;
    for (const item of items) {
      try {
        const result: { upserted: number; removed: number } =
          await ctx.runAction(internal.actions.plaid.syncItemTransactions, {
            itemId: item.itemId,
            trigger: "manual",
          });
        transactionsChanged += result.upserted + result.removed;
      } catch (error) {
        itemsFailed++;
        console.error(
          `Error syncing transactions for item ${item.itemId}:`,
          describeError(error),
        );
      }
    }

    return {
      success: itemsFailed === 0,
      itemsSynced: items.length - itemsFailed,
      itemsFailed,
      transactionsChanged,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// DISCONNECT
// ═══════════════════════════════════════════════════════════════

/**
 * Disconnect a bank: revoke the item at Plaid (`itemRemove`, which ends the
 * user's consent and Plaid's billing for it), then delete the local data.
 *
 * An item Plaid no longer knows (already removed, or its access token
 * invalid) is deleted locally anyway; any other Plaid failure keeps the
 * local data so the user can retry, instead of leaving a live item behind.
 */
export const disconnectItem = action({
  args: { itemId: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });
    if (!item || item.userId !== userId) {
      userError("connectionNotFound");
    }

    if (!(await removeItemAtPlaid(item.accessToken))) {
      userError("plaidDisconnectFailed");
    }

    await ctx.runMutation(internal.banking.deleteItemData, {
      itemId: args.itemId,
      userId,
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOKS (ENG-240)
// ═══════════════════════════════════════════════════════════════

/**
 * Verification keys by kid, per action instance. A key is refetched after
 * KEY_CACHE_TTL_MS so a key Plaid has since expired stops verifying.
 */
const verificationKeys = new Map<string, { key: PlaidWebhookKey; fetchedAt: number }>();
const KEY_CACHE_TTL_MS = 60 * 60 * 1000;

async function getVerificationKey(kid: string): Promise<PlaidWebhookKey | null> {
  const cached = verificationKeys.get(kid);
  if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) return cached.key;
  try {
    const response = await getPlaidClient().webhookVerificationKeyGet({ key_id: kid });
    const key = response.data.key;
    verificationKeys.set(kid, { key, fetchedAt: Date.now() });
    return key;
  } catch (error) {
    // An unknown kid is a 400 from Plaid: not a genuine webhook
    console.warn("Plaid webhook key lookup failed:", describeError(error));
    return null;
  }
}

/**
 * Verify and handle one Plaid webhook (POST /plaid-webhook, http.ts).
 * Returns the HTTP status for Plaid: 401 when verification fails, 200
 * otherwise (also for events that are ignored or name an unknown item, so
 * Plaid does not retry them). The work a webhook triggers (a sync) is
 * scheduled, so the response is quick.
 */
export const receiveWebhook = internalAction({
  args: { body: v.string(), verification: v.optional(v.string()) },
  returns: v.object({ status: v.number() }),
  handler: async (ctx, args): Promise<{ status: number }> => {
    const now = Date.now();
    const verified = await verifyPlaidWebhook({
      token: args.verification,
      body: args.body,
      nowMs: now,
      getKey: getVerificationKey,
    });
    if (!verified.ok) {
      console.warn(
        `Plaid webhook rejected: ${verified.reason} (kid ${plaidWebhookKeyId(args.verification) ?? "none"})`,
      );
      return { status: 401 };
    }

    let body: unknown;
    try {
      body = JSON.parse(args.body);
    } catch {
      return { status: 400 };
    }
    const event = plaidWebhookEvent(body, now);
    if (event.kind === "ignore") {
      console.log(`Plaid webhook ignored: ${event.reason}`);
      return { status: 200 };
    }

    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: event.itemId,
    });
    if (!item) {
      console.log(`Plaid webhook ${event.kind} for unknown item ${event.itemId}`);
      return { status: 200 };
    }
    console.log(`Plaid webhook ${event.kind} for item ${event.itemId}`);

    switch (event.kind) {
      case "item_error":
        await ctx.runMutation(internal.banking.updateItemStatus, {
          itemId: event.itemId,
          status: "error",
          errorCode: event.errorCode,
        });
        break;
      case "consent_expiring":
        if (event.consentExpiresAt !== null) {
          await ctx.runMutation(internal.banking.updateItemConsent, {
            itemId: event.itemId,
            consentExpiresAt: event.consentExpiresAt,
          });
        } else {
          // No time in the payload: the balance sync reads it from Plaid
          await ctx.scheduler.runAfter(0, internal.actions.plaid.syncAccountsInternal, {
            itemId: event.itemId,
            // Not user-initiated: a failure counts like a cron one
            trigger: "scheduled",
          });
        }
        break;
      case "pending_disconnect":
        await ctx.runMutation(internal.banking.updateItemConsent, {
          itemId: event.itemId,
          disconnectExpectedAt: event.disconnectAt,
        });
        break;
      case "login_repaired":
        await ctx.scheduler.runAfter(0, internal.actions.plaid.syncAccountsInternal, {
          itemId: event.itemId,
          trigger: "scheduled",
        });
        break;
      case "sync_transactions":
        await ctx.scheduler.runAfter(0, internal.actions.plaid.syncItemTransactions, {
          itemId: event.itemId,
          trigger: "scheduled",
        });
        break;
    }
    return { status: 200 };
  },
});

/**
 * One-off: point every existing Plaid item's webhook at this deployment
 * (/item/webhook/update). Items linked before ENG-240 have no webhook; new
 * ones get it in createLinkToken. Dry run by default (lists what would
 * change); idempotent.
 *
 *   bunx convex run actions/plaid:updateItemWebhooks
 *   bunx convex run actions/plaid:updateItemWebhooks '{"dryRun":false}'
 */
export const updateItemWebhooks = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    dryRun: v.boolean(),
    webhook: v.string(),
    items: v.number(),
    updated: v.number(),
    failed: v.array(v.object({ itemId: v.string(), errorCode: v.optional(v.string()) })),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    dryRun: boolean;
    webhook: string;
    items: number;
    updated: number;
    failed: { itemId: string; errorCode?: string }[];
  }> => {
    const dryRun = args.dryRun ?? true;
    const webhook = getWebhookUrl();
    if (!webhook) throw new Error("CONVEX_SITE_URL is not set");

    const items: { itemId: string; accessToken: string }[] = await ctx.runQuery(
      internal.banking.listAllItemsInternal,
      {},
    );
    const plaidClient = getPlaidClient();
    let updated = 0;
    const failed: { itemId: string; errorCode?: string }[] = [];

    for (const item of items) {
      if (dryRun) continue;
      try {
        await plaidClient.itemWebhookUpdate({
          access_token: decrypt(item.accessToken),
          webhook,
        });
        updated++;
      } catch (error) {
        console.error(`Webhook update failed for item ${item.itemId}:`, describeError(error));
        failed.push({ itemId: item.itemId, errorCode: plaidErrorCode(error) });
      }
    }

    return { dryRun, webhook, items: items.length, updated, failed };
  },
});

// ═══════════════════════════════════════════════════════════════
// ACCOUNT DELETION (ENG-232)
// ═══════════════════════════════════════════════════════════════

/**
 * Revoke one item at Plaid (`itemRemove`) by its encrypted access token.
 * True once Plaid no longer has the item, also when it was already removed
 * or its token is invalid; false (logged) on any other Plaid failure.
 */
async function removeItemAtPlaid(encryptedAccessToken: string): Promise<boolean> {
  try {
    await getPlaidClient().itemRemove({
      access_token: decrypt(encryptedAccessToken),
    });
    return true;
  } catch (error: unknown) {
    const code = (
      error as { response?: { data?: { error_code?: string } } }
    )?.response?.data?.error_code;
    if (code !== "ITEM_NOT_FOUND" && code !== "INVALID_ACCESS_TOKEN") {
      console.error("Plaid itemRemove error:", describeError(error));
      return false;
    }
    console.warn(`Plaid item already gone (${code})`);
    return true;
  }
}

/**
 * Account deletion (convex/account.ts): revoke every Plaid item of a user.
 * Local data is left to the purge. Returns how many items Plaid could not
 * revoke.
 */
export const revokeItemsForUser = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, args): Promise<{ failed: number }> => {
    const items = await ctx.runQuery(internal.banking.getItemsByUserInternal, {
      userId: args.userId,
    });
    let failed = 0;
    for (const item of items) {
      if (!(await removeItemAtPlaid(item.accessToken))) failed++;
    }
    return { failed };
  },
});
