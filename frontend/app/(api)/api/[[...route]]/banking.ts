import { Hono } from "hono";

import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { db } from "@/db/drizzle/drizzle";
import { plaidItems, plaidTransactions } from "@/db/drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

import { auth } from "@clerk/nextjs/server";

import { CountryCode, Products } from "plaid";
import { plaidClient } from "@/lib/plaid";
import { PlaidAccount } from "@/lib/types/banking";

// Parse environment variables for Plaid configuration
const PLAID_PRODUCTS = (
  process.env.PLAID_PRODUCTS || "auth,transactions,identity"
).split(",") as Products[];

const PLAID_COUNTRY_CODES = (
  process.env.PLAID_COUNTRY_CODES || "US,DE,GB,FR,ES,IT"
).split(",") as CountryCode[];

const ParamsSchema = {
  exchangeTokenSchema: z.object({
    publicToken: z.string(),
    institutionId: z.string().optional(),
    institutionName: z.string().optional(),
  }),
  transactionsSchema: z.object({
    itemId: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
};

// Helper function to get access token for a user
async function getUserAccessToken(userId: string, itemId?: string) {
  const query = itemId
    ? and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId))
    : eq(plaidItems.userId, userId);

  const items = await db.select().from(plaidItems).where(query);

  if (items.length === 0) {
    throw new Error("No linked accounts found");
  }

  // Return first item if no specific itemId requested
  return items[0].accessToken;
}

const app = new Hono()
  // Create link token
  .post("/create-link-token", async (c) => {
    const { userId } = auth();

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: "Fiscalis",
        products: PLAID_PRODUCTS,
        country_codes: PLAID_COUNTRY_CODES,
        language: "en",
      });

      return c.json({ linkToken: response.data.link_token });
    } catch (error: any) {
      console.error(
        "Error creating link token:",
        error.response?.data || error
      );
      return c.json({ error: "Failed to create link token" }, 500);
    }
  })
  // Exchange public token for access token
  .post(
    "/exchange-token",
    zValidator("json", ParamsSchema.exchangeTokenSchema),
    async (c) => {
      const { userId } = auth();

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { publicToken, institutionId, institutionName } =
        c.req.valid("json");

      try {
        // Exchange the public token for an access token
        const exchangeResponse = await plaidClient.itemPublicTokenExchange({
          public_token: publicToken,
        });

        const accessToken = exchangeResponse.data.access_token;
        const itemId = exchangeResponse.data.item_id;

        // Store in database
        await db.insert(plaidItems).values({
          userId,
          accessToken,
          itemId,
          institutionId: institutionId || null,
          institutionName: institutionName || null,
        });

        return c.json({ success: true });
      } catch (error: any) {
        console.error("Error exchanging token:", error.response?.data || error);
        return c.json({ error: "Failed to exchange token" }, 500);
      }
    }
  )
  // Get linked accounts
  .get("/accounts", async (c) => {
    const { userId } = auth();

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Find all user's Plaid items
      const items = await db
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.userId, userId));

      if (items.length === 0) {
        return c.json({ accounts: [] });
      }

      // Fetch accounts for each item
      const accountsPromises = items.map(async (item) => {
        try {
          const response = await plaidClient.accountsGet({
            access_token: item.accessToken,
          });

          // Map to our format with institution info
          return response.data.accounts.map(
            (account): PlaidAccount => ({
              id: account.account_id,
              name: account.name,
              mask: account.mask,
              type: account.type,
              subtype: account.subtype,
              balance: {
                current: account.balances.current || 0,
                available: account.balances.available || 0,
                limit: account.balances.limit,
                currency:
                  account.balances.iso_currency_code ||
                  account.balances.unofficial_currency_code ||
                  "USD",
              },
              institution: {
                id: item.institutionId,
                name: item.institutionName,
                itemId: item.itemId,
              },
            })
          );
        } catch (error) {
          console.error(
            `Error fetching accounts for item ${item.itemId}:`,
            error
          );
          return [];
        }
      });

      const accountsArrays = await Promise.all(accountsPromises);
      const accounts = accountsArrays.flat();

      return c.json({ accounts });
    } catch (error) {
      console.error("Error fetching accounts:", error);
      return c.json({ error: "Failed to fetch accounts" }, 500);
    }
  })
  // Get account auth data (account and routing numbers)
  .get("/auth/:itemId?", async (c) => {
    const { userId } = auth();
    const itemId = c.req.param("itemId");

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const accessToken = await getUserAccessToken(userId, itemId);

      const authResponse = await plaidClient.authGet({
        access_token: accessToken,
      });

      // Format the response to hide sensitive data in logs
      const accounts = authResponse.data.accounts.map(
        (account): PlaidAccount => ({
          id: account.account_id,
          name: account.name,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
        })
      );

      const numbers = authResponse.data.numbers;

      return c.json({ accounts, numbers });
    } catch (error: any) {
      console.error("Error fetching auth data:", error.response?.data || error);
      return c.json({ error: "Failed to fetch auth data" }, 500);
    }
  })
  // Get user identity information
  .get("/identity/:itemId?", async (c) => {
    const { userId } = auth();
    const itemId = c.req.param("itemId");

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const accessToken = await getUserAccessToken(userId, itemId);

      const identityResponse = await plaidClient.identityGet({
        access_token: accessToken,
      });

      return c.json({
        accounts: identityResponse.data.accounts,
        identity: identityResponse.data.accounts
          .map((account) => account.owners)
          .flat(),
      });
    } catch (error: any) {
      console.error(
        "Error fetching identity data:",
        error.response?.data || error
      );
      return c.json({ error: "Failed to fetch identity data" }, 500);
    }
  })
  // Get transactions
  .get(
    "/transactions",
    zValidator("query", ParamsSchema.transactionsSchema),
    async (c) => {
      const { userId } = auth();
      const { itemId, startDate, endDate } = c.req.valid("query");

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      try {
        const query = itemId
          ? and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId))
          : eq(plaidItems.userId, userId);

        const items = await db.select().from(plaidItems).where(query);

        if (items.length === 0) {
          return c.json({ transactions: [] });
        }

        // For each connected account, get transactions
        const allTransactions = [];

        for (const item of items) {
          try {
            // Get up to 100 transactions for this item
            const response = await plaidClient.transactionsGet({
              access_token: item.accessToken,
              start_date: startDate,
              end_date: endDate,
              options: {
                count: 100,
                offset: 0,
              },
            });

            // Add institution info to transactions
            const enrichedTransactions = response.data.transactions.map(
              (transaction) => ({
                id: transaction.transaction_id,
                accountId: transaction.account_id,
                amount: transaction.amount,
                date: transaction.date,
                name: transaction.name,
                merchantName: transaction.merchant_name,
                categories: transaction.category,
                pending: transaction.pending,
                institution: {
                  id: item.institutionId,
                  name: item.institutionName,
                },
              })
            );

            allTransactions.push(...enrichedTransactions);

            // Store transactions in database for future reference
            const transactionsToInsert = response.data.transactions.map(
              (transaction) => ({
                plaidTransactionId: transaction.transaction_id,
                userId,
                accountId: transaction.account_id,
                amount: String(transaction.amount),
                date: new Date(transaction.date),
                name: transaction.name,
                merchantName: transaction.merchant_name || null,
                category: transaction.category?.[0] || null,
                pending: transaction.pending,
              })
            );

            // Insert new transactions, ignoring duplicates
            // This is a simplified approach; in production you'd want to update changed transactions
            if (transactionsToInsert.length > 0) {
              await db
                .insert(plaidTransactions)
                .values(transactionsToInsert)
                .onConflictDoNothing({
                  target: [
                    plaidTransactions.plaidTransactionId,
                    plaidTransactions.userId,
                  ],
                });
            }
          } catch (error: any) {
            console.error(
              `Error fetching transactions for item ${item.itemId}:`,
              error.response?.data || error
            );
            // Continue with other items even if one fails
          }
        }

        // Sort transactions by date (most recent first)
        allTransactions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        return c.json({ transactions: allTransactions });
      } catch (error) {
        console.error("Error fetching transactions:", error);
        return c.json({ error: "Failed to fetch transactions" }, 500);
      }
    }
  )
  // Get transactions from database
  .get("/transactions/db", async (c) => {
    const { userId } = auth();
    const limit = Number(c.req.query("limit") || "50");

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Get transactions from our database
      const transactions = await db
        .select()
        .from(plaidTransactions)
        .where(eq(plaidTransactions.userId, userId))
        .orderBy(desc(plaidTransactions.date))
        .limit(limit);

      return c.json({ transactions });
    } catch (error) {
      console.error("Error fetching transactions from database:", error);
      return c.json({ error: "Failed to fetch transactions" }, 500);
    }
  })
  // Get account balances summary
  .get("/balances/summary", async (c) => {
    const { userId } = auth();

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Find all user's Plaid items
      const items = await db
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.userId, userId));

      if (items.length === 0) {
        return c.json({
          totalBalances: {},
          accountTypeTotals: {},
        });
      }

      // Track balances by currency and account type
      const balancesByCurrency: Record<string, number> = {};
      const accountTypeTotals: Record<string, Record<string, number>> = {};

      // Fetch accounts for each item
      for (const item of items) {
        try {
          const response = await plaidClient.accountsGet({
            access_token: item.accessToken,
          });

          for (const account of response.data.accounts) {
            const currency =
              account.balances.iso_currency_code ||
              account.balances.unofficial_currency_code ||
              "USD";
            const currentBalance = account.balances.current || 0;

            // Add to currency total
            if (!balancesByCurrency[currency]) {
              balancesByCurrency[currency] = 0;
            }
            balancesByCurrency[currency] += currentBalance;

            // Add to account type total
            if (!accountTypeTotals[account.type]) {
              accountTypeTotals[account.type] = {};
            }
            if (!accountTypeTotals[account.type][currency]) {
              accountTypeTotals[account.type][currency] = 0;
            }
            accountTypeTotals[account.type][currency] += currentBalance;
          }
        } catch (error) {
          console.error(
            `Error fetching balances for item ${item.itemId}:`,
            error
          );
        }
      }

      return c.json({
        totalBalances: balancesByCurrency,
        accountTypeTotals,
      });
    } catch (error) {
      console.error("Error calculating balance summary:", error);
      return c.json({ error: "Failed to calculate balance summary" }, 500);
    }
  })
  // Refresh transactions (webhook simulation / manual sync of last 30 days)
  .post("/transactions/refresh", async (c) => {
    const { userId } = auth();

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Simulate transaction webhook by fetching new data
      const items = await db
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.userId, userId));

      if (items.length === 0) {
        return c.json({ status: "no_accounts" });
      }

      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = thirtyDaysAgo.toISOString().split("T")[0];
      const endDate = today.toISOString().split("T")[0];

      let newTransactionsCount = 0;

      // For each item, get the latest transactions
      for (const item of items) {
        try {
          const response = await plaidClient.transactionsGet({
            access_token: item.accessToken,
            start_date: startDate,
            end_date: endDate,
          });

          const transactionsToInsert = response.data.transactions.map(
            (transaction) => ({
              plaidTransactionId: transaction.transaction_id,
              userId,
              accountId: transaction.account_id,
              amount: String(transaction.amount),
              date: new Date(transaction.date),
              name: transaction.name,
              merchantName: transaction.merchant_name || null,
              category: transaction.category?.[0] || null,
              pending: transaction.pending,
            })
          );

          // Insert transactions, count new ones
          if (transactionsToInsert.length > 0) {
            const result = await db
              .insert(plaidTransactions)
              .values(transactionsToInsert)
              .onConflictDoNothing({
                target: [
                  plaidTransactions.plaidTransactionId,
                  plaidTransactions.userId,
                ],
              });

            // Postgres returns the number of rows inserted
            if (result.rowCount) {
              newTransactionsCount += result.rowCount;
            }
          }
        } catch (error) {
          console.error(
            `Error refreshing transactions for item ${item.itemId}:`,
            error
          );
        }
      }

      return c.json({
        status: "success",
        newTransactions: newTransactionsCount,
      });
    } catch (error) {
      console.error("Error refreshing transactions:", error);
      return c.json({ error: "Failed to refresh transactions" }, 500);
    }
  });

export default app;
