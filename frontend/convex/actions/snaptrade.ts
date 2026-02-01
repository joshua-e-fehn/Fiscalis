"use node";

import { v } from "convex/values";
import { action, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { encrypt, decrypt } from "../lib/encryption";
import {
  getSnaptradeClient,
  getEncryptionKey,
  normalizeAssetType,
  normalizeAccountType,
  parseSnapTradeError,
  formatErrorForUser,
  requiresReauthentication,
} from "../lib/snaptrade";
import { Id } from "../_generated/dataModel";

// TODO: [Post-Launch] Implement SnapTrade webhooks for real-time updates
// After deploying to production, add webhook handler at:
// - app/(api)/api/webhooks/snaptrade/route.ts
// Events to handle: ACCOUNT_UPDATED, HOLDINGS_UPDATED, CONNECTION_BROKEN, CONNECTION_DELETED
// See docs/SNAPTRADE_INTEGRATION_PLAN.md Phase 10 for implementation guide

// ═══════════════════════════════════════════════════════════════
// USER REGISTRATION ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Register the current user with SnapTrade
 * This must be called before the user can connect any brokers
 *
 * SnapTrade requires users to be registered on their platform.
 * Each user gets a unique userId and userSecret.
 */
export const registerUser = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    success: boolean;
    alreadyRegistered: boolean;
    snaptradeUserId: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Check if user is already registered
    type SnaptradeUserResult = {
      snaptradeUserId: string;
      snaptradeUserSecret: string;
    } | null;
    const existingUser: SnaptradeUserResult = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (existingUser) {
      return {
        success: true,
        alreadyRegistered: true,
        snaptradeUserId: existingUser.snaptradeUserId,
      };
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();

    try {
      // Register user with SnapTrade
      // Use Clerk userId as the SnapTrade userId for consistency
      const response = await snaptrade.authentication.registerSnapTradeUser({
        userId: userId,
      });

      const { userId: snaptradeUserId, userSecret } = response.data;

      if (!snaptradeUserId || !userSecret) {
        throw new Error("SnapTrade registration failed: missing credentials");
      }

      // Encrypt the userSecret before storing
      const encryptedSecret = encrypt(userSecret, encryptionKey);

      // Store in database
      await ctx.runMutation(internal.brokers.upsertSnaptradeUser, {
        userId,
        snaptradeUserId,
        snaptradeUserSecret: encryptedSecret,
      });

      return {
        success: true,
        alreadyRegistered: false,
        snaptradeUserId,
      };
    } catch (error: unknown) {
      console.error("SnapTrade user registration error:", error);

      // Check if user already exists on SnapTrade side
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("already registered") ||
        errorMessage.includes("already exists")
      ) {
        // User exists on SnapTrade but not in our DB - this shouldn't happen normally
        throw new Error("User registration conflict. Please contact support.");
      }

      // Use improved error handling
      throw new Error(formatErrorForUser(error));
    }
  },
});

/**
 * Delete the current user from SnapTrade
 * This will also disconnect all broker connections
 */
export const deleteUser = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      return { success: true, message: "User not registered with SnapTrade" };
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    try {
      // Delete user from SnapTrade
      await snaptrade.authentication.deleteSnapTradeUser({
        userId: snaptradeUser.snaptradeUserId,
      });
    } catch (error) {
      console.error("SnapTrade user deletion error:", error);
      // Continue to clean up our database even if SnapTrade call fails
    }

    // Delete all connections and their data
    const connections = await ctx.runQuery(
      internal.brokers.getConnectionsByUserInternal,
      { userId },
    );

    for (const connection of connections) {
      await ctx.runMutation(internal.brokers.deleteConnectionData, {
        connectionId: connection._id,
      });
    }

    // Delete the SnapTrade user record
    await ctx.runMutation(internal.brokers.deleteSnaptradeUser, { userId });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// CONNECTION ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a URL to open SnapTrade Connect for linking a broker
 * The user will be redirected to this URL to authenticate with their broker
 */
export const createConnectUrl = action({
  args: {
    broker: v.optional(v.string()), // Optional: pre-select a specific broker
    reconnect: v.optional(v.string()), // Connection ID to reconnect (string, not boolean)
    connectionId: v.optional(v.id("brokerConnections")), // For reconnection
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; connectUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get SnapTrade user credentials
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      throw new Error(
        "User not registered with SnapTrade. Call registerUser first.",
      );
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    try {
      // Generate login redirect URL for SnapTrade Connect
      const response = await snaptrade.authentication.loginSnapTradeUser({
        userId: snaptradeUser.snaptradeUserId,
        userSecret,
        broker: args.broker,
        reconnect: args.reconnect,
      });

      // Type guard: response can be EncryptedResponse or LoginRedirectURI
      const data = response.data as { redirectURI?: string };
      const redirectUri = data.redirectURI;

      if (!redirectUri) {
        throw new Error("Failed to get SnapTrade Connect URL");
      }

      return {
        success: true,
        connectUrl: redirectUri,
      };
    } catch (error: unknown) {
      console.error("SnapTrade connect URL error:", error);

      // Check if re-authentication is needed
      if (requiresReauthentication(error)) {
        throw new Error(
          "Your SnapTrade session has expired. Please try again.",
        );
      }

      throw new Error(formatErrorForUser(error));
    }
  },
});

/**
 * Handle the callback after a user connects a broker via SnapTrade Connect
 * This is called after the OAuth redirect with the authorization ID
 */
export const handleCallback = action({
  args: {
    authorizationId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    alreadyExists: boolean;
    connectionId: string;
    brokerName?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get SnapTrade user
    type SnaptradeUserResult = {
      snaptradeUserId: string;
      snaptradeUserSecret: string;
    } | null;
    const snaptradeUser: SnaptradeUserResult = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      throw new Error("User not registered with SnapTrade");
    }

    // Check if this authorization already exists
    type ConnectionResult = { _id: string } | null;
    const existingConnection: ConnectionResult = await ctx.runQuery(
      internal.brokers.getConnectionByAuthorizationId,
      { authorizationId: args.authorizationId },
    );

    if (existingConnection) {
      return {
        success: true,
        alreadyExists: true,
        connectionId: existingConnection._id,
      };
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    try {
      // Get the brokerage authorization details
      const authResponse =
        await snaptrade.connections.detailBrokerageAuthorization({
          userId: snaptradeUser.snaptradeUserId,
          userSecret,
          authorizationId: args.authorizationId,
        });

      const authorization = authResponse.data;

      // Get brokerage info
      const brokerName = authorization.brokerage?.name || "Unknown Broker";
      const brokerSlug = authorization.brokerage?.slug || "unknown";
      const brokerLogo = authorization.brokerage?.logo || undefined;

      // Create the connection in our database
      const connectionId = await ctx.runMutation(
        internal.brokers.createConnection,
        {
          userId,
          snaptradeUserId: snaptradeUser.snaptradeUserId,
          authorizationId: args.authorizationId,
          brokerName,
          brokerSlug,
          brokerLogo,
        },
      );

      // Trigger initial sync of accounts
      await syncAccountsInternal(ctx, {
        userId,
        snaptradeUserId: snaptradeUser.snaptradeUserId,
        userSecret,
        connectionId,
        authorizationId: args.authorizationId,
      });

      return {
        success: true,
        alreadyExists: false,
        connectionId,
        brokerName,
      };
    } catch (error: unknown) {
      console.error("SnapTrade callback error:", error);

      // Provide user-friendly error message
      const parsedError = parseSnapTradeError(error);

      if (parsedError.code === "CONNECTION_NOT_FOUND") {
        throw new Error(
          "The broker connection was not found. Please try connecting again.",
        );
      }

      throw new Error(formatErrorForUser(error));
    }
  },
});

/**
 * Get list of all connections from SnapTrade and sync with our database
 */
export const listConnections = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      return { connections: [] };
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    try {
      const response = await snaptrade.connections.listBrokerageAuthorizations({
        userId: snaptradeUser.snaptradeUserId,
        userSecret,
      });

      return {
        connections: response.data.map((auth) => ({
          authorizationId: auth.id,
          brokerName: auth.brokerage?.name,
          brokerSlug: auth.brokerage?.slug,
          brokerLogo: auth.brokerage?.logo,
          createdAt: auth.created_date,
          updatedAt: auth.updated_date,
        })),
      };
    } catch (error: unknown) {
      console.error("SnapTrade list connections error:", error);
      throw new Error(formatErrorForUser(error));
    }
  },
});

/**
 * Delete a broker connection
 */
export const deleteConnection = action({
  args: {
    connectionId: v.id("brokerConnections"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get connection and verify ownership
    const connection = await ctx.runQuery(
      internal.brokers.getConnectionInternal,
      { connectionId: args.connectionId },
    );

    if (!connection || connection.userId !== userId) {
      throw new Error("Connection not found or unauthorized");
    }

    // Get SnapTrade user
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (snaptradeUser) {
      const snaptrade = getSnaptradeClient();
      const encryptionKey = getEncryptionKey();
      const userSecret = decrypt(
        snaptradeUser.snaptradeUserSecret,
        encryptionKey,
      );

      try {
        // Delete from SnapTrade
        await snaptrade.connections.removeBrokerageAuthorization({
          userId: snaptradeUser.snaptradeUserId,
          userSecret,
          authorizationId: connection.authorizationId,
        });
      } catch (error) {
        console.error("SnapTrade delete connection error:", error);
        // Continue to delete from our database even if SnapTrade call fails
      }
    }

    // Delete from our database
    await ctx.runMutation(internal.brokers.deleteConnectionData, {
      connectionId: args.connectionId,
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// SYNC ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Internal helper to sync accounts for a connection
 */
async function syncAccountsInternal(
  ctx: ActionCtx,
  params: {
    userId: string;
    snaptradeUserId: string;
    userSecret: string;
    connectionId: string;
    authorizationId: string;
  },
): Promise<{ success: boolean; accountsCount: number }> {
  const snaptrade = getSnaptradeClient();

  try {
    // Get accounts from SnapTrade
    const accountsResponse =
      await snaptrade.accountInformation.listUserAccounts({
        userId: params.snaptradeUserId,
        userSecret: params.userSecret,
      });

    const accounts = accountsResponse.data;

    // Filter accounts by this authorization
    // Note: SnapTrade returns all accounts, we need to filter by the authorization
    for (const account of accounts) {
      // Check if this account belongs to the current authorization
      // SnapTrade doesn't always provide authorization ID on accounts, so we accept all
      const snaptradeAccountId = account.id;
      if (!snaptradeAccountId) continue;

      // Note: We intentionally skip balance/cash updates here.
      // The accounts API doesn't return accurate balance data.
      // Balance is calculated from holdings in syncAll/syncPositions.
      await ctx.runMutation(internal.brokers.upsertAccount, {
        userId: params.userId,
        connectionId: params.connectionId as any, // Type casting for Convex ID
        snaptradeAccountId,
        name: account.name || "Unknown Account",
        accountNumber: account.number,
        accountType: normalizeAccountType(account.meta?.type),
        currency: account.meta?.currency || "USD",
        institutionName: account.institution_name,
        skipBalanceUpdate: true, // Don't touch balance - it's updated from holdings
      });
    }

    return { success: true, accountsCount: accounts.length };
  } catch (error) {
    console.error("Sync accounts error:", error);
    throw error;
  }
}

/**
 * Sync accounts for a specific connection
 */
export const syncAccounts = action({
  args: {
    connectionId: v.id("brokerConnections"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get connection
    const connection = await ctx.runQuery(
      internal.brokers.getConnectionInternal,
      { connectionId: args.connectionId },
    );

    if (!connection || connection.userId !== userId) {
      throw new Error("Connection not found or unauthorized");
    }

    // Get SnapTrade user
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      throw new Error("User not registered with SnapTrade");
    }

    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    // Update status to syncing
    await ctx.runMutation(internal.brokers.updateConnectionStatus, {
      connectionId: args.connectionId,
      status: "syncing",
    });

    try {
      await syncAccountsInternal(ctx, {
        userId,
        snaptradeUserId: snaptradeUser.snaptradeUserId,
        userSecret,
        connectionId: args.connectionId,
        authorizationId: connection.authorizationId,
      });

      // Update status to connected
      await ctx.runMutation(internal.brokers.updateConnectionStatus, {
        connectionId: args.connectionId,
        status: "connected",
        lastSyncAt: Date.now(),
      });

      return { success: true };
    } catch (error: unknown) {
      // Update status to error
      await ctx.runMutation(internal.brokers.updateConnectionStatus, {
        connectionId: args.connectionId,
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : "Unknown sync error",
      });

      throw error;
    }
  },
});

/**
 * Sync positions/holdings for a specific account
 */
export const syncPositions = action({
  args: {
    accountId: v.id("brokerAccounts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get account by ID
    const targetAccount = await ctx.runQuery(internal.brokers.getAccountById, {
      accountId: args.accountId,
    });

    if (!targetAccount || targetAccount.userId !== userId) {
      throw new Error("Account not found or unauthorized");
    }

    // Get SnapTrade user
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      throw new Error("User not registered with SnapTrade");
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    try {
      // Get holdings for this account
      const holdingsResponse =
        await snaptrade.accountInformation.getUserHoldings({
          userId: snaptradeUser.snaptradeUserId,
          userSecret,
          accountId: targetAccount.snaptradeAccountId,
        });

      const holdings = holdingsResponse.data;

      // Delete existing positions for this account before upserting
      await ctx.runMutation(internal.brokers.deletePositionsForAccount, {
        accountId: args.accountId,
      });

      let totalMarketValue = 0;

      // Upsert each position
      for (const position of holdings.positions || []) {
        const symbol = position.symbol?.symbol;
        if (!symbol) continue;

        const quantity = position.units || 0;
        const currentPrice = position.price || 0;
        const marketValue = quantity * currentPrice;
        const averageCostBasis = position.average_purchase_price;
        const totalCostBasis = averageCostBasis
          ? averageCostBasis * quantity
          : undefined;

        totalMarketValue += marketValue;

        // Calculate P&L
        let unrealizedPL: number | undefined;
        let unrealizedPLPercent: number | undefined;

        if (totalCostBasis !== undefined && totalCostBasis > 0) {
          unrealizedPL = marketValue - totalCostBasis;
          unrealizedPLPercent = (unrealizedPL / totalCostBasis) * 100;
        }

        await ctx.runMutation(internal.brokers.upsertPosition, {
          userId,
          accountId: args.accountId,
          symbol: String(symbol),
          symbolId: position.symbol?.id,
          name: position.symbol?.description,
          assetType: normalizeAssetType(position.symbol?.type?.code),
          quantity,
          averageCostBasis: averageCostBasis ?? undefined,
          totalCostBasis,
          currentPrice,
          marketValue,
          currency: position.symbol?.currency?.code || "USD",
          isin: position.symbol?.isin,
          cusip: position.symbol?.cusip,
          figi: position.symbol?.figi_code,
          unrealizedPL,
          unrealizedPLPercent,
        });
      }

      // Update account balance
      await ctx.runMutation(internal.brokers.upsertAccount, {
        userId,
        connectionId: targetAccount.connectionId,
        snaptradeAccountId: targetAccount.snaptradeAccountId,
        name: targetAccount.name,
        accountNumber: targetAccount.accountNumber,
        accountType: targetAccount.accountType,
        balance: totalMarketValue + (holdings.total_value?.cash || 0),
        cash: holdings.total_value?.cash,
        currency: targetAccount.currency,
        institutionName: targetAccount.institutionName,
      });

      return {
        success: true,
        positionsCount: holdings.positions?.length || 0,
        totalMarketValue,
      };
    } catch (error: unknown) {
      console.error("Sync positions error:", error);

      // Check if re-auth is needed
      const parsedError = parseSnapTradeError(error);
      if (parsedError.requiresReauth) {
        throw new Error(
          "Broker connection expired. Please reconnect your account.",
        );
      }

      throw new Error(formatErrorForUser(error));
    }
  },
});

/**
 * Update broker logos for all connections
 * This fetches the latest logo from SnapTrade for each connection
 */
export const updateAllBrokerLogos = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    success: boolean;
    message?: string;
    updated?: number;
    failed?: number;
    total?: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get SnapTrade user
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      return { success: false, message: "No SnapTrade user registered" };
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    // Get all connections
    const connections: Array<{
      _id: any;
      authorizationId: string;
      brokerName: string;
    }> = await ctx.runQuery(internal.brokers.getConnectionsByUserInternal, {
      userId,
    });

    let updated = 0;
    let failed = 0;

    console.log(`[UPDATE_LOGOS] Processing ${connections.length} connections`);

    for (const connection of connections) {
      try {
        console.log(
          `[UPDATE_LOGOS] Fetching logo for ${connection.brokerName} (authId: ${connection.authorizationId})`,
        );
        const authResponse =
          await snaptrade.connections.detailBrokerageAuthorization({
            userId: snaptradeUser.snaptradeUserId,
            userSecret,
            authorizationId: connection.authorizationId,
          });

        const brokerage = authResponse.data.brokerage;
        console.log(
          `[UPDATE_LOGOS] Brokerage info for ${connection.brokerName}:`,
          {
            name: brokerage?.name,
            slug: brokerage?.slug,
            logo: brokerage?.logo || "(no logo)",
            logoType: typeof brokerage?.logo,
            fullResponse: JSON.stringify(brokerage, null, 2),
          },
        );

        const brokerLogo = brokerage?.logo;
        if (brokerLogo) {
          console.log(
            `[UPDATE_LOGOS] Updating logo for ${connection.brokerName}: ${brokerLogo}`,
          );
          await ctx.runMutation(internal.brokers.updateConnectionLogo, {
            connectionId: connection._id,
            brokerLogo,
          });
          updated++;
        } else {
          console.log(
            `[UPDATE_LOGOS] No logo available for ${connection.brokerName}`,
          );
        }
      } catch (error) {
        console.error(
          `[UPDATE_LOGOS] Failed to update logo for ${connection.brokerName}:`,
          error,
        );
        failed++;
      }
    }

    console.log(
      `[UPDATE_LOGOS] Complete: ${updated} updated, ${failed} failed, ${connections.length} total`,
    );
    return { success: true, updated, failed, total: connections.length };
  },
});

/**
 * Sync all data for all connections
 */
export const syncAll = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get SnapTrade user
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      return { success: true, message: "No SnapTrade user registered" };
    }

    const snaptrade = getSnaptradeClient();
    const encryptionKey = getEncryptionKey();
    const userSecret = decrypt(
      snaptradeUser.snaptradeUserSecret,
      encryptionKey,
    );

    // Get all connections
    const connections = await ctx.runQuery(
      internal.brokers.getConnectionsByUserInternal,
      { userId },
    );

    const results = {
      connectionsProcessed: 0,
      accountsProcessed: 0,
      positionsProcessed: 0,
      errors: [] as string[],
    };

    for (const connection of connections) {
      try {
        // Update status to syncing
        await ctx.runMutation(internal.brokers.updateConnectionStatus, {
          connectionId: connection._id,
          status: "syncing",
        });

        // Fetch latest brokerage info (including logo) and update if missing
        if (!connection.brokerLogo) {
          try {
            console.log(
              `[SYNC] Fetching logo for ${connection.brokerName} (authId: ${connection.authorizationId})`,
            );
            const authResponse =
              await snaptrade.connections.detailBrokerageAuthorization({
                userId: snaptradeUser.snaptradeUserId,
                userSecret,
                authorizationId: connection.authorizationId,
              });

            const brokerage = authResponse.data.brokerage;
            console.log(`[SYNC] Brokerage info for ${connection.brokerName}:`, {
              name: brokerage?.name,
              slug: brokerage?.slug,
              logo: brokerage?.logo || "(no logo)",
              logoType: typeof brokerage?.logo,
            });

            const brokerLogo = brokerage?.logo;
            if (brokerLogo) {
              console.log(
                `[SYNC] Updating logo for ${connection.brokerName}: ${brokerLogo.substring(0, 50)}...`,
              );
              await ctx.runMutation(internal.brokers.updateConnectionLogo, {
                connectionId: connection._id,
                brokerLogo,
              });
            } else {
              console.log(
                `[SYNC] No logo available for ${connection.brokerName}`,
              );
            }
          } catch (logoError) {
            // Don't fail sync if logo fetch fails
            console.warn(
              `[SYNC] Failed to fetch broker logo for ${connection.brokerName}:`,
              logoError,
            );
          }
        } else {
          console.log(
            `[SYNC] ${connection.brokerName} already has logo: ${connection.brokerLogo.substring(0, 50)}...`,
          );
        }

        // Sync accounts
        await syncAccountsInternal(ctx, {
          userId,
          snaptradeUserId: snaptradeUser.snaptradeUserId,
          userSecret,
          connectionId: connection._id,
          authorizationId: connection.authorizationId,
        });

        results.connectionsProcessed++;

        // Get accounts for this connection
        const accounts = await ctx.runQuery(
          internal.brokers.getAccountsByConnectionInternal,
          { connectionId: connection._id },
        );

        // Sync positions for each account
        for (const account of accounts) {
          try {
            // Delete existing positions
            await ctx.runMutation(internal.brokers.deletePositionsForAccount, {
              accountId: account._id,
            });

            // Get holdings
            const holdingsResponse =
              await snaptrade.accountInformation.getUserHoldings({
                userId: snaptradeUser.snaptradeUserId,
                userSecret,
                accountId: account.snaptradeAccountId,
              });

            const holdings = holdingsResponse.data;

            let totalMarketValue = 0;

            for (const position of holdings.positions || []) {
              const symbol = position.symbol?.symbol;
              if (!symbol) continue;

              const quantity = position.units || 0;
              const currentPrice = position.price || 0;
              const marketValue = quantity * currentPrice;
              const averageCostBasis = position.average_purchase_price;
              const totalCostBasis = averageCostBasis
                ? averageCostBasis * quantity
                : undefined;

              totalMarketValue += marketValue;

              let unrealizedPL: number | undefined;
              let unrealizedPLPercent: number | undefined;

              if (totalCostBasis !== undefined && totalCostBasis > 0) {
                unrealizedPL = marketValue - totalCostBasis;
                unrealizedPLPercent = (unrealizedPL / totalCostBasis) * 100;
              }

              await ctx.runMutation(internal.brokers.upsertPosition, {
                userId,
                accountId: account._id,
                symbol: String(symbol),
                symbolId: position.symbol?.id,
                name: position.symbol?.description,
                assetType: normalizeAssetType(position.symbol?.type?.code),
                quantity,
                averageCostBasis: averageCostBasis ?? undefined,
                totalCostBasis,
                currentPrice,
                marketValue,
                currency: position.symbol?.currency?.code || "USD",
                isin: position.symbol?.isin,
                cusip: position.symbol?.cusip,
                figi: position.symbol?.figi_code,
                unrealizedPL,
                unrealizedPLPercent,
              });

              results.positionsProcessed++;
            }

            // Calculate balance from holdings
            // Use total_value from API if available, otherwise use calculated market value
            const cashValue = holdings.total_value?.cash ?? 0;
            const apiTotalValue = holdings.total_value?.value;
            const calculatedBalance =
              apiTotalValue ?? totalMarketValue + cashValue;

            // Get the current account balance from DB to preserve if needed
            const currentAccount = await ctx.runQuery(
              internal.brokers.getAccountBySnaptradeId,
              { snaptradeAccountId: account.snaptradeAccountId },
            );
            const existingBalance = currentAccount?.balance;

            // Only update balance if we got valid data from the API (non-zero)
            // or if we've never had a balance before
            const hasValidNewBalance = calculatedBalance > 0;

            // Use new balance if valid, otherwise preserve existing
            const finalBalance = hasValidNewBalance
              ? calculatedBalance
              : existingBalance;
            const finalCash = cashValue > 0 ? cashValue : currentAccount?.cash;

            // Update account - always pass the values (either new or preserved)
            await ctx.runMutation(internal.brokers.upsertAccount, {
              userId,
              connectionId: connection._id,
              snaptradeAccountId: account.snaptradeAccountId,
              name: account.name,
              accountNumber: account.accountNumber,
              accountType: account.accountType,
              balance: finalBalance,
              cash: finalCash,
              currency: account.currency,
              institutionName: account.institutionName,
            });

            results.accountsProcessed++;
          } catch (accountError) {
            // Parse the error for better messaging
            const parsedError = parseSnapTradeError(accountError);
            results.errors.push(
              `Account ${account.name}: ${parsedError.userMessage}`,
            );
          }
        }

        // Update connection status
        await ctx.runMutation(internal.brokers.updateConnectionStatus, {
          connectionId: connection._id,
          status: "connected",
          lastSyncAt: Date.now(),
        });
      } catch (connectionError) {
        // Parse the connection error
        const parsedError = parseSnapTradeError(connectionError);
        results.errors.push(
          `Connection ${connection.brokerName}: ${parsedError.userMessage}`,
        );

        // Update status based on error type
        const status = parsedError.requiresReauth ? "reauth_required" : "error";
        await ctx.runMutation(internal.brokers.updateConnectionStatus, {
          connectionId: connection._id,
          status: status as "error" | "reauth_required",
          errorMessage: parsedError.userMessage,
        });
      }
    }

    // Take a portfolio snapshot after sync completes
    try {
      await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
        userId,
        source: "snaptrade",
      });
    } catch (snapshotError) {
      console.error("Failed to take portfolio snapshot:", snapshotError);
      // Don't fail the sync if snapshot fails
    }

    return {
      success: results.errors.length === 0,
      ...results,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// REFERENCE DATA ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get list of available brokers from SnapTrade
 */
export const listBrokers = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const snaptrade = getSnaptradeClient();

    try {
      const response = await snaptrade.referenceData.listAllBrokerages();

      return {
        brokers: response.data.map((broker) => ({
          id: broker.id,
          name: broker.name,
          slug: broker.slug,
          logo: broker.logo,
          url: broker.url,
          description: broker.description,
          isActive: broker.is_real_time_connection,
          openUrl: broker.open_url,
        })),
      };
    } catch (error: unknown) {
      console.error("List brokers error:", error);
      throw new Error(formatErrorForUser(error));
    }
  },
});

/**
 * Search for a specific broker by name
 */
export const searchBrokers = action({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const snaptrade = getSnaptradeClient();

    try {
      const response = await snaptrade.referenceData.listAllBrokerages();

      const searchLower = args.query.toLowerCase();
      const filtered = response.data.filter(
        (broker) =>
          broker.name?.toLowerCase().includes(searchLower) ||
          broker.slug?.toLowerCase().includes(searchLower),
      );

      return {
        brokers: filtered.map((broker) => ({
          id: broker.id,
          name: broker.name,
          slug: broker.slug,
          logo: broker.logo,
          url: broker.url,
          description: broker.description,
        })),
      };
    } catch (error: unknown) {
      console.error("Search brokers error:", error);
      throw new Error(formatErrorForUser(error));
    }
  },
});
