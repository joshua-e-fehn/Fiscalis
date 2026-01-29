import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════
// QUERIES - Metal Catalog
// ═══════════════════════════════════════════════════════════════

/**
 * Get all catalog items, optionally filtered by metal type and/or category
 */
export const getMetalCatalog = query({
  args: {
    metalType: v.optional(
      v.union(
        v.literal("gold"),
        v.literal("silver"),
        v.literal("platinum"),
        v.literal("palladium"),
      ),
    ),
    category: v.optional(v.union(v.literal("coin"), v.literal("bar"))),
  },
  handler: async (ctx, args) => {
    let items;

    if (args.metalType && args.category) {
      items = await ctx.db
        .query("metalCatalog")
        .withIndex("by_metal_category", (q) =>
          q.eq("metalType", args.metalType!).eq("category", args.category!),
        )
        .collect();
    } else if (args.metalType) {
      items = await ctx.db
        .query("metalCatalog")
        .withIndex("by_metal", (q) => q.eq("metalType", args.metalType!))
        .collect();
    } else if (args.category) {
      items = await ctx.db
        .query("metalCatalog")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      items = await ctx.db.query("metalCatalog").collect();
    }

    return items;
  },
});

/**
 * Get popular catalog items for quick-add
 */
export const getPopularCatalogItems = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("metalCatalog")
      .withIndex("by_popular", (q) => q.eq("isPopular", true))
      .collect();
  },
});

/**
 * Get a single catalog item by ID
 */
export const getCatalogItem = query({
  args: { catalogItemId: v.id("metalCatalog") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.catalogItemId);
  },
});

// ═══════════════════════════════════════════════════════════════
// QUERIES - Vault Items
// ═══════════════════════════════════════════════════════════════

/**
 * Get all vault items for a user
 */
export const getUserVaultItems = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("vaultItems")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Enrich with catalog data if available
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        let catalogItem = null;
        if (item.catalogItemId) {
          catalogItem = await ctx.db.get(item.catalogItemId);
        }
        return {
          ...item,
          catalogItem,
          displayName: item.customName || catalogItem?.name || "Unknown Item",
        };
      }),
    );

    return enrichedItems;
  },
});

/**
 * Get vault items filtered by metal type
 */
export const getUserVaultItemsByMetal = query({
  args: {
    userId: v.string(),
    metalType: v.union(
      v.literal("gold"),
      v.literal("silver"),
      v.literal("platinum"),
      v.literal("palladium"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultItems")
      .withIndex("by_user_metal", (q) =>
        q.eq("userId", args.userId).eq("metalType", args.metalType),
      )
      .collect();
  },
});

/**
 * Get a single vault item by ID
 */
export const getVaultItem = query({
  args: { vaultItemId: v.id("vaultItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.vaultItemId);
    if (!item) return null;

    let catalogItem = null;
    if (item.catalogItemId) {
      catalogItem = await ctx.db.get(item.catalogItemId);
    }

    return {
      ...item,
      catalogItem,
      displayName: item.customName || catalogItem?.name || "Unknown Item",
    };
  },
});

/**
 * Get aggregated summary by metal type for a user
 */
export const getUserVaultSummary = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("vaultItems")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Aggregate by metal type
    const summary = {
      gold: { totalFineWeightGrams: 0, totalItems: 0, itemCount: 0 },
      silver: { totalFineWeightGrams: 0, totalItems: 0, itemCount: 0 },
      platinum: { totalFineWeightGrams: 0, totalItems: 0, itemCount: 0 },
      palladium: { totalFineWeightGrams: 0, totalItems: 0, itemCount: 0 },
    };

    for (const item of items) {
      const metal = item.metalType as keyof typeof summary;
      summary[metal].totalFineWeightGrams +=
        item.fineWeightGrams * item.quantity;
      summary[metal].totalItems += item.quantity;
      summary[metal].itemCount += 1;
    }

    return summary;
  },
});

// ═══════════════════════════════════════════════════════════════
// QUERIES - Transactions
// ═══════════════════════════════════════════════════════════════

/**
 * Get transaction history for a specific vault item
 */
export const getVaultItemTransactions = query({
  args: { vaultItemId: v.id("vaultItems") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultTransactions")
      .withIndex("by_item", (q) => q.eq("vaultItemId", args.vaultItemId))
      .order("desc")
      .collect();
  },
});

/**
 * Get all transactions for a user (for history page)
 */
export const getUserTransactions = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("vaultTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc");

    const transactions = args.limit
      ? await query.take(args.limit)
      : await query.collect();

    // Enrich with vault item data
    const enrichedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        const vaultItem = await ctx.db.get(tx.vaultItemId);
        let catalogItem = null;
        if (vaultItem?.catalogItemId) {
          catalogItem = await ctx.db.get(vaultItem.catalogItemId);
        }
        return {
          ...tx,
          itemName:
            vaultItem?.customName || catalogItem?.name || "Unknown Item",
          metalType: vaultItem?.metalType,
        };
      }),
    );

    return enrichedTransactions;
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS - Vault Items
// ═══════════════════════════════════════════════════════════════

/**
 * Add item from catalog to user's vault
 */
export const addVaultItemFromCatalog = mutation({
  args: {
    userId: v.string(),
    catalogItemId: v.id("metalCatalog"),
    quantity: v.number(),
    buyPremium: v.optional(v.number()), // Override default buy premium
    sellPremium: v.optional(v.number()), // Override default sell premium
    purchasePricePerUnit: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
    purchaseCurrency: v.optional(v.string()),
    storageLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const catalogItem = await ctx.db.get(args.catalogItemId);
    if (!catalogItem) {
      throw new Error("Catalog item not found");
    }

    const now = Date.now();
    // Handle backward compatibility: use new premium fields or fall back to old defaultPremium
    const buyPremium =
      args.buyPremium ??
      catalogItem.defaultBuyPremium ??
      (catalogItem as any).defaultPremium ??
      0.03;
    const sellPremium =
      args.sellPremium ?? catalogItem.defaultSellPremium ?? 0.0;

    const vaultItemId = await ctx.db.insert("vaultItems", {
      userId: args.userId,
      catalogItemId: args.catalogItemId,
      metalType: catalogItem.metalType,
      category: catalogItem.category,
      purity: catalogItem.purity,
      weightGrams: catalogItem.weightGrams,
      fineWeightGrams: catalogItem.fineWeightGrams,
      quantity: args.quantity,
      buyPremium,
      sellPremium,
      purchasePricePerUnit: args.purchasePricePerUnit,
      purchaseDate: args.purchaseDate,
      purchaseCurrency: args.purchaseCurrency ?? "EUR",
      storageLocation: args.storageLocation,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Create initial transaction if purchase info provided
    if (args.purchasePricePerUnit && args.purchaseDate) {
      await ctx.db.insert("vaultTransactions", {
        userId: args.userId,
        vaultItemId,
        transactionType: "buy",
        quantity: args.quantity,
        pricePerUnit: args.purchasePricePerUnit,
        currency: args.purchaseCurrency ?? "EUR",
        transactionDate: args.purchaseDate,
        notes: "Initial purchase",
        createdAt: now,
      });
    }

    return vaultItemId;
  },
});

/**
 * Add a custom item (not from catalog) to user's vault
 */
export const addCustomVaultItem = mutation({
  args: {
    userId: v.string(),
    customName: v.string(),
    metalType: v.union(
      v.literal("gold"),
      v.literal("silver"),
      v.literal("platinum"),
      v.literal("palladium"),
    ),
    category: v.union(
      v.literal("coin"),
      v.literal("bar"),
      v.literal("jewelry"),
      v.literal("scrap"),
    ),
    purity: v.number(),
    weightGrams: v.number(),
    quantity: v.number(),
    buyPremium: v.number(),
    sellPremium: v.number(),
    purchasePricePerUnit: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
    purchaseCurrency: v.optional(v.string()),
    storageLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Calculate fine weight from total weight and purity
    const fineWeightGrams = args.weightGrams * (args.purity / 1000);

    const vaultItemId = await ctx.db.insert("vaultItems", {
      userId: args.userId,
      customName: args.customName,
      metalType: args.metalType,
      category: args.category,
      purity: args.purity,
      weightGrams: args.weightGrams,
      fineWeightGrams,
      quantity: args.quantity,
      buyPremium: args.buyPremium,
      sellPremium: args.sellPremium,
      purchasePricePerUnit: args.purchasePricePerUnit,
      purchaseDate: args.purchaseDate,
      purchaseCurrency: args.purchaseCurrency ?? "EUR",
      storageLocation: args.storageLocation,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Create initial transaction if purchase info provided
    if (args.purchasePricePerUnit && args.purchaseDate) {
      await ctx.db.insert("vaultTransactions", {
        userId: args.userId,
        vaultItemId,
        transactionType: "buy",
        quantity: args.quantity,
        pricePerUnit: args.purchasePricePerUnit,
        currency: args.purchaseCurrency ?? "EUR",
        transactionDate: args.purchaseDate,
        notes: "Initial purchase",
        createdAt: now,
      });
    }

    return vaultItemId;
  },
});

/**
 * Update a vault item
 */
export const updateVaultItem = mutation({
  args: {
    vaultItemId: v.id("vaultItems"),
    quantity: v.optional(v.number()),
    buyPremium: v.optional(v.number()),
    sellPremium: v.optional(v.number()),
    purchasePricePerUnit: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
    purchaseCurrency: v.optional(v.string()),
    storageLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
    customName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { vaultItemId, ...updates } = args;

    const existing = await ctx.db.get(vaultItemId);
    if (!existing) {
      throw new Error("Vault item not found");
    }

    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(vaultItemId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return vaultItemId;
  },
});

/**
 * Delete a vault item and its transactions
 */
export const deleteVaultItem = mutation({
  args: { vaultItemId: v.id("vaultItems") },
  handler: async (ctx, args) => {
    // Delete all related transactions first
    const transactions = await ctx.db
      .query("vaultTransactions")
      .withIndex("by_item", (q) => q.eq("vaultItemId", args.vaultItemId))
      .collect();

    for (const tx of transactions) {
      await ctx.db.delete(tx._id);
    }

    // Delete the vault item
    await ctx.db.delete(args.vaultItemId);

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS - Transactions
// ═══════════════════════════════════════════════════════════════

/**
 * Add a transaction (supports backdated entries)
 */
export const addTransaction = mutation({
  args: {
    userId: v.string(),
    vaultItemId: v.id("vaultItems"),
    transactionType: v.union(
      v.literal("buy"),
      v.literal("sell"),
      v.literal("gift_received"),
      v.literal("gift_given"),
    ),
    quantity: v.number(),
    pricePerUnit: v.number(),
    currency: v.string(),
    transactionDate: v.string(), // Any past date allowed
    spotPriceAtTransaction: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vaultItem = await ctx.db.get(args.vaultItemId);
    if (!vaultItem) {
      throw new Error("Vault item not found");
    }

    // Verify the vault item belongs to the user
    if (vaultItem.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    const transactionId = await ctx.db.insert("vaultTransactions", {
      userId: args.userId,
      vaultItemId: args.vaultItemId,
      transactionType: args.transactionType,
      quantity: args.quantity,
      pricePerUnit: args.pricePerUnit,
      currency: args.currency,
      transactionDate: args.transactionDate,
      spotPriceAtTransaction: args.spotPriceAtTransaction,
      notes: args.notes,
      createdAt: Date.now(),
    });

    // Update vault item quantity based on transaction type
    let newQuantity = vaultItem.quantity;
    if (
      args.transactionType === "buy" ||
      args.transactionType === "gift_received"
    ) {
      newQuantity += args.quantity;
    } else if (
      args.transactionType === "sell" ||
      args.transactionType === "gift_given"
    ) {
      newQuantity -= args.quantity;
      if (newQuantity < 0) {
        throw new Error("Cannot sell/give more than owned quantity");
      }
    }

    await ctx.db.patch(args.vaultItemId, {
      quantity: newQuantity,
      updatedAt: Date.now(),
    });

    return transactionId;
  },
});

/**
 * Delete a transaction
 */
export const deleteTransaction = mutation({
  args: {
    transactionId: v.id("vaultTransactions"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    // Reverse the quantity change
    const vaultItem = await ctx.db.get(transaction.vaultItemId);
    if (vaultItem) {
      let newQuantity = vaultItem.quantity;
      if (
        transaction.transactionType === "buy" ||
        transaction.transactionType === "gift_received"
      ) {
        newQuantity -= transaction.quantity;
      } else if (
        transaction.transactionType === "sell" ||
        transaction.transactionType === "gift_given"
      ) {
        newQuantity += transaction.quantity;
      }

      await ctx.db.patch(transaction.vaultItemId, {
        quantity: Math.max(0, newQuantity),
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.transactionId);

    return { success: true };
  },
});
