import {
  pgTable,
  timestamp,
  numeric,
  text,
  boolean,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const precious_metal_prices = pgTable("precious_metal_prices", {
  timestamp: timestamp("timestamp").primaryKey(),
  gold_eur: numeric("gold_eur", { precision: 10, scale: 2 }).notNull(),
  gold_usd: numeric("gold_usd", { precision: 10, scale: 2 }).notNull(),
  silver_eur: numeric("silver_eur", { precision: 10, scale: 2 }).notNull(),
  silver_usd: numeric("silver_usd", { precision: 10, scale: 2 }).notNull(),
  platinum_eur: numeric("platinum_eur", { precision: 10, scale: 2 }).notNull(),
  platinum_usd: numeric("platinum_usd", { precision: 10, scale: 2 }).notNull(),
  palladium_eur: numeric("palladium_eur", {
    precision: 10,
    scale: 2,
  }).notNull(),
  palladium_usd: numeric("palladium_usd", {
    precision: 10,
    scale: 2,
  }).notNull(),
});

export const currency_exchange_rates = pgTable("currency_exchange_rates", {
  timestamp: timestamp("timestamp").primaryKey(),
  from_eur_to_usd: numeric("from_eur_to_usd", {
    precision: 10,
    scale: 4,
  }).notNull(),
});

export const plaidItems = pgTable(
  "plaid_items",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(), // Should reference Clerk user IDs
    accessToken: text("access_token").notNull(),
    itemId: text("item_id").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => {
    return {
      userItemIdx: uniqueIndex("user_item_idx").on(table.userId, table.itemId),
    };
  }
);

export const plaidTransactions = pgTable(
  "plaid_transactions",
  {
    id: serial("id").primaryKey(),
    plaidTransactionId: text("plaid_transaction_id").notNull(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    amount: numeric("amount", { precision: 13, scale: 2 }).notNull(),
    date: timestamp("date").notNull(),
    name: text("name").notNull(),
    merchantName: text("merchant_name"),
    category: text("category"),
    pending: boolean("pending").default(false),
    syncedAt: timestamp("synced_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => {
    return {
      // Ensure we don't duplicate transactions
      transactionIdx: uniqueIndex("transaction_idx").on(
        table.userId,
        table.plaidTransactionId
      ),
    };
  }
);
