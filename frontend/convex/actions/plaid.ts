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
import { plaidLinkProducts } from "../../../services/banking/plaidProducts";
import { enforceUserRateLimit } from "../lib/rateLimit";
import { userError } from "../lib/userError";
import {
  chunk,
  collectSyncPages,
  mergeSyncPages,
  MUTATION_DURING_PAGINATION,
  toPlaidTransactionRecord,
} from "../../../services/banking/transactionSync";

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

function getEncryptionKey(): string {
  const key = process.env.CONVEX_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CONVEX_ENCRYPTION_KEY environment variable is not set");
  }
  return key;
}

// Parse country codes from environment
function getCountryCodes(): CountryCode[] {
  const codes = process.env.PLAID_COUNTRY_CODES?.split(",") || ["US"];
  return codes.map((code) => code.trim().toUpperCase() as CountryCode);
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
 * should not be German inside an English app. Plaid's language codes match
 * the app's for every supported language (en, de).
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
    await enforceUserRateLimit(ctx, "providerLink", userId);
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Fiscalis",
      products: getProducts(),
      country_codes: getCountryCodes(),
      language: args.language ?? "en",
    });

    return { linkToken: response.data.link_token };
  },
});

/**
 * Create an update link token for re-authentication
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

    const accessToken = decrypt(item.accessToken, getEncryptionKey());
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Fiscalis",
      access_token: accessToken,
      country_codes: getCountryCodes(),
      language: args.language ?? "en",
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
    const encryptedToken = encrypt(accessToken, getEncryptionKey());

    // Save to database
    await ctx.runMutation(internal.banking.saveItem, {
      userId,
      accessToken: encryptedToken,
      itemId,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
      institutionLogo,
      institutionPrimaryColor,
    });

    // Fetch initial accounts
    await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
      itemId,
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
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    // Get item with encrypted token
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });

    if (!item) throw new Error("Item not found");

    const accessToken = decrypt(item.accessToken, getEncryptionKey());
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
});

/**
 * Public action to refresh accounts for all items or a specific item
 * @param skipSnapshot - If true, don't create a snapshot (used by syncAll to avoid duplicates)
 */
export const refreshAccounts = action({
  args: {
    itemId: v.optional(v.string()),
    skipSnapshot: v.optional(v.boolean()),
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

      await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
        itemId: args.itemId,
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
 * Admin action to sync accounts for a user - for use from dashboard without auth
 */
export const syncAccountsForUserAdmin = internalAction({
  args: { userId: v.string() },
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
        });
        console.log(`Synced accounts for item ${item.itemId}`);
      } catch (error) {
        failed++;
        console.error(`Error syncing item ${item.itemId}:`, describeError(error));
      }
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
  args: { itemId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ upserted: number; removed: number; complete: boolean }> => {
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });
    if (!item) throw new Error("Item not found");

    const accessToken = decrypt(item.accessToken, getEncryptionKey());
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

    try {
      await getPlaidClient().itemRemove({
        access_token: decrypt(item.accessToken, getEncryptionKey()),
      });
    } catch (error: unknown) {
      const code = (
        error as { response?: { data?: { error_code?: string } } }
      )?.response?.data?.error_code;
      if (code !== "ITEM_NOT_FOUND" && code !== "INVALID_ACCESS_TOKEN") {
        console.error("Plaid itemRemove error:", describeError(error));
        userError("plaidDisconnectFailed");
      }
      console.warn(`Plaid item already gone (${code}); deleting locally`);
    }

    await ctx.runMutation(internal.banking.deleteItemData, {
      itemId: args.itemId,
      userId,
    });

    return { success: true };
  },
});
