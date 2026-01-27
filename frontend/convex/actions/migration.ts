"use node";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { encrypt } from "../lib/encryption";
import postgres from "postgres";

// ═══════════════════════════════════════════════════════════════
// DATA MIGRATION FROM POSTGRES (SUPABASE/NEON) TO CONVEX
// ═══════════════════════════════════════════════════════════════

/**
 * Get Postgres database connection
 */
function getDbClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  
  // Log connection attempt (without sensitive data)
  const sanitized = connectionString.replace(/:[^@]+@/, ':***@');
  console.log("Connecting to database:", sanitized);
  
  return postgres(connectionString, {
    ssl: 'require',
    max: 1, // Single connection for serverless
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

function getEncryptionKey(): string {
  const key = process.env.CONVEX_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CONVEX_ENCRYPTION_KEY environment variable is not set");
  }
  return key;
}

// ═══════════════════════════════════════════════════════════════
// PLAID MIGRATION
// ═══════════════════════════════════════════════════════════════

interface NeonPlaidItem {
  id: number;
  user_id: string;
  access_token: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

interface NeonPlaidTransaction {
  id: number;
  plaid_transaction_id: string;
  user_id: string;
  account_id: string;
  amount: string;
  date: Date;
  name: string;
  merchant_name: string | null;
  category: string | null;
  pending: boolean | null;
  synced_at: Date | null;
  updated_at: Date | null;
}

/**
 * Migrate Plaid items from Neon to Convex
 */
export const migratePlaidItems = action({
  args: {
    dryRun: v.optional(v.boolean()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // For security, only allow migrating own data or admin migration
    const targetUserId = args.userId || identity.subject;
    if (args.userId && args.userId !== identity.subject) {
      throw new Error("Cannot migrate data for other users");
    }

    const sql = getDbClient();
    const encryptionKey = getEncryptionKey();

    // Fetch Plaid items from Neon
    const items = await sql`
      SELECT * FROM plaid_items 
      WHERE user_id = ${targetUserId}
    ` as NeonPlaidItem[];

    console.log(`Found ${items.length} Plaid items to migrate for user ${targetUserId}`);

    if (args.dryRun) {
      return {
        dryRun: true,
        itemsFound: items.length,
        items: items.map((item) => ({
          itemId: item.item_id,
          institutionName: item.institution_name,
        })),
      };
    }

    let migratedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        // Encrypt the access token before storing in Convex
        const encryptedToken = encrypt(item.access_token, encryptionKey);

        await ctx.runMutation(internal.banking.saveItem, {
          userId: item.user_id,
          accessToken: encryptedToken,
          itemId: item.item_id,
          institutionId: item.institution_id ?? undefined,
          institutionName: item.institution_name ?? undefined,
        });

        migratedCount++;
        console.log(`Migrated Plaid item: ${item.item_id}`);
      } catch (error) {
        const errorMsg = `Failed to migrate item ${item.item_id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      success: true,
      itemsMigrated: migratedCount,
      totalItems: items.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

/**
 * Migrate Plaid transactions from Neon to Convex
 */
export const migratePlaidTransactions = action({
  args: {
    dryRun: v.optional(v.boolean()),
    userId: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const targetUserId = args.userId || identity.subject;
    if (args.userId && args.userId !== identity.subject) {
      throw new Error("Cannot migrate data for other users");
    }

    const sql = getDbClient();
    const batchSize = args.batchSize || 500;
    const offset = args.offset || 0;

    // Fetch transactions from Neon with pagination
    const transactions = await sql`
      SELECT * FROM plaid_transactions 
      WHERE user_id = ${targetUserId}
      ORDER BY date DESC
      LIMIT ${batchSize}
      OFFSET ${offset}
    ` as NeonPlaidTransaction[];

    console.log(
      `Found ${transactions.length} transactions to migrate (offset: ${offset})`
    );

    if (args.dryRun) {
      return {
        dryRun: true,
        transactionsFound: transactions.length,
        batchSize,
        offset,
        hasMore: transactions.length === batchSize,
      };
    }

    // Convert to Convex format
    const convexTransactions = transactions.map((txn) => ({
      accountId: txn.account_id,
      plaidTransactionId: txn.plaid_transaction_id,
      amount: parseFloat(txn.amount),
      date: txn.date.toISOString().split("T")[0],
      name: txn.name,
      merchantName: txn.merchant_name ?? undefined,
      category: txn.category ?? undefined,
      pending: txn.pending ?? false,
    }));

    // Save in batch
    await ctx.runMutation(internal.banking.saveTransactions, {
      userId: targetUserId,
      transactions: convexTransactions,
    });

    return {
      success: true,
      transactionsMigrated: transactions.length,
      batchSize,
      offset,
      nextOffset: offset + transactions.length,
      hasMore: transactions.length === batchSize,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// BROKER MIGRATION
// ═══════════════════════════════════════════════════════════════

interface NeonBrokerConnection {
  id: number;
  user_id: string;
  broker_type: string;
  connection_name: string;
  status: string;
  account_id: string | null;
  username: string | null;
  last_sync_at: Date | null;
  error_message: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

interface NeonBrokerPosition {
  id: number;
  connection_id: number;
  user_id: string;
  symbol: string;
  name: string | null;
  quantity: string;
  average_cost: string | null;
  current_price: string | null;
  market_value: string | null;
  unrealized_pnl: string | null;
  currency: string | null;
  asset_type: string | null;
  last_updated: Date | null;
}

/**
 * Migrate broker connections from Neon to Convex
 */
export const migrateBrokerConnections = action({
  args: {
    dryRun: v.optional(v.boolean()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const targetUserId = args.userId || identity.subject;
    if (args.userId && args.userId !== identity.subject) {
      throw new Error("Cannot migrate data for other users");
    }

    const sql = getDbClient();

    // Fetch broker connections from Neon
    const connections = await sql`
      SELECT * FROM broker_connections 
      WHERE user_id = ${targetUserId}
    ` as NeonBrokerConnection[];

    console.log(
      `Found ${connections.length} broker connections to migrate`
    );

    if (args.dryRun) {
      return {
        dryRun: true,
        connectionsFound: connections.length,
        connections: connections.map((c) => ({
          name: c.connection_name,
          brokerType: c.broker_type,
          status: c.status,
        })),
      };
    }

    // Map old Neon IDs to new Convex IDs for position migration
    const idMapping: Record<number, string> = {};
    let migratedCount = 0;
    const errors: string[] = [];

    for (const conn of connections) {
      try {
        const now = Date.now();
        const connectionId = await ctx.runMutation(
          internal.migration.createBrokerConnectionInternal,
          {
            userId: conn.user_id,
            brokerType: conn.broker_type,
            connectionName: conn.connection_name,
            status: conn.status as
              | "connected"
              | "disconnected"
              | "error"
              | "pending",
            accountId: conn.account_id ?? undefined,
            username: conn.username ?? undefined,
            lastSyncAt: conn.last_sync_at
              ? conn.last_sync_at.getTime()
              : undefined,
            errorMessage: conn.error_message ?? undefined,
            createdAt: conn.created_at ? conn.created_at.getTime() : now,
            updatedAt: conn.updated_at ? conn.updated_at.getTime() : now,
          }
        );

        idMapping[conn.id] = connectionId;
        migratedCount++;
        console.log(`Migrated broker connection: ${conn.connection_name}`);
      } catch (error) {
        const errorMsg = `Failed to migrate connection ${conn.connection_name}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      success: true,
      connectionsMigrated: migratedCount,
      totalConnections: connections.length,
      idMapping,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

/**
 * Migrate broker positions from Neon to Convex
 * Should be run after migrateBrokerConnections
 */
export const migrateBrokerPositions = action({
  args: {
    dryRun: v.optional(v.boolean()),
    userId: v.optional(v.string()),
    connectionIdMapping: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const targetUserId = args.userId || identity.subject;
    if (args.userId && args.userId !== identity.subject) {
      throw new Error("Cannot migrate data for other users");
    }

    const sql = getDbClient();

    // Fetch positions from Neon
    const positions = await sql`
      SELECT * FROM broker_positions 
      WHERE user_id = ${targetUserId}
    ` as NeonBrokerPosition[];

    console.log(`Found ${positions.length} positions to migrate`);

    if (args.dryRun) {
      return {
        dryRun: true,
        positionsFound: positions.length,
        positions: positions.map((p) => ({
          symbol: p.symbol,
          quantity: p.quantity,
          connectionId: p.connection_id,
        })),
      };
    }

    if (!args.connectionIdMapping) {
      throw new Error(
        "connectionIdMapping is required. Run migrateBrokerConnections first and pass the idMapping."
      );
    }

    // Group positions by connection
    const positionsByConnection: Record<string, typeof positions> = {};
    for (const pos of positions) {
      const newConnectionId = args.connectionIdMapping[String(pos.connection_id)];
      if (!newConnectionId) {
        console.warn(
          `No mapping found for connection_id ${pos.connection_id}, skipping position ${pos.symbol}`
        );
        continue;
      }

      if (!positionsByConnection[newConnectionId]) {
        positionsByConnection[newConnectionId] = [];
      }
      positionsByConnection[newConnectionId].push(pos);
    }

    let totalMigrated = 0;

    for (const [connectionId, connectionPositions] of Object.entries(
      positionsByConnection
    )) {
      const convexPositions = connectionPositions.map((p) => ({
        symbol: p.symbol,
        name: p.name ?? undefined,
        quantity: parseFloat(p.quantity),
        averageCost: p.average_cost ? parseFloat(p.average_cost) : undefined,
        currentPrice: p.current_price
          ? parseFloat(p.current_price)
          : undefined,
        marketValue: p.market_value ? parseFloat(p.market_value) : undefined,
        unrealizedPnl: p.unrealized_pnl
          ? parseFloat(p.unrealized_pnl)
          : undefined,
        currency: p.currency || "USD",
        assetType: p.asset_type ?? undefined,
      }));

      await ctx.runMutation(internal.brokers.savePositions, {
        userId: targetUserId,
        connectionId: connectionId as any, // Type assertion for Convex ID
        positions: convexPositions,
      });

      totalMigrated += connectionPositions.length;
    }

    return {
      success: true,
      positionsMigrated: totalMigrated,
      totalPositions: positions.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// FULL MIGRATION
// ═══════════════════════════════════════════════════════════════

interface MigrationResult {
  success: boolean;
  dryRun?: boolean;
  plaidItems: { itemsFound?: number; itemsMigrated?: number; totalItems?: number };
  plaidTransactions: { totalMigrated: number; batches: number };
  brokerConnections: { connectionsFound?: number; connectionsMigrated?: number; idMapping?: Record<string, string> };
  brokerPositions: { positionsMigrated: number };
}

/**
 * Run full migration for a user (items, transactions, connections, positions)
 * This version requires authentication - use from the app
 */
export const runFullMigration = action({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<MigrationResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    console.log(`Starting full migration for user: ${identity.subject}`);

    // Step 1: Migrate Plaid items
    const plaidItemsResult = await ctx.runAction(
      internal.actions.migration.migratePlaidItemsInternal,
      { userId: identity.subject, dryRun: args.dryRun }
    );
    console.log("Plaid items migration result:", plaidItemsResult);

    // Step 2: Migrate Plaid transactions (paginated)
    const transactionsResult = { totalMigrated: 0, batches: 0 };
    if (!args.dryRun) {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const batchResult = await ctx.runAction(
          internal.actions.migration.migratePlaidTransactionsInternal,
          { userId: identity.subject, offset, batchSize: 500 }
        );
        transactionsResult.totalMigrated += batchResult.transactionsMigrated;
        transactionsResult.batches++;
        hasMore = batchResult.hasMore;
        offset = batchResult.nextOffset;
      }
    }

    // Step 3: Migrate broker connections
    const brokerConnectionsResult = await ctx.runAction(
      internal.actions.migration.migrateBrokerConnectionsInternal,
      { userId: identity.subject, dryRun: args.dryRun }
    );
    console.log("Broker connections migration result:", brokerConnectionsResult);

    // Step 4: Migrate broker positions (if connections were migrated)
    let positionsResult = { positionsMigrated: 0 };
    if (!args.dryRun && brokerConnectionsResult.idMapping) {
      positionsResult = await ctx.runAction(
        internal.actions.migration.migrateBrokerPositionsInternal,
        {
          userId: identity.subject,
          connectionIdMapping: brokerConnectionsResult.idMapping,
        }
      );
    }

    return {
      success: true,
      dryRun: args.dryRun,
      plaidItems: plaidItemsResult,
      plaidTransactions: transactionsResult,
      brokerConnections: brokerConnectionsResult,
      brokerPositions: positionsResult,
    };
  },
});

/**
 * Admin version - Run migration from Convex Dashboard
 * Use this when running from the dashboard (no auth context)
 * 
 * To find your userId: Go to Clerk Dashboard → Users → Click on user → Copy "User ID"
 */
export const runFullMigrationAdmin = internalAction({
  args: {
    userId: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<MigrationResult> => {
    console.log(`[ADMIN] Starting full migration for user: ${args.userId}`);

    // Step 1: Migrate Plaid items
    const plaidItemsResult = await ctx.runAction(
      internal.actions.migration.migratePlaidItemsInternal,
      { userId: args.userId, dryRun: args.dryRun }
    );
    console.log("Plaid items migration result:", plaidItemsResult);

    // Step 2: Migrate Plaid transactions (paginated)
    const transactionsResult = { totalMigrated: 0, batches: 0 };
    if (!args.dryRun) {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const batchResult = await ctx.runAction(
          internal.actions.migration.migratePlaidTransactionsInternal,
          { userId: args.userId, offset, batchSize: 500 }
        );
        transactionsResult.totalMigrated += batchResult.transactionsMigrated;
        transactionsResult.batches++;
        hasMore = batchResult.hasMore;
        offset = batchResult.nextOffset;
      }
    }

    // Step 3: Migrate broker connections
    const brokerConnectionsResult = await ctx.runAction(
      internal.actions.migration.migrateBrokerConnectionsInternal,
      { userId: args.userId, dryRun: args.dryRun }
    );
    console.log("Broker connections migration result:", brokerConnectionsResult);

    // Step 4: Migrate broker positions (if connections were migrated)
    let positionsResult = { positionsMigrated: 0 };
    if (!args.dryRun && brokerConnectionsResult.idMapping) {
      positionsResult = await ctx.runAction(
        internal.actions.migration.migrateBrokerPositionsInternal,
        {
          userId: args.userId,
          connectionIdMapping: brokerConnectionsResult.idMapping,
        }
      );
    }

    return {
      success: true,
      dryRun: args.dryRun,
      plaidItems: plaidItemsResult,
      plaidTransactions: transactionsResult,
      brokerConnections: brokerConnectionsResult,
      brokerPositions: positionsResult,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL ACTIONS (for use by runFullMigration)
// ═══════════════════════════════════════════════════════════════

export const migratePlaidItemsInternal = internalAction({
  args: {
    userId: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sql = getDbClient();
    const encryptionKey = getEncryptionKey();

    const items = await sql`
      SELECT * FROM plaid_items 
      WHERE user_id = ${args.userId}
    ` as NeonPlaidItem[];

    if (args.dryRun) {
      return { itemsFound: items.length };
    }

    let migratedCount = 0;
    for (const item of items) {
      const encryptedToken = encrypt(item.access_token, encryptionKey);
      await ctx.runMutation(internal.banking.saveItem, {
        userId: item.user_id,
        accessToken: encryptedToken,
        itemId: item.item_id,
        institutionId: item.institution_id ?? undefined,
        institutionName: item.institution_name ?? undefined,
      });
      migratedCount++;
    }

    return { itemsMigrated: migratedCount, totalItems: items.length };
  },
});

export const migratePlaidTransactionsInternal = internalAction({
  args: {
    userId: v.string(),
    offset: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sql = getDbClient();
    const batchSize = args.batchSize || 500;
    const offset = args.offset || 0;

    const transactions = await sql`
      SELECT * FROM plaid_transactions 
      WHERE user_id = ${args.userId}
      ORDER BY date DESC
      LIMIT ${batchSize}
      OFFSET ${offset}
    ` as NeonPlaidTransaction[];

    const convexTransactions = transactions.map((txn) => ({
      accountId: txn.account_id,
      plaidTransactionId: txn.plaid_transaction_id,
      amount: parseFloat(txn.amount),
      date: txn.date.toISOString().split("T")[0],
      name: txn.name,
      merchantName: txn.merchant_name ?? undefined,
      category: txn.category ?? undefined,
      pending: txn.pending ?? false,
    }));

    if (convexTransactions.length > 0) {
      await ctx.runMutation(internal.banking.saveTransactions, {
        userId: args.userId,
        transactions: convexTransactions,
      });
    }

    return {
      transactionsMigrated: transactions.length,
      nextOffset: offset + transactions.length,
      hasMore: transactions.length === batchSize,
    };
  },
});

export const migrateBrokerConnectionsInternal = internalAction({
  args: {
    userId: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sql = getDbClient();

    const connections = await sql`
      SELECT * FROM broker_connections 
      WHERE user_id = ${args.userId}
    ` as NeonBrokerConnection[];

    if (args.dryRun) {
      return { connectionsFound: connections.length };
    }

    const idMapping: Record<string, string> = {};
    for (const conn of connections) {
      const now = Date.now();
      const connectionId = await ctx.runMutation(
        internal.migration.createBrokerConnectionInternal,
        {
          userId: conn.user_id,
          brokerType: conn.broker_type,
          connectionName: conn.connection_name,
          status: conn.status as
            | "connected"
            | "disconnected"
            | "error"
            | "pending",
          accountId: conn.account_id ?? undefined,
          username: conn.username ?? undefined,
          lastSyncAt: conn.last_sync_at
            ? conn.last_sync_at.getTime()
            : undefined,
          errorMessage: conn.error_message ?? undefined,
          createdAt: conn.created_at ? conn.created_at.getTime() : now,
          updatedAt: conn.updated_at ? conn.updated_at.getTime() : now,
        }
      );
      idMapping[String(conn.id)] = connectionId;
    }

    return {
      connectionsMigrated: connections.length,
      idMapping,
    };
  },
});

export const migrateBrokerPositionsInternal = internalAction({
  args: {
    userId: v.string(),
    connectionIdMapping: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const sql = getDbClient();

    const positions = await sql`
      SELECT * FROM broker_positions 
      WHERE user_id = ${args.userId}
    ` as NeonBrokerPosition[];

    const positionsByConnection: Record<string, typeof positions> = {};
    for (const pos of positions) {
      const newConnectionId =
        args.connectionIdMapping[String(pos.connection_id)];
      if (!newConnectionId) continue;

      if (!positionsByConnection[newConnectionId]) {
        positionsByConnection[newConnectionId] = [];
      }
      positionsByConnection[newConnectionId].push(pos);
    }

    let totalMigrated = 0;
    for (const [connectionId, connectionPositions] of Object.entries(
      positionsByConnection
    )) {
      const convexPositions = connectionPositions.map((p) => ({
        symbol: p.symbol,
        name: p.name ?? undefined,
        quantity: parseFloat(p.quantity),
        averageCost: p.average_cost ? parseFloat(p.average_cost) : undefined,
        currentPrice: p.current_price
          ? parseFloat(p.current_price)
          : undefined,
        marketValue: p.market_value ? parseFloat(p.market_value) : undefined,
        unrealizedPnl: p.unrealized_pnl
          ? parseFloat(p.unrealized_pnl)
          : undefined,
        currency: p.currency || "USD",
        assetType: p.asset_type ?? undefined,
      }));

      await ctx.runMutation(internal.brokers.savePositions, {
        userId: args.userId,
        connectionId: connectionId as any,
        positions: convexPositions,
      });

      totalMigrated += connectionPositions.length;
    }

    return { positionsMigrated: totalMigrated };
  },
});
