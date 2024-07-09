import { pgTable, timestamp, numeric } from "drizzle-orm/pg-core";

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
