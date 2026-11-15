"use node";

import { v } from "convex/values";
import { action, ActionCtx, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { encrypt, decrypt } from "../lib/encryption";
import {
  getSnaptradeClient,
  normalizeAccountType,
  parseSnapTradeError,
  requiresReauthentication,
  snaptradeUserError,
  withSnaptradeRetry,
} from "../lib/snaptrade";
import { userError, type UserErrorCode } from "../lib/userError";
import { Doc, Id } from "../_generated/dataModel";
import {
  mapSnaptradeHoldings,
  snaptradeHoldingsCurrency,
} from "../../../services/brokers/snaptradePosition";
import {
  ACTIVITY_PAGE_SIZE,
  activitiesStartDate,
  fetchActivityPagesOldestFirst,
  mapSnaptradeActivity,
  type StoredSnaptradeActivity,
} from "../../../services/brokers/snaptradeActivity";
import { providerSyncSnapshot } from "../../../services/portfolio/aggregate";
import { describeError } from "../../../services/security/providerError";
import { snaptradeFailureStatus } from "../../../services/security/connectionStatus";
import { enforceUserRateLimit } from "../lib/rateLimit";
import { withSyncRun, type SyncTrigger } from "../lib/syncRuns";
import { syncTriggerValidator } from "../lib/syncRunValidators";
import { itemsOutcome } from "../../../services/health/syncRuns";

// TODO: [Post-Launch] Implement SnapTrade webhooks for real-time updates
// After deploying to production, add webhook handler at:
// - app/(api)/api/webhooks/snaptrade/route.ts
// Events to handle: ACCOUNT_UPDATED, HOLDINGS_UPDATED, CONNECTION_BROKEN, CONNECTION_DELETED
// See docs/archive/SNAPTRADE_INTEGRATION_PLAN.md Phase 10 for implementation guide

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
      const encryptedSecret = encrypt(userSecret);

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
      console.error("SnapTrade user registration error:", describeError(error));

      // Check if user already exists on SnapTrade side
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("already registered") ||
        errorMessage.includes("already exists")
      ) {
        // User exists on SnapTrade but not in our DB - this shouldn't happen normally
        userError("snaptradeRegistrationConflict");
      }

      // Use improved error handling
      snaptradeUserError(error);
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
    // Decrypting the stored secret fails fast (before any deletion) when the
    // encryption key or secret is invalid; the plaintext itself is not needed.
    decrypt(snaptradeUser.snaptradeUserSecret);

    try {
      // Delete user from SnapTrade
      await snaptrade.authentication.deleteSnapTradeUser({
        userId: snaptradeUser.snaptradeUserId,
      });
    } catch (error) {
      console.error("SnapTrade user deletion error:", describeError(error));
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
    // Repair this existing connection: the server sends its SnapTrade
    // authorization ID as `reconnect` (never a client-supplied value)
    connectionId: v.optional(v.id("brokerConnections")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; connectUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    await enforceUserRateLimit(ctx, "providerLink", userId);

    // Get SnapTrade user credentials
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (!snaptradeUser) {
      userError("snaptradeNotRegistered");
    }

    // Reconnect: SnapTrade expects the authorization ID of the connection
    // to repair, not the broker slug. Only the caller's own connection.
    let broker = args.broker;
    let reconnect: string | undefined;
    if (args.connectionId) {
      const connection = await ctx.runQuery(
        internal.brokers.getConnectionInternal,
        { connectionId: args.connectionId },
      );
      if (!connection || connection.userId !== userId) {
        userError("connectionNotFound");
      }
      reconnect = connection.authorizationId;
      broker = connection.brokerSlug;
    }

    const snaptrade = getSnaptradeClient();
    const userSecret = decrypt(snaptradeUser.snaptradeUserSecret);

    try {
      // Generate login redirect URL for SnapTrade Connect
      const response = await snaptrade.authentication.loginSnapTradeUser({
        userId: snaptradeUser.snaptradeUserId,
        userSecret,
        broker,
        reconnect,
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
      console.error("SnapTrade connect URL error:", describeError(error));

      // Check if re-authentication is needed
      if (requiresReauthentication(error)) {
        userError("snaptradeSessionExpired");
      }

      snaptradeUserError(error);
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
      userError("snaptradeNotRegistered");
    }

    // An authorization we already store: the portal returned from a
    // reconnect (createConnectUrl with connectionId). Re-sync it now so the
    // repaired connection leaves its error state without waiting for the
    // nightly sync
    const existingConnection: Doc<"brokerConnections"> | null =
      await ctx.runQuery(internal.brokers.getConnectionByAuthorizationId, {
        authorizationId: args.authorizationId,
      });

    if (existingConnection) {
      if (existingConnection.userId !== userId) {
        userError("connectionNotFound");
      }
      await syncConnectionAndSnapshot(
        ctx,
        userId,
        existingConnection._id,
        "snaptrade-reconnect",
      );
      return {
        success: true,
        alreadyExists: true,
        connectionId: existingConnection._id,
        brokerName: existingConnection.brokerName,
      };
    }

    const snaptrade = getSnaptradeClient();
    const userSecret = decrypt(snaptradeUser.snaptradeUserSecret);

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

      // Initial sync of the new connection's accounts and holdings
      await syncConnectionAndSnapshot(
        ctx,
        userId,
        connectionId,
        "snaptrade-connect",
      );

      return {
        success: true,
        alreadyExists: false,
        connectionId,
        brokerName,
      };
    } catch (error: unknown) {
      console.error("SnapTrade callback error:", describeError(error));

      // Provide user-friendly error message
      const parsedError = parseSnapTradeError(error);

      if (parsedError.code === "CONNECTION_NOT_FOUND") {
        userError("snaptradeConnectionNotFound");
      }

      snaptradeUserError(error);
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
    const userSecret = decrypt(snaptradeUser.snaptradeUserSecret);

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
      console.error("SnapTrade list connections error:", describeError(error));
      snaptradeUserError(error);
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
      userError("connectionNotFound");
    }

    // Get SnapTrade user
    const snaptradeUser = await ctx.runQuery(
      internal.brokers.getSnaptradeUserInternal,
      { userId },
    );

    if (snaptradeUser) {
      const snaptrade = getSnaptradeClient();
      const userSecret = decrypt(snaptradeUser.snaptradeUserSecret);

      try {
        // Delete from SnapTrade
        await snaptrade.connections.removeBrokerageAuthorization({
          userId: snaptradeUser.snaptradeUserId,
          userSecret,
          authorizationId: connection.authorizationId,
        });
      } catch (error) {
        // Already gone at SnapTrade: nothing left to revoke. Anything else
        // keeps the local data so the user can retry, rather than leaving a
        // live authorization behind
        const parsedError = parseSnapTradeError(error);
        if (
          parsedError.code !== "CONNECTION_NOT_FOUND" &&
          parsedError.code !== "USER_NOT_FOUND"
        ) {
          console.error(
            "SnapTrade delete connection error:",
            describeError(error),
          );
          snaptradeUserError(error);
        }
      }
    }

    // Delete from our database
    await ctx.runMutation(internal.brokers.deleteConnectionData, {
      connectionId: args.connectionId,
    });

    // Take a snapshot after disconnection to capture the portfolio change
    await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
      userId,
      source: "snaptrade-disconnect",
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// SYNC ACTIONS
// ═══════════════════════════════════════════════════════════════


/** Counts and failures of one SnapTrade sync. */
interface SnaptradeSyncResult {
  connectionsProcessed: number;
  accountsProcessed: number;
  positionsProcessed: number;
  /** One user-facing message per connection or account that failed */
  errors: string[];
  /** The first failure's user error code, for the syncRuns ledger */
  errorCode?: string;
}

/** Whether a sync takes a snapshot: accounts stored vs failures reported. */
function snaptradeSyncSnapshot(result: SnaptradeSyncResult) {
  return providerSyncSnapshot(result.accountsProcessed, result.errors.length);
}

/**
 * Sync one connection's accounts and holdings, then snapshot the portfolio.
 * A failed sync leaves the connection in an error state for a later retry;
 * no snapshot when nothing synced, tagged partial when only some accounts
 * did.
 */
async function syncConnectionAndSnapshot(
  ctx: ActionCtx,
  userId: string,
  connectionId: Id<"brokerConnections">,
  source: "snaptrade-connect" | "snaptrade-reconnect",
): Promise<void> {
  const syncResult = await syncSnaptrade(
    ctx,
    userId,
    { kind: "connection", connectionId },
    "manual",
  );
  const snapshot = syncResult && snaptradeSyncSnapshot(syncResult);
  if (snapshot?.take) {
    await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
      userId,
      source,
      partial: snapshot.partial,
    });
  }
}

/** What a sync covers: every connection, one connection, or one account. */
type SnaptradeSyncScope =
  | { kind: "all" }
  | { kind: "connection"; connectionId: Id<"brokerConnections"> }
  | { kind: "account"; accountId: Id<"brokerAccounts"> };

/**
 * Fetch the broker logo for a connection that has none (best effort).
 */
async function refreshConnectionLogo(
  ctx: ActionCtx,
  credentials: { userId: string; userSecret: string },
  connection: Doc<"brokerConnections">,
): Promise<void> {
  try {
    const authResponse =
      await getSnaptradeClient().connections.detailBrokerageAuthorization({
        ...credentials,
        authorizationId: connection.authorizationId,
      });
    const brokerLogo = authResponse.data.brokerage?.logo;
    if (brokerLogo) {
      await ctx.runMutation(internal.brokers.updateConnectionLogo, {
        connectionId: connection._id,
        brokerLogo,
      });
    }
  } catch (logoError) {
    console.warn(
      `[SNAPTRADE SYNC] Failed to fetch broker logo for ${connection.brokerName}:`,
      describeError(logoError),
    );
  }
}

/**
 * The one SnapTrade sync, behind every entry point (connect callback,
 * per-connection and per-account syncs, sync-all, the nightly cron).
 *
 * - Accounts are listed once and each is attached to the connection whose
 *   authorization it reports (`brokerage_authorization`), so disconnecting
 *   one broker never removes another broker's accounts.
 * - Holdings are fetched before anything is written, then mapped by
 *   services/brokers/snaptradePosition.ts and stored per account in one
 *   mutation (brokers.replaceAccountHoldings). A failed fetch leaves that
 *   account's stored positions, balance and cash as they were and is
 *   reported in `errors`.
 * - After its holdings, each account's new activities are fetched
 *   incrementally (syncAccountActivities) for exact snapshot flows. A
 *   failure there is logged, not reported: the holdings are current and
 *   the snapshot falls back to the cost proxy.
 *
 * Returns null when the user is not registered with SnapTrade (and records
 * no run); otherwise the sync is one row of the syncRuns ledger.
 */
async function syncSnaptrade(
  ctx: ActionCtx,
  userId: string,
  scope: SnaptradeSyncScope,
  trigger: SyncTrigger,
): Promise<SnaptradeSyncResult | null> {
  const snaptradeUser: Doc<"snaptradeUsers"> | null = await ctx.runQuery(
    internal.brokers.getSnaptradeUserInternal,
    { userId },
  );
  if (!snaptradeUser) return null;
  return withSyncRun(
    ctx,
    { provider: "snaptrade", userId, trigger },
    () => syncRegisteredSnaptradeUser(ctx, userId, snaptradeUser, scope),
    (result) =>
      itemsOutcome(result.accountsProcessed, result.errors.length, result.errorCode),
  );
}

/** syncSnaptrade for a user registered with SnapTrade. */
async function syncRegisteredSnaptradeUser(
  ctx: ActionCtx,
  userId: string,
  snaptradeUser: Doc<"snaptradeUsers">,
  scope: SnaptradeSyncScope,
): Promise<SnaptradeSyncResult> {
  const snaptrade = getSnaptradeClient();
  const credentials = {
    userId: snaptradeUser.snaptradeUserId,
    userSecret: decrypt(snaptradeUser.snaptradeUserSecret),
  };

  const result: SnaptradeSyncResult = {
    connectionsProcessed: 0,
    accountsProcessed: 0,
    positionsProcessed: 0,
    errors: [],
  };

  const allConnections: Doc<"brokerConnections">[] = await ctx.runQuery(
    internal.brokers.getConnectionsByUserInternal,
    { userId },
  );

  let targetSnaptradeAccountId: string | undefined;
  if (scope.kind === "account") {
    const target: Doc<"brokerAccounts"> | null = await ctx.runQuery(
      internal.brokers.getAccountById,
      { accountId: scope.accountId },
    );
    if (!target || target.userId !== userId) {
      userError("accountNotFound");
    }
    targetSnaptradeAccountId = target.snaptradeAccountId;
  }

  let listedAccounts;
  try {
    listedAccounts = (
      await withSnaptradeRetry(() =>
        snaptrade.accountInformation.listUserAccounts(credentials),
      )
    ).data;
  } catch (listError) {
    // Nothing was fetched, so nothing is written; the connections show why
    const parsedError = parseSnapTradeError(listError);
    if (scope.kind === "account") userError(parsedError.userCode);
    for (const connection of allConnections) {
      if (scope.kind === "connection" && connection._id !== scope.connectionId) {
        continue;
      }
      await ctx.runMutation(internal.brokers.updateConnectionStatus, {
        connectionId: connection._id,
        status: snaptradeFailureStatus(parsedError),
        errorMessage: parsedError.userCode,
      });
    }
    result.errors.push(`SnapTrade accounts: ${parsedError.message}`);
    result.errorCode ??= parsedError.userCode;
    return result;
  }

  const apiAccounts = listedAccounts.filter(
    (account) =>
      Boolean(account.id) &&
      (targetSnaptradeAccountId === undefined ||
        account.id === targetSnaptradeAccountId),
  );
  // With several connections, an account without an authorization cannot
  // be placed, so its holdings are not synced: a failure, not a success
  // with stale holdings
  const unplacedAccounts =
    allConnections.length > 1
      ? apiAccounts.filter((account) => !account.brokerage_authorization)
      : [];
  for (const account of unplacedAccounts) {
    console.warn(
      `[SNAPTRADE SYNC] Account ${account.id} reports no authorization; skipped`,
    );
    result.errors.push(
      `Account ${account.name || account.id}: the broker did not say which connection it belongs to, so its holdings were not synced`,
    );
    result.errorCode ??= "snaptradeAccountsUnplaced";
  }

  // An account belongs to the connection whose authorization it reports;
  // one without an authorization can only be placed when there is a
  // single connection
  const belongsTo = (
    account: (typeof apiAccounts)[number],
    connection: Doc<"brokerConnections">,
  ) =>
    account.brokerage_authorization
      ? account.brokerage_authorization === connection.authorizationId
      : allConnections.length === 1;

  const connections = allConnections.filter((connection) => {
    if (scope.kind === "connection") return connection._id === scope.connectionId;
    if (scope.kind === "account") {
      return apiAccounts.some((account) => belongsTo(account, connection));
    }
    return true;
  });
  if (scope.kind === "account" && connections.length === 0) {
    userError(
      unplacedAccounts.length > 0
        ? "snaptradeAccountsUnplaced"
        : "snaptradeAccountUnavailable",
    );
  }

  for (const connection of connections) {
    try {
      await ctx.runMutation(internal.brokers.updateConnectionStatus, {
        connectionId: connection._id,
        status: "syncing",
      });
      if (!connection.brokerLogo) {
        await refreshConnectionLogo(ctx, credentials, connection);
      }

      let accountsAttempted = 0;
      let accountsFailed = 0;
      let reauthError: string | undefined;
      let lastAccountError: string | undefined;
      // transient_error only when every failure was worth retrying
      let allFailuresRetryable = true;
      for (const apiAccount of apiAccounts) {
        if (!belongsTo(apiAccount, connection)) continue;
        accountsAttempted++;
        const accountName = apiAccount.name || "Unknown Account";
        try {
          // Fetch first: nothing is stored unless the holdings arrived
          const holdings = (
            await withSnaptradeRetry(() =>
              snaptrade.accountInformation.getUserHoldings({
                ...credentials,
                accountId: apiAccount.id,
              }),
            )
          ).data;

          const stored: { accountId: Id<"brokerAccounts">; currency: string } =
            await ctx.runMutation(internal.brokers.upsertAccount, {
              userId,
              connectionId: connection._id,
              snaptradeAccountId: apiAccount.id,
              name: apiAccount.name ?? undefined,
              accountNumber: apiAccount.number || undefined,
              accountType: normalizeAccountType(apiAccount.meta?.type),
              currency:
                apiAccount.meta?.currency ||
                apiAccount.balance?.total?.currency ||
                snaptradeHoldingsCurrency(holdings) ||
                undefined,
              institutionName: apiAccount.institution_name || undefined,
            });

          const mapped = mapSnaptradeHoldings(holdings, stored.currency);

          await ctx.runMutation(internal.brokers.replaceAccountHoldings, {
            userId,
            accountId: stored.accountId,
            ...mapped,
          });

          // The account's trade log, for exact snapshot flows. Holdings
          // are already stored: a failure here keeps the cost proxy
          try {
            await syncAccountActivities(
              ctx,
              snaptrade,
              credentials,
              userId,
              stored.accountId,
              apiAccount.id,
              stored.currency,
            );
          } catch (activityError) {
            console.warn(
              `[SNAPTRADE SYNC] Activities of account ${apiAccount.id} not synced:`,
              describeError(activityError),
            );
          }

          result.accountsProcessed++;
          result.positionsProcessed += mapped.positions.length;
        } catch (accountError) {
          console.error(
            `[SNAPTRADE SYNC] Account ${apiAccount.id} failed:`,
            describeError(accountError),
          );
          const parsed = parseSnapTradeError(accountError);
          accountsFailed++;
          lastAccountError = parsed.userCode;
          if (!parsed.isRetryable) allFailuresRetryable = false;
          if (parsed.requiresReauth) reauthError = parsed.userCode;
          result.errors.push(`Account ${accountName}: ${parsed.message}`);
          result.errorCode ??= parsed.userCode;
        }
      }

      // A connection whose accounts all failed, or whose authorization is
      // broken, is not healthy: show why and keep the last good sync time
      if (reauthError !== undefined) {
        await ctx.runMutation(internal.brokers.updateConnectionStatus, {
          connectionId: connection._id,
          status: "reauth_required",
          errorMessage: reauthError,
        });
      } else if (accountsAttempted > 0 && accountsFailed === accountsAttempted) {
        await ctx.runMutation(internal.brokers.updateConnectionStatus, {
          connectionId: connection._id,
          status: allFailuresRetryable ? "transient_error" : "error",
          errorMessage: lastAccountError,
        });
      } else if (accountsAttempted === 0 && unplacedAccounts.length > 0) {
        // The unplaced accounts may be this connection's: not a good sync
        await ctx.runMutation(internal.brokers.updateConnectionStatus, {
          connectionId: connection._id,
          status: "error",
          errorMessage: "snaptradeAccountsUnplaced" satisfies UserErrorCode,
        });
      } else {
        await ctx.runMutation(internal.brokers.updateConnectionStatus, {
          connectionId: connection._id,
          status: "connected",
          lastSyncAt: Date.now(),
        });
      }
      result.connectionsProcessed++;
    } catch (connectionError) {
      const parsedError = parseSnapTradeError(connectionError);
      result.errors.push(
        `Connection ${connection.brokerName}: ${parsedError.message}`,
      );
      result.errorCode ??= parsedError.userCode;
      await ctx.runMutation(internal.brokers.updateConnectionStatus, {
        connectionId: connection._id,
        status: snaptradeFailureStatus(parsedError),
        errorMessage: parsedError.userCode,
      });
    }
  }

  return result;
}

/**
 * Fetch an account's activities (its transaction history) since a week
 * before the newest one stored, or the whole history the first time, page
 * by page, and store the new ones (brokers.upsertTransactions). Pages are
 * stored only once all have arrived, oldest first
 * (fetchActivityPagesOldestFirst), so a failed page (a rate limit) never
 * advances the newest stored date past history not yet stored: the next
 * sync fetches the same window again.
 */
async function syncAccountActivities(
  ctx: ActionCtx,
  snaptrade: ReturnType<typeof getSnaptradeClient>,
  credentials: { userId: string; userSecret: string },
  userId: string,
  accountId: Id<"brokerAccounts">,
  snaptradeAccountId: string,
  accountCurrency: string,
): Promise<void> {
  const newest: string | null = await ctx.runQuery(
    internal.brokers.getNewestTransactionDate,
    { accountId },
  );
  const startDate = activitiesStartDate(newest);
  const pages = await fetchActivityPagesOldestFirst(async (offset) => {
    const page = (
      await withSnaptradeRetry(() =>
        snaptrade.accountInformation.getAccountActivities({
          ...credentials,
          accountId: snaptradeAccountId,
          ...(startDate ? { startDate } : {}),
          offset,
          limit: ACTIVITY_PAGE_SIZE,
        }),
      )
    ).data;
    return { rows: page.data ?? [], total: page.pagination?.total };
  });
  for (const rows of pages) {
    const activities = rows
      .map((a) => mapSnaptradeActivity(a, accountCurrency))
      .filter((a): a is StoredSnaptradeActivity => a !== null);
    if (activities.length === 0) continue;
    await ctx.runMutation(internal.brokers.upsertTransactions, {
      userId,
      accountId,
      activities,
    });
  }
}

/**
 * Sync one connection's accounts and holdings
 */
export const syncAccounts = action({
  args: {
    connectionId: v.id("brokerConnections"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    await enforceUserRateLimit(ctx, "providerRefresh", userId);

    const connection = await ctx.runQuery(
      internal.brokers.getConnectionInternal,
      { connectionId: args.connectionId },
    );
    if (!connection || connection.userId !== userId) {
      userError("connectionNotFound");
    }

    const result = await syncSnaptrade(
      ctx,
      userId,
      { kind: "connection", connectionId: args.connectionId },
      "manual",
    );
    if (!result) userError("snaptradeNotRegistered");
    if (result.errors.length > 0) {
      console.error("[SNAPTRADE SYNC]", result.errors.join("; "));
      userError("snaptradeSyncFailed");
    }

    return { success: true };
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
    await enforceUserRateLimit(ctx, "providerRefresh", identity.subject);

    const result = await syncSnaptrade(
      ctx,
      identity.subject,
      { kind: "account", accountId: args.accountId },
      "manual",
    );
    if (!result) userError("snaptradeNotRegistered");
    if (result.errors.length > 0) {
      console.error("[SNAPTRADE SYNC]", result.errors.join("; "));
      userError("snaptradeSyncFailed");
    }

    return {
      success: true,
      positionsCount: result.positionsProcessed,
    };
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
    const userSecret = decrypt(snaptradeUser.snaptradeUserSecret);

    // Get all connections
    const connections: Array<{
      _id: Id<"brokerConnections">;
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
          describeError(error),
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
 * Sync all data for all connections. The snapshot is skipped when nothing
 * synced and tagged partial when some connection or account failed (its
 * stored data is then a previous sync's).
 * @param skipSnapshot - If true, don't create a snapshot (used by syncAll to avoid duplicates)
 */
export const syncAll = action({
  args: {
    skipSnapshot: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    await enforceUserRateLimit(ctx, "providerRefresh", userId);

    const result = await syncSnaptrade(ctx, userId, { kind: "all" }, "manual");
    if (!result) {
      return { success: true, message: "No SnapTrade user registered" };
    }

    const snapshot = snaptradeSyncSnapshot(result);
    if (!args.skipSnapshot && snapshot.take) {
      try {
        await ctx.runMutation(internal.portfolioSnapshots.takeSnapshot, {
          userId,
          source: "snaptrade",
          partial: snapshot.partial,
        });
      } catch (snapshotError) {
        console.error("Failed to take portfolio snapshot:", describeError(snapshotError));
        // Don't fail the sync if snapshot fails
      }
    }

    return {
      success: result.errors.length === 0,
      ...result,
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
      console.error("List brokers error:", describeError(error));
      snaptradeUserError(error);
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
      console.error("Search brokers error:", describeError(error));
      snaptradeUserError(error);
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL ACTIONS FOR SCHEDULED SYNC
// ═══════════════════════════════════════════════════════════════


/**
 * Internal action to sync all SnapTrade data for a specific user
 * Called by the scheduled daily sync (no authentication required)
 */
export const syncAllForUserInternal = internalAction({
  args: {
    userId: v.string(),
    trigger: syncTriggerValidator,
  },
  returns: v.object({
    success: v.boolean(),
    connectionsProcessed: v.number(),
    accountsProcessed: v.number(),
    positionsProcessed: v.number(),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    { userId, trigger },
  ): Promise<{
    success: boolean;
    connectionsProcessed: number;
    accountsProcessed: number;
    positionsProcessed: number;
    error?: string;
  }> => {
    try {
      const result = await syncSnaptrade(ctx, userId, { kind: "all" }, trigger);
      if (!result) {
        return {
          success: true,
          connectionsProcessed: 0,
          accountsProcessed: 0,
          positionsProcessed: 0,
        };
      }
      const { errors } = result;
      return {
        success: errors.length === 0,
        connectionsProcessed: result.connectionsProcessed,
        accountsProcessed: result.accountsProcessed,
        positionsProcessed: result.positionsProcessed,
        ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
      };
    } catch (error) {
      console.error(`[SNAPTRADE SCHEDULED] Sync error for ${userId}:`, describeError(error));
      return {
        success: false,
        connectionsProcessed: 0,
        accountsProcessed: 0,
        positionsProcessed: 0,
        error: error instanceof Error ? error.message : "Sync failed",
      };
    }
  },
});
