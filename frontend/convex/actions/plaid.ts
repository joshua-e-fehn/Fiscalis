"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { encrypt, decrypt } from "../lib/encryption";

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

// Parse products from environment
function getProducts(): Products[] {
  const products = process.env.PLAID_PRODUCTS?.split(",") || [
    "auth",
    "transactions",
  ];
  return products.map((p) => p.trim().toLowerCase() as Products);
}

// ═══════════════════════════════════════════════════════════════
// LINK TOKEN ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a link token for Plaid Link initialization
 */
export const createLinkToken = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Fiscalis",
      products: getProducts(),
      country_codes: getCountryCodes(),
      language: "en",
    });

    return { linkToken: response.data.link_token };
  },
});

/**
 * Create an update link token for re-authentication
 */
export const createUpdateLinkToken = action({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get the item's access token
    const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
      itemId: args.itemId,
    });

    if (!item || item.userId !== userId) {
      throw new Error("Item not found or unauthorized");
    }

    const accessToken = decrypt(item.accessToken, getEncryptionKey());
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Fiscalis",
      access_token: accessToken,
      country_codes: getCountryCodes(),
      language: "en",
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

    // Encrypt the access token before storing
    const encryptedToken = encrypt(accessToken, getEncryptionKey());

    // Save to database
    await ctx.runMutation(internal.banking.saveItem, {
      userId,
      accessToken: encryptedToken,
      itemId,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
    });

    // Fetch initial accounts
    await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
      itemId,
    });

    return { success: true, itemId };
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
        currency: acc.balances.iso_currency_code ?? "USD",
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
 */
export const refreshAccounts = action({
  args: { itemId: v.optional(v.string()) },
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

    if (args.itemId) {
      // Verify ownership
      const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });

      if (!item || item.userId !== userId) {
        throw new Error("Item not found or unauthorized");
      }

      await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
        itemId: args.itemId,
      });

      // Take a portfolio snapshot after sync
      try {
        await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
          userId,
          source: "plaid",
        });
      } catch (snapshotError) {
        console.error("Failed to take portfolio snapshot:", snapshotError);
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

    for (const item of userItems) {
      try {
        await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
          itemId: item.itemId,
        });
      } catch (error) {
        console.error(`Error syncing item ${item.itemId}:`, error);
      }
    }

    // Take a portfolio snapshot after sync
    try {
      await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
        userId,
        source: "plaid",
      });
    } catch (snapshotError) {
      console.error("Failed to take portfolio snapshot:", snapshotError);
    }

    return { success: true, itemsSynced: userItems.length };
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

    for (const item of userItems) {
      try {
        await ctx.runAction(internal.actions.plaid.syncAccountsInternal, {
          itemId: item.itemId,
        });
        console.log(`Synced accounts for item ${item.itemId}`);
      } catch (error) {
        console.error(`Error syncing item ${item.itemId}:`, error);
      }
    }

    return { success: true, itemsSynced: userItems.length };
  },
});

/**
 * Sync transactions from Plaid
 */
export const syncTransactions = action({
  args: {
    itemId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const plaidClient = getPlaidClient();
    const encryptionKey = getEncryptionKey();

    // Get items to sync
    let items;
    if (args.itemId) {
      const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });
      if (!item || item.userId !== userId) {
        throw new Error("Item not found or unauthorized");
      }
      items = [item];
    } else {
      items = await ctx.runQuery(internal.banking.getItemsByUserInternal, {
        userId,
      });
    }

    const endDate = args.endDate || new Date().toISOString().split("T")[0];
    const startDate =
      args.startDate ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

    let totalSynced = 0;

    for (const item of items) {
      const accessToken = decrypt(item.accessToken, encryptionKey);

      try {
        const response = await plaidClient.transactionsGet({
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
          options: { count: 500 },
        });

        const transactions = response.data.transactions.map((txn) => ({
          accountId: txn.account_id,
          plaidTransactionId: txn.transaction_id,
          amount: txn.amount,
          date: txn.date,
          name: txn.name,
          merchantName: txn.merchant_name ?? undefined,
          category: txn.category?.join(", ") ?? undefined,
          pending: txn.pending,
        }));

        await ctx.runMutation(internal.banking.saveTransactions, {
          userId,
          transactions,
        });

        totalSynced += transactions.length;
      } catch (error: unknown) {
        console.error(
          `Error syncing transactions for item ${item.itemId}:`,
          error,
        );
        const plaidError = error as {
          response?: { data?: { error_code?: string } };
        };
        if (plaidError.response?.data?.error_code) {
          await ctx.runMutation(internal.banking.updateItemStatus, {
            itemId: item.itemId,
            status: "error",
            errorCode: plaidError.response.data.error_code,
          });
        }
      }
    }

    return { success: true, transactionsSynced: totalSynced };
  },
});

/**
 * Get auth data (account and routing numbers)
 */
export const getAuth = action({
  args: { itemId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const plaidClient = getPlaidClient();
    const encryptionKey = getEncryptionKey();

    // Get items
    let items;
    if (args.itemId) {
      const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });
      if (!item || item.userId !== userId) {
        throw new Error("Item not found or unauthorized");
      }
      items = [item];
    } else {
      items = await ctx.runQuery(internal.banking.getItemsByUserInternal, {
        userId,
      });
    }

    const allAccounts: Array<{
      accountId: string;
      name: string;
      mask: string | null;
      type: string;
    }> = [];
    const allNumbers: Array<{
      accountId: string;
      account: string | null;
      routing: string | null;
      wireRouting: string | null;
    }> = [];

    for (const item of items) {
      const accessToken = decrypt(item.accessToken, encryptionKey);

      try {
        const response = await plaidClient.authGet({
          access_token: accessToken,
        });

        for (const acc of response.data.accounts) {
          allAccounts.push({
            accountId: acc.account_id,
            name: acc.name,
            mask: acc.mask,
            type: acc.type,
          });
        }

        for (const num of response.data.numbers.ach) {
          allNumbers.push({
            accountId: num.account_id,
            account: num.account,
            routing: num.routing,
            wireRouting: num.wire_routing,
          });
        }
      } catch (error) {
        console.error(`Error getting auth for item ${item.itemId}:`, error);
      }
    }

    return { accounts: allAccounts, numbers: allNumbers };
  },
});

/**
 * Get identity data (account holder information)
 */
export const getIdentity = action({
  args: { itemId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const plaidClient = getPlaidClient();
    const encryptionKey = getEncryptionKey();

    // Get items
    let items;
    if (args.itemId) {
      const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });
      if (!item || item.userId !== userId) {
        throw new Error("Item not found or unauthorized");
      }
      items = [item];
    } else {
      items = await ctx.runQuery(internal.banking.getItemsByUserInternal, {
        userId,
      });
    }

    const results: Array<{
      itemId: string;
      accounts: Array<{
        accountId: string;
        owners: Array<{
          names: string[];
          emails: Array<{ data: string; primary: boolean; type: string }>;
          phoneNumbers: Array<{ data: string; primary: boolean; type: string }>;
          addresses: Array<{
            data: {
              city: string | null;
              region: string | null;
              postalCode: string | null;
              country: string | null;
              street: string | null;
            };
            primary: boolean;
          }>;
        }>;
      }>;
    }> = [];

    for (const item of items) {
      const accessToken = decrypt(item.accessToken, encryptionKey);

      try {
        const response = await plaidClient.identityGet({
          access_token: accessToken,
        });

        results.push({
          itemId: item.itemId,
          accounts: response.data.accounts.map((acc) => ({
            accountId: acc.account_id,
            owners: (acc.owners || []).map((owner) => ({
              names: owner.names,
              emails: owner.emails.map((e) => ({
                data: e.data,
                primary: e.primary,
                type: String(e.type),
              })),
              phoneNumbers: owner.phone_numbers.map((p) => ({
                data: p.data,
                primary: p.primary,
                type: String(p.type),
              })),
              addresses: owner.addresses.map((a) => ({
                data: {
                  city: a.data.city,
                  region: a.data.region,
                  postalCode: a.data.postal_code,
                  country: a.data.country,
                  street: a.data.street ?? null,
                },
                primary: a.primary ?? false,
              })),
            })),
          })),
        });
      } catch (error) {
        console.error(`Error getting identity for item ${item.itemId}:`, error);
      }
    }

    return { identity: results };
  },
});
