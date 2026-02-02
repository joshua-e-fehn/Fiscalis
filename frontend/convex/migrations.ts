import { mutation } from "./_generated/server";
import {
  classifyPlaidAccount,
  classifySnaptradePosition,
  getClassificationFields,
  convertCurrency,
  getCurrencyConversionFields,
  BASE_CURRENCY,
} from "./lib/classification";

/**
 * Migration: Update metalCatalog and vaultItems to use buyPremium/sellPremium
 *
 * This migration converts the old `premium` field to the new
 * `buyPremium` and `sellPremium` fields.
 *
 * Run once: await ctx.runMutation(api.migrations.migratePremiums)
 */
export const migratePremiums = mutation({
  args: {},
  handler: async (ctx) => {
    let catalogUpdated = 0;
    let itemsUpdated = 0;

    // Update metalCatalog entries
    const catalogItems = await ctx.db.query("metalCatalog").collect();
    for (const item of catalogItems) {
      // Check if item has old schema (defaultPremium instead of defaultBuyPremium)
      const itemData = item as any;
      if (
        itemData.defaultPremium !== undefined &&
        itemData.defaultBuyPremium === undefined
      ) {
        await ctx.db.patch(item._id, {
          defaultBuyPremium: itemData.defaultPremium,
          defaultSellPremium: 0.0, // Default sell at spot
        } as any);
        // Note: We can't delete the old field in Convex, but schema validation will ignore it
        catalogUpdated++;
      }
    }

    // Update vaultItems entries
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      // Check if item has old schema (premium instead of buyPremium)
      const itemData = item as any;
      if (itemData.premium !== undefined && itemData.buyPremium === undefined) {
        await ctx.db.patch(item._id, {
          buyPremium: itemData.premium,
          sellPremium: 0.0, // Default sell at spot
        } as any);
        itemsUpdated++;
      }
    }

    return {
      message: "Migration completed",
      catalogUpdated,
      itemsUpdated,
    };
  },
});

/**
 * Clean up old fields after migration
 * This removes the deprecated fields from documents
 */
export const cleanupOldPremiumFields = mutation({
  args: {},
  handler: async (ctx) => {
    let catalogCleaned = 0;
    let itemsCleaned = 0;

    // Clean metalCatalog
    const catalogItems = await ctx.db.query("metalCatalog").collect();
    for (const item of catalogItems) {
      const itemData = item as any;
      if (itemData.defaultPremium !== undefined) {
        // Replace the entire document without the old field
        const { defaultPremium, _id, _creationTime, ...rest } = itemData;
        await ctx.db.replace(item._id, rest);
        catalogCleaned++;
      }
    }

    // Clean vaultItems
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      const itemData = item as any;
      if (itemData.premium !== undefined) {
        // Replace the entire document without the old field
        const { premium, _id, _creationTime, ...rest } = itemData;
        await ctx.db.replace(item._id, rest);
        itemsCleaned++;
      }
    }

    return {
      message: "Cleanup completed",
      catalogCleaned,
      itemsCleaned,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION MIGRATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Migration: Classify all existing Plaid accounts
 *
 * This migration applies the classification engine to all existing
 * Plaid accounts that don't have a classification yet.
 *
 * Run: await ctx.runMutation(api.migrations.classifyPlaidAccounts)
 */
export const classifyPlaidAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    let classified = 0;
    let skipped = 0;
    let errors = 0;

    const accounts = await ctx.db.query("plaidAccounts").collect();

    for (const account of accounts) {
      try {
        // Skip if already classified (unless we want to re-classify)
        if (account.investmentCategory && !account.userCategoryOverride) {
          skipped++;
          continue;
        }

        // Skip if user has an override
        if (account.userCategoryOverride) {
          skipped++;
          continue;
        }

        const classification = classifyPlaidAccount({
          type: account.type,
          subtype: account.subtype ?? null,
          name: account.name,
        });

        const fields = getClassificationFields(classification);

        await ctx.db.patch(account._id, fields);
        classified++;
      } catch (error) {
        console.error(`Error classifying account ${account._id}:`, error);
        errors++;
      }
    }

    return {
      message: "Plaid account classification completed",
      totalAccounts: accounts.length,
      classified,
      skipped,
      errors,
    };
  },
});

/**
 * Migration: Classify all existing broker positions
 *
 * This migration applies the classification engine to all existing
 * broker positions and converts their values to base currency.
 *
 * Run: await ctx.runMutation(api.migrations.classifyBrokerPositions)
 */
export const classifyBrokerPositions = mutation({
  args: {},
  handler: async (ctx) => {
    let classified = 0;
    let skipped = 0;
    let errors = 0;

    const positions = await ctx.db.query("brokerPositions").collect();

    for (const position of positions) {
      try {
        // Skip if user has an override
        if (position.userCategoryOverride) {
          skipped++;
          continue;
        }

        const classification = classifySnaptradePosition({
          assetType: position.assetType,
          symbol: position.symbol,
          name: position.name ?? null,
          quantity: position.quantity,
          marketValue: position.marketValue ?? null,
        });

        const classificationFields = getClassificationFields(classification);

        // Convert to base currency
        let currencyFields = {};
        if (
          position.marketValue !== undefined &&
          position.marketValue !== null
        ) {
          const conversion = convertCurrency(
            position.marketValue,
            position.currency,
            BASE_CURRENCY,
          );
          currencyFields = getCurrencyConversionFields(conversion);
        }

        await ctx.db.patch(position._id, {
          ...classificationFields,
          ...currencyFields,
        });
        classified++;
      } catch (error) {
        console.error(`Error classifying position ${position._id}:`, error);
        errors++;
      }
    }

    return {
      message: "Broker position classification completed",
      totalPositions: positions.length,
      classified,
      skipped,
      errors,
    };
  },
});

/**
 * Migration: Re-classify all items (force update)
 *
 * This migration re-classifies ALL items, even those already classified.
 * User overrides are preserved.
 *
 * Run: await ctx.runMutation(api.migrations.reclassifyAll)
 */
export const reclassifyAll = mutation({
  args: {},
  handler: async (ctx) => {
    let plaidClassified = 0;
    let positionsClassified = 0;
    let plaidSkipped = 0;
    let positionsSkipped = 0;

    // Re-classify Plaid accounts
    const accounts = await ctx.db.query("plaidAccounts").collect();
    for (const account of accounts) {
      // Skip if user has an override
      if (account.userCategoryOverride) {
        plaidSkipped++;
        continue;
      }

      const classification = classifyPlaidAccount({
        type: account.type,
        subtype: account.subtype ?? null,
        name: account.name,
      });

      await ctx.db.patch(account._id, getClassificationFields(classification));
      plaidClassified++;
    }

    // Re-classify broker positions
    const positions = await ctx.db.query("brokerPositions").collect();
    for (const position of positions) {
      // Skip if user has an override
      if (position.userCategoryOverride) {
        positionsSkipped++;
        continue;
      }

      const classification = classifySnaptradePosition({
        assetType: position.assetType,
        symbol: position.symbol,
        name: position.name ?? null,
        quantity: position.quantity,
        marketValue: position.marketValue ?? null,
      });

      const classificationFields = getClassificationFields(classification);

      // Update currency conversion
      let currencyFields = {};
      if (position.marketValue !== undefined && position.marketValue !== null) {
        const conversion = convertCurrency(
          position.marketValue,
          position.currency,
          BASE_CURRENCY,
        );
        currencyFields = getCurrencyConversionFields(conversion);
      }

      await ctx.db.patch(position._id, {
        ...classificationFields,
        ...currencyFields,
      });
      positionsClassified++;
    }

    return {
      message: "Re-classification completed",
      plaid: {
        total: accounts.length,
        classified: plaidClassified,
        skipped: plaidSkipped,
      },
      brokerPositions: {
        total: positions.length,
        classified: positionsClassified,
        skipped: positionsSkipped,
      },
    };
  },
});

/**
 * Get classification statistics
 *
 * Returns a summary of how items are classified across the database.
 * Useful for debugging and monitoring.
 */
export const getClassificationStats = mutation({
  args: {},
  handler: async (ctx) => {
    const plaidAccounts = await ctx.db.query("plaidAccounts").collect();
    const brokerPositions = await ctx.db.query("brokerPositions").collect();

    // Plaid stats
    const plaidByCategory: Record<string, number> = {};
    let plaidUnclassified = 0;
    let plaidWithOverride = 0;

    for (const acc of plaidAccounts) {
      if (acc.userCategoryOverride) plaidWithOverride++;
      const cat = acc.investmentCategory ?? "unclassified";
      if (cat === "unclassified") plaidUnclassified++;
      plaidByCategory[cat] = (plaidByCategory[cat] ?? 0) + 1;
    }

    // Position stats
    const positionsByCategory: Record<string, number> = {};
    let positionsUnclassified = 0;
    let positionsWithOverride = 0;

    for (const pos of brokerPositions) {
      if (pos.userCategoryOverride) positionsWithOverride++;
      const cat = pos.investmentCategory ?? "unclassified";
      if (cat === "unclassified") positionsUnclassified++;
      positionsByCategory[cat] = (positionsByCategory[cat] ?? 0) + 1;
    }

    return {
      plaidAccounts: {
        total: plaidAccounts.length,
        unclassified: plaidUnclassified,
        withUserOverride: plaidWithOverride,
        byCategory: plaidByCategory,
      },
      brokerPositions: {
        total: brokerPositions.length,
        unclassified: positionsUnclassified,
        withUserOverride: positionsWithOverride,
        byCategory: positionsByCategory,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// VEZGO CONNECTION MIGRATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Known exchanges by name - used for provider type detection
 */
const KNOWN_EXCHANGES = [
  "binance",
  "coinbase",
  "kraken",
  "kucoin",
  "bitfinex",
  "gemini",
  "bitstamp",
  "okx",
  "bybit",
  "gate.io",
  "huobi",
  "crypto.com",
  "ftx",
  "poloniex",
  "bittrex",
  "coinbase pro",
  "binance.us",
];

/**
 * Migration: Fix Vezgo connection provider types
 *
 * Some connections may have incorrect providerType (e.g., Binance as "wallet"
 * instead of "exchange"). This migration fixes them based on known exchanges.
 *
 * Run: await ctx.runMutation(api.migrations.fixVezgoConnectionTypes)
 */
export const fixVezgoConnectionTypes = mutation({
  args: {},
  handler: async (ctx) => {
    let fixed = 0;
    let skipped = 0;
    const changes: Array<{ name: string; from: string; to: string }> = [];

    const connections = await ctx.db.query("vezgoConnections").collect();

    for (const connection of connections) {
      const providerName = connection.provider?.toLowerCase() || "";
      const displayName = connection.name?.toLowerCase() || "";

      // Check if this is a known exchange
      const isKnownExchange = KNOWN_EXCHANGES.some(
        (ex) => providerName.includes(ex) || displayName.includes(ex),
      );

      // Skip if already migrated to categories
      const connData = connection as any;
      if (connData.categories) {
        skipped++;
        continue;
      }

      // If it's a known exchange but marked as wallet, fix it
      if (isKnownExchange && connData.providerType !== "exchange") {
        changes.push({
          name: connection.name,
          from: connData.providerType,
          to: "exchange",
        });

        await ctx.db.patch(connection._id, {
          providerType: "exchange",
          updatedAt: Date.now(),
        } as any);
        fixed++;
      } else {
        skipped++;
      }
    }

    return {
      message: "Vezgo connection types migration completed",
      totalConnections: connections.length,
      fixed,
      skipped,
      changes,
    };
  },
});

/**
 * Known software/hardware wallets for categorization
 */
const KNOWN_WALLETS = [
  "metamask",
  "phantom",
  "trust",
  "exodus",
  "atomic",
  "coinomi",
  "electrum",
  "mycelium",
  "blue wallet",
  "wasabi",
  "sparrow",
  "rainbow",
  "argent",
  "zerion",
  "rabby",
  "ledger",
  "trezor",
  "keepkey",
  "coldcard",
  "bitbox",
  "safepal",
];

/**
 * Known blockchain address providers for categorization
 */
const KNOWN_BLOCKCHAINS = [
  "bitcoin",
  "ethereum",
  "solana",
  "polygon",
  "avalanche",
  "arbitrum",
  "optimism",
  "base",
  "bnb",
  "fantom",
  "cronos",
  "near",
  "cosmos",
  "cardano",
  "polkadot",
  "tron",
  "litecoin",
  "dogecoin",
  "ripple",
  "xrp",
];

type ProviderCategory = "exchange" | "wallet" | "blockchain";

/**
 * Map provider name to categories
 */
function mapProviderCategories(providerName: string): ProviderCategory[] {
  const name = providerName?.toLowerCase() || "";
  const categories: ProviderCategory[] = [];

  if (KNOWN_EXCHANGES.some((ex) => name.includes(ex))) {
    categories.push("exchange");
  }

  if (KNOWN_WALLETS.some((w) => name.includes(w))) {
    categories.push("wallet");
  }

  if (KNOWN_BLOCKCHAINS.some((bc) => name.includes(bc))) {
    categories.push("blockchain");
  }

  // Default to wallet if no categories matched
  if (categories.length === 0) {
    categories.push("wallet");
  }

  return categories;
}

/**
 * Migration: Convert providerType to categories array
 *
 * This migration converts the old single providerType field to the new
 * categories array that can hold multiple values (exchange, wallet, blockchain).
 *
 * Run: await ctx.runMutation(api.migrations.migrateVezgoToCategories)
 */
export const migrateVezgoToCategories = mutation({
  args: {},
  handler: async (ctx) => {
    let migrated = 0;
    let skipped = 0;
    const changes: Array<{
      name: string;
      oldType: string;
      newCategories: ProviderCategory[];
    }> = [];

    const connections = await ctx.db.query("vezgoConnections").collect();

    for (const connection of connections) {
      const connData = connection as any;

      // Skip if already has categories
      if (connData.categories && Array.isArray(connData.categories)) {
        skipped++;
        continue;
      }

      // Calculate categories based on provider name
      const categories = mapProviderCategories(connection.provider);

      changes.push({
        name: connection.name,
        oldType: connData.providerType || "unknown",
        newCategories: categories,
      });

      // Update to new schema
      await ctx.db.patch(connection._id, {
        categories,
        updatedAt: Date.now(),
      } as any);

      migrated++;
    }

    return {
      message: "Vezgo categories migration completed",
      totalConnections: connections.length,
      migrated,
      skipped,
      changes,
    };
  },
});

/**
 * Migration: Remove old providerType field after categories migration
 *
 * Run this AFTER migrateVezgoToCategories and verifying everything works.
 *
 * Run: await ctx.runMutation(api.migrations.cleanupVezgoProviderType)
 */
export const cleanupVezgoProviderType = mutation({
  args: {},
  handler: async (ctx) => {
    let cleaned = 0;
    let skipped = 0;

    const connections = await ctx.db.query("vezgoConnections").collect();

    for (const connection of connections) {
      const connData = connection as any;

      // Only clean if it has both categories and providerType
      if (!connData.categories || !connData.providerType) {
        skipped++;
        continue;
      }

      // Remove providerType by replacing the document
      const { providerType, _id, _creationTime, ...rest } = connData;
      await ctx.db.replace(connection._id, rest);
      cleaned++;
    }

    return {
      message: "Cleanup completed - providerType field removed",
      totalConnections: connections.length,
      cleaned,
      skipped,
    };
  },
});
