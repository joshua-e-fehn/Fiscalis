"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { encrypt } from "../lib/encryption";
import {
  getVezgoClient,
  getVezgoUser,
  mapProviderType,
  mapAssetCategory,
  mapTransactionType,
} from "../lib/vezgo";

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function getEncryptionKey(): string {
  const key = process.env.CONVEX_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CONVEX_ENCRYPTION_KEY environment variable not set");
  }
  return key;
}

// ═══════════════════════════════════════════════════════════════
// USER REGISTRATION ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Register the current user with Vezgo
 * This must be called before the user can connect any crypto accounts
 *
 * Vezgo requires creating a user token that will be used for all subsequent API calls
 */
export const registerUser = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    success: boolean;
    alreadyRegistered: boolean;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Check if user is already registered
    const existingUser = await ctx.runQuery(
      internal.crypto.getVezgoUserInternal,
      { userId },
    );

    if (existingUser) {
      return {
        success: true,
        alreadyRegistered: true,
      };
    }

    const vezgo = getVezgoClient();
    const encryptionKey = getEncryptionKey();

    try {
      // Log in/create a Vezgo user with our userId as the loginName
      // Vezgo automatically creates the user if it doesn't exist
      const user = vezgo.login(userId);

      // Get the user's token - this creates the user on Vezgo if needed
      const token = await user.getToken();

      if (!token) {
        throw new Error("Vezgo user creation failed: missing token");
      }

      // Encrypt the token before storing
      const encryptedToken = encrypt(token, encryptionKey);

      // Store in database
      await ctx.runMutation(internal.crypto.upsertVezgoUser, {
        userId,
        vezgoToken: encryptedToken,
      });

      return {
        success: true,
        alreadyRegistered: false,
      };
    } catch (error: unknown) {
      console.error("Vezgo user registration error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to register with Vezgo: ${errorMessage}`);
    }
  },
});

/**
 * Delete the current user's Vezgo data
 * This will remove all crypto connections from our database
 */
export const deleteUser = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Delete all connections and their data
    const connections = await ctx.runQuery(
      internal.crypto.getConnectionsByUserInternal,
      { userId },
    );

    for (const connection of connections) {
      await ctx.runMutation(internal.crypto.deleteConnectionData, {
        connectionId: connection._id,
      });
    }

    // Delete the Vezgo user record
    await ctx.runMutation(internal.crypto.deleteVezgoUser, { userId });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// CONNECTION ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the Vezgo Connect URL to link a crypto account
 * The user will be redirected to this URL to authenticate with their exchange/wallet
 *
 * Note: Vezgo Connect requires POST method with token in form data.
 * Returns both URL and token for the client to handle.
 */
export const getConnectUrl = action({
  args: {
    provider: v.optional(v.string()), // Optional: pre-select a specific provider
    providers: v.optional(v.array(v.string())), // Optional: filter to specific providers
    redirectUri: v.string(), // Where to redirect after connection
    origin: v.string(), // The origin URL (e.g., http://localhost:3000) - required for server-side
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    connectUrl: string;
    connectToken: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Check if user is registered with Vezgo
    const vezgoUser = await ctx.runQuery(internal.crypto.getVezgoUserInternal, {
      userId,
    });

    if (!vezgoUser) {
      throw new Error(
        "User not registered with Vezgo. Call registerUser first.",
      );
    }

    try {
      // Get user instance using userId (loginName), not the stored token
      // Vezgo SDK's login() expects a loginName, and internally manages tokens
      const user = getVezgoUser(userId);

      // Log the redirect URI being used
      console.log(
        "Vezgo getConnectData with redirectUri:",
        args.redirectUri,
        "origin:",
        args.origin,
      );

      // Get the connect URL and token using getConnectData
      // Note: 'origin' is required for server-side SDK usage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const connectData = await user.getConnectData({
        redirectURI: args.redirectUri,
        origin: args.origin, // Required for server-side - must match the page embedding the widget
        state: userId, // Pass user ID for callback verification
        lang: "en",
        provider: args.provider,
        providers: args.providers,
      } as any);

      const connectUrl = connectData?.url;
      const connectToken = connectData?.token;

      // Log the generated URL for debugging
      console.log("Vezgo connectUrl:", connectUrl);
      console.log("Vezgo connectToken:", connectToken ? "present" : "missing");

      if (!connectUrl || !connectToken) {
        throw new Error("Failed to get Vezgo Connect URL or token");
      }

      return {
        success: true,
        connectUrl,
        connectToken, // Required for POST method to Vezgo Connect
      };
    } catch (error: unknown) {
      console.error("Vezgo connect URL error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create connect URL: ${errorMessage}`);
    }
  },
});

/**
 * Handle the callback after a user connects a crypto account via Vezgo Connect
 * This is called after the OAuth redirect with the account ID
 */
export const handleCallback = action({
  args: {
    accountId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    alreadyExists: boolean;
    connectionId: string;
    providerName?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get Vezgo user
    const vezgoUser = await ctx.runQuery(internal.crypto.getVezgoUserInternal, {
      userId,
    });

    if (!vezgoUser) {
      throw new Error("User not registered with Vezgo");
    }

    // Check if this account already exists
    const existingConnection = await ctx.runQuery(
      internal.crypto.getConnectionByAccountId,
      { accountId: args.accountId },
    );

    if (existingConnection) {
      return {
        success: true,
        alreadyExists: true,
        connectionId: existingConnection._id,
        providerName: existingConnection.name,
      };
    }

    try {
      // Get user instance using userId (loginName)
      const user = getVezgoUser(userId);

      // Fetch account details from Vezgo
      const account = await user.accounts.getOne(args.accountId);

      if (!account) {
        throw new Error("Account not found on Vezgo");
      }

      // Create connection in our database
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = account.provider as any;
      const connectionId = await ctx.runMutation(
        internal.crypto.createConnection,
        {
          userId,
          accountId: args.accountId,
          provider: provider?.name || "unknown",
          providerType: mapProviderType(
            provider?.auth_type || provider?.type || "wallet",
          ),
          name: provider?.display_name || provider?.name || "Crypto Account",
          logo: provider?.logo || undefined,
        },
      );

      // Schedule initial sync
      await ctx.scheduler.runAfter(
        0,
        internal.actions.vezgo.syncConnectionInternal,
        {
          userId,
          connectionId,
          accountId: args.accountId,
        },
      );

      return {
        success: true,
        alreadyExists: false,
        connectionId,
        providerName: provider?.display_name || provider?.name,
      };
    } catch (error: unknown) {
      console.error("Vezgo callback error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect account: ${errorMessage}`);
    }
  },
});

/**
 * Disconnect a crypto account
 */
export const deleteConnection = action({
  args: {
    connectionId: v.id("vezgoConnections"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Verify ownership
    const connection = await ctx.runQuery(
      internal.crypto.getConnectionInternal,
      { connectionId: args.connectionId },
    );

    if (!connection || connection.userId !== userId) {
      throw new Error("Connection not found or unauthorized");
    }

    // Get Vezgo user
    const vezgoUser = await ctx.runQuery(internal.crypto.getVezgoUserInternal, {
      userId,
    });

    if (vezgoUser) {
      try {
        // Remove from Vezgo using userId
        const user = getVezgoUser(userId);
        await user.accounts.remove(connection.accountId);
      } catch (error) {
        console.error("Vezgo account removal error:", error);
        // Continue to clean up our database even if Vezgo call fails
      }
    }

    // Delete from our database
    await ctx.runMutation(internal.crypto.deleteConnectionData, {
      connectionId: args.connectionId,
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// SYNC ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Sync a single connection's positions
 */
export const syncConnection = action({
  args: {
    connectionId: v.id("vezgoConnections"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Verify ownership
    const connection = await ctx.runQuery(
      internal.crypto.getConnectionInternal,
      { connectionId: args.connectionId },
    );

    if (!connection || connection.userId !== userId) {
      throw new Error("Connection not found or unauthorized");
    }

    // Trigger sync
    await ctx.scheduler.runAfter(
      0,
      internal.actions.vezgo.syncConnectionInternal,
      {
        userId,
        connectionId: args.connectionId,
        accountId: connection.accountId,
      },
    );

    return { success: true, message: "Sync started" };
  },
});

/**
 * Sync all connections for the current user
 */
export const syncAllConnections = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; count: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connections: any[] = await ctx.runQuery(
      internal.crypto.getConnectionsByUserInternal,
      { userId },
    );

    for (const connection of connections) {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.vezgo.syncConnectionInternal,
        {
          userId,
          connectionId: connection._id,
          accountId: connection.accountId,
        },
      );
    }

    return { success: true, count: connections.length };
  },
});

/**
 * Get list of available providers from Vezgo
 */
export const getProviders = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    try {
      const vezgo = getVezgoClient();
      const providers = await vezgo.providers.getList();

      return {
        success: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providers: providers.map((p: any) => ({
          name: p.name || "unknown",
          displayName: p.display_name || p.name || "Unknown Provider",
          type: p.auth_type || p.type,
          logo: p.logo,
        })),
      };
    } catch (error: unknown) {
      console.error("Vezgo get providers error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch providers: ${errorMessage}`);
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL SYNC ACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Internal action to sync a connection's data from Vezgo
 * This runs in Node.js runtime and is called by the scheduler
 */
export const syncConnectionInternal = internalAction({
  args: {
    userId: v.string(),
    connectionId: v.id("vezgoConnections"),
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get Vezgo user
    const vezgoUser = await ctx.runQuery(internal.crypto.getVezgoUserInternal, {
      userId: args.userId,
    });

    if (!vezgoUser) {
      await ctx.runMutation(internal.crypto.updateConnectionStatus, {
        connectionId: args.connectionId,
        status: "error",
        errorMessage: "Vezgo user not found",
      });
      return;
    }

    try {
      // Get user instance using userId (loginName)
      const user = getVezgoUser(args.userId);

      // Fetch account data from Vezgo (includes balances)
      const account = await user.accounts.getOne(args.accountId);

      // Map balances to our positions format
      // Vezgo returns balances array with ticker, amount, fiat_value etc
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedPositions = (account?.balances || []).map((b: any) => ({
        symbol: b.ticker || b.provider_ticker || "UNKNOWN",
        name: b.name || undefined,
        ticker: b.ticker || b.provider_ticker || undefined,
        quantity:
          typeof b.amount === "string" ? parseFloat(b.amount) : b.amount || 0,
        fiatValue:
          typeof b.fiat_value === "string"
            ? parseFloat(b.fiat_value)
            : b.fiat_value || undefined,
        fiatCurrency: b.fiat_ticker || "USD",
        category: mapAssetCategory(b.asset_type || "cryptocurrency"),
        // Additional fields if available
        imageUrl: b.logo || undefined,
      }));

      // Save positions
      await ctx.runMutation(internal.crypto.syncPositions, {
        userId: args.userId,
        connectionId: args.connectionId,
        positions: mappedPositions,
      });

      // Update connection status
      await ctx.runMutation(internal.crypto.updateConnectionStatus, {
        connectionId: args.connectionId,
        status: "active",
        lastSyncAt: Date.now(),
      });
    } catch (error) {
      console.error("Vezgo sync error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await ctx.runMutation(internal.crypto.updateConnectionStatus, {
        connectionId: args.connectionId,
        status: "error",
        errorMessage,
      });
    }
  },
});

/**
 * Internal action to sync a connection's transactions from Vezgo
 */
export const syncTransactionsInternal = internalAction({
  args: {
    userId: v.string(),
    connectionId: v.id("vezgoConnections"),
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get Vezgo user
    const vezgoUser = await ctx.runQuery(internal.crypto.getVezgoUserInternal, {
      userId: args.userId,
    });

    if (!vezgoUser) {
      console.error("Cannot sync transactions: Vezgo user not found");
      return;
    }

    try {
      // Get user instance using userId (loginName)
      const user = getVezgoUser(args.userId);

      // Fetch transactions from Vezgo
      // The Vezgo SDK's transactions.getList takes an options object with accountId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transactions = (await user.transactions.getList({
        accountId: args.accountId,
      })) as any[];

      if (!transactions || transactions.length === 0) {
        return;
      }

      // Map transactions to our schema format
      const mappedTransactions = transactions.map((tx) => ({
        vezgoTransactionId:
          tx.id || `${args.accountId}-${tx.timestamp || Date.now()}`,
        type: mapTransactionType(tx.transaction_type || tx.type || "other"),
        symbol: tx.ticker || tx.symbol || "UNKNOWN",
        quantity:
          typeof tx.amount === "string"
            ? parseFloat(tx.amount)
            : tx.amount || 0,
        fiatValue: tx.fiat_value
          ? typeof tx.fiat_value === "string"
            ? parseFloat(tx.fiat_value)
            : tx.fiat_value
          : undefined,
        fiatCurrency: tx.fiat_ticker || "USD",
        fee: tx.fee
          ? typeof tx.fee === "string"
            ? parseFloat(tx.fee)
            : tx.fee
          : undefined,
        feeCurrency: tx.fee_ticker || undefined,
        fromAddress: tx.from_address || undefined,
        toAddress: tx.to_address || undefined,
        txHash: tx.tx_hash || tx.hash || undefined,
        chain: tx.chain || tx.network || undefined,
        transactionDate: tx.timestamp
          ? new Date(tx.timestamp * 1000).toISOString()
          : new Date().toISOString(),
      }));

      // Save transactions
      await ctx.runMutation(internal.crypto.syncTransactions, {
        userId: args.userId,
        connectionId: args.connectionId,
        transactions: mappedTransactions,
      });
    } catch (error) {
      console.error("Vezgo transaction sync error:", error);
      // Don't update connection status for transaction sync failures
      // Positions are more critical than transactions
    }
  },
});

/**
 * Sync transactions for a single connection
 */
export const syncTransactions = action({
  args: {
    connectionId: v.id("vezgoConnections"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Verify ownership
    const connection = await ctx.runQuery(
      internal.crypto.getConnectionInternal,
      { connectionId: args.connectionId },
    );

    if (!connection || connection.userId !== userId) {
      throw new Error("Connection not found or unauthorized");
    }

    // Trigger transaction sync
    await ctx.scheduler.runAfter(
      0,
      internal.actions.vezgo.syncTransactionsInternal,
      {
        userId,
        connectionId: args.connectionId,
        accountId: connection.accountId,
      },
    );

    return { success: true, message: "Transaction sync started" };
  },
});

/**
 * Sync all transactions for a user (all connections)
 */
export const syncAllTransactions = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; count: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connections: any[] = await ctx.runQuery(
      internal.crypto.getConnectionsByUserInternal,
      { userId },
    );

    for (const connection of connections) {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.vezgo.syncTransactionsInternal,
        {
          userId,
          connectionId: connection._id,
          accountId: connection.accountId,
        },
      );
    }

    return { success: true, count: connections.length };
  },
});

/**
 * Internal action for scheduled sync of all crypto connections
 * Called by the cron job every 6 hours
 */
export const scheduledSyncAllAction = internalAction({
  args: {},
  handler: async (ctx): Promise<{ count: number }> => {
    // Get all connections that need syncing
    const connections: Array<{
      connectionId: string;
      accountId: string;
      userId: string;
    }> = await ctx.runMutation(internal.crypto.scheduledSyncAll);

    if (!connections || connections.length === 0) {
      console.log("No crypto connections to sync");
      return { count: 0 };
    }

    console.log(
      `Scheduled sync starting for ${connections.length} connections`,
    );

    // Schedule sync for each connection
    for (const connection of connections) {
      // Sync positions
      await ctx.scheduler.runAfter(
        0,
        internal.actions.vezgo.syncConnectionInternal,
        {
          userId: connection.userId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          connectionId: connection.connectionId as any,
          accountId: connection.accountId,
        },
      );

      // Sync transactions (with a small delay)
      await ctx.scheduler.runAfter(
        5000,
        internal.actions.vezgo.syncTransactionsInternal,
        {
          userId: connection.userId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          connectionId: connection.connectionId as any,
          accountId: connection.accountId,
        },
      );
    }

    return { count: connections.length };
  },
});
