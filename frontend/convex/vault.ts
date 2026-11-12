import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import {
  resolvePremiums,
  vaultItemValuation,
} from "../../services/finance/metals";
import {
  normalizeCurrency,
  toBase,
  type FxRates,
} from "../../services/finance/currency";
import {
  LedgerError,
  itemProjection,
  ledgerOverCounts,
  missingOpeningTransaction,
  replayLedger,
  retainedBasePrice,
  transactionUnitAmount,
  validateTransactionInput,
  type ItemLedger,
  type LedgerTransaction,
  type ToBaseAmount,
} from "../../services/finance/metalsLedger";
import { loadFxRates } from "./fxRates";
import { loadSpotPrices } from "./lib/netWorth";
import { scheduleSnapshot } from "./portfolioSnapshots";

// ═══════════════════════════════════════════════════════════════
// LEDGER - vaultTransactions are the source of truth
// ═══════════════════════════════════════════════════════════════
// An item's quantity and cost come from replaying its transactions
// (services/finance/metalsLedger.ts). vaultItems.quantity and
// vaultItems.purchasePricePerUnit are cached projections that every
// mutation changing the ledger rewrites (syncProjection), so net worth and
// snapshots keep reading the item fields.

type VaultItemDoc = Doc<"vaultItems">;
type VaultTransactionDoc = Doc<"vaultTransactions">;

const transactionTypeValidator = v.union(
  v.literal("buy"),
  v.literal("sell"),
  v.literal("gift_received"),
  v.literal("gift_given"),
);

/** EUR amounts through the FX mirror (services/finance/currency toBase). */
export function toBaseAmountWith(rates: FxRates): ToBaseAmount {
  return (amount, currency) => {
    const converted = toBase(amount, currency, rates);
    return converted.ok ? converted.value : null;
  };
}

export function asLedgerTransaction(tx: VaultTransactionDoc): LedgerTransaction {
  return {
    transactionType: tx.transactionType,
    quantity: tx.quantity,
    pricePerUnit: tx.pricePerUnit ?? null,
    currency: tx.currency,
    pricePerUnitBase: tx.pricePerUnitBase ?? null,
    transactionDate: tx.transactionDate ?? null,
    createdAt: tx.createdAt,
  };
}

/**
 * EUR per unit of a price paid or received on `transactionDate`, at the FX
 * rate of that day (the latest rate for an undated opening balance), to
 * store as `pricePerUnitBase`. Undefined when the price is unknown or the
 * currency has no rate.
 */
export async function basePricePerUnit(
  ctx: { db: QueryCtx["db"] },
  tx: {
    pricePerUnit?: number | null;
    currency: string;
    transactionDate?: string | null;
  },
): Promise<number | undefined> {
  if (tx.pricePerUnit == null) return undefined;
  const code = normalizeCurrency(tx.currency)?.code;
  const timestamp = tx.transactionDate ? Date.parse(tx.transactionDate) : NaN;
  const rates = await loadFxRates(ctx, {
    asOf: Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString().slice(0, 10)
      : undefined,
    currencies: code ? [code] : [],
  });
  return (
    transactionUnitAmount(
      { pricePerUnit: tx.pricePerUnit, currency: tx.currency },
      toBaseAmountWith(rates),
    ) ?? undefined
  );
}

/** The opening balance: flagged, or noted "Initial purchase" on old documents. */
export function isOpeningTransaction(tx: VaultTransactionDoc): boolean {
  return tx.isOpening ?? tx.notes === "Initial purchase";
}

export async function itemTransactions(
  ctx: { db: QueryCtx["db"] },
  vaultItemId: Id<"vaultItems">,
): Promise<VaultTransactionDoc[]> {
  return await ctx.db
    .query("vaultTransactions")
    .withIndex("by_item", (q) => q.eq("vaultItemId", vaultItemId))
    .collect();
}

/**
 * The item's ledger, including the opening balance an item stored before
 * the ledger was complete is missing (computed, not written). Null when the
 * stored ledger cannot be replayed (it sells more than it holds) or adds
 * up to more than the cached quantity (migrations.backfillVaultLedger
 * reports such items).
 */
function readItemLedger(
  item: VaultItemDoc,
  txs: VaultTransactionDoc[],
  toBaseAmount: ToBaseAmount,
): ItemLedger | null {
  const ledger = txs.map(asLedgerTransaction);
  // Inconsistent with the cached quantity: show the cached fields
  if (ledgerOverCounts(item, ledger)) return null;
  const opening = missingOpeningTransaction(item, ledger);
  try {
    return replayLedger(opening ? [...ledger, opening] : ledger, toBaseAmount);
  } catch (error) {
    if (error instanceof LedgerError) return null;
    throw error;
  }
}

/**
 * An item as the vault pages read it: catalog data, its replayed ledger and
 * its EUR valuation at the spot mirror (vaultItemValuation, the valuation
 * net worth uses), with the spot price it was valued at so the client can
 * show it in another currency (convertAtSpotRates).
 */
async function vaultItemView(
  ctx: QueryCtx,
  item: VaultItemDoc,
  toBaseAmount: ToBaseAmount,
  spotByMetal: Awaited<ReturnType<typeof loadSpotPrices>>,
  now: number,
) {
  const catalogItem = item.catalogItemId
    ? await ctx.db.get(item.catalogItemId)
    : null;
  const ledger = readItemLedger(
    item,
    await itemTransactions(ctx, item._id),
    toBaseAmount,
  );
  const spot = spotByMetal.get(item.metalType);
  return {
    ...item,
    catalogItem,
    displayName: item.customName || catalogItem?.name || "Unknown Item",
    ledger,
    valuation: {
      ...vaultItemValuation(item, ledger, spot, now, toBaseAmount),
      spot: spot
        ? { eurPerOunce: spot.eurPerOunce, sourceTimestamp: spot.sourceTimestamp }
        : null,
    },
  };
}

/** A LedgerError as an error the client can show; anything else rethrown. */
function asUserError(error: unknown): unknown {
  return error instanceof LedgerError ? new ConvexError(error.message) : error;
}

/** validateTransactionInput against today, as a user-facing error. */
function validateInput(
  tx: Parameters<typeof validateTransactionInput>[0],
  options: { requireDate?: boolean } = {},
) {
  try {
    validateTransactionInput(tx, { ...options, now: Date.now() });
  } catch (error) {
    throw asUserError(error);
  }
}

/**
 * Write the opening balance an older item is missing, so the ledger
 * accounts for its whole quantity before it changes. Returns the item's
 * transactions including it.
 */
export async function ensureOpeningTransaction(
  ctx: MutationCtx,
  item: VaultItemDoc,
): Promise<VaultTransactionDoc[]> {
  const txs = await itemTransactions(ctx, item._id);
  const opening = missingOpeningTransaction(item, txs.map(asLedgerTransaction));
  if (!opening) return txs;
  const id = await ctx.db.insert("vaultTransactions", {
    userId: item.userId,
    vaultItemId: item._id,
    transactionType: "buy",
    quantity: opening.quantity,
    pricePerUnit: opening.pricePerUnit ?? undefined,
    currency: opening.currency,
    pricePerUnitBase: await basePricePerUnit(ctx, opening),
    transactionDate: opening.transactionDate ?? undefined,
    isOpening: true,
    notes: "Opening balance",
    createdAt: item.createdAt,
  });
  return [...txs, (await ctx.db.get(id))!];
}

/**
 * Replay the item's ledger and write its cached quantity and average cost.
 * Throws (rolling the whole mutation back) when the ledger would hold a
 * negative quantity at any date.
 */
export async function syncProjection(
  ctx: MutationCtx,
  vaultItemId: Id<"vaultItems">,
  toBaseAmount?: ToBaseAmount,
): Promise<ItemLedger> {
  const txs = await itemTransactions(ctx, vaultItemId);
  const convert = toBaseAmount ?? toBaseAmountWith(await loadFxRates(ctx));
  let ledger: ItemLedger;
  try {
    ledger = replayLedger(txs.map(asLedgerTransaction), convert);
  } catch (error) {
    throw asUserError(error);
  }
  await ctx.db.patch(vaultItemId, {
    ...itemProjection(ledger),
    updatedAt: Date.now(),
  });
  return ledger;
}

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
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const items = await ctx.db
      .query("vaultItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const toBaseAmount = toBaseAmountWith(await loadFxRates(ctx));
    const spotByMetal = await loadSpotPrices(ctx);
    const now = Date.now();

    // Enrich with catalog data, the item's replayed ledger (quantity over
    // time, average cost, realized P/L; null when it cannot be replayed) and
    // its server valuation
    return await Promise.all(
      items.map((item) =>
        vaultItemView(ctx, item, toBaseAmount, spotByMetal, now),
      ),
    );
  },
});

/**
 * Get vault items filtered by metal type
 */
export const getUserVaultItemsByMetal = query({
  args: {
    metalType: v.union(
      v.literal("gold"),
      v.literal("silver"),
      v.literal("platinum"),
      v.literal("palladium"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("vaultItems")
      .withIndex("by_user_metal", (q) =>
        q.eq("userId", userId).eq("metalType", args.metalType),
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
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const item = await getOwnedDoc(ctx, userId, args.vaultItemId);
    if (!item) return null;
    return await vaultItemView(
      ctx,
      item,
      toBaseAmountWith(await loadFxRates(ctx)),
      await loadSpotPrices(ctx),
      Date.now(),
    );
  },
});

/**
 * Get aggregated summary by metal type for a user
 */
export const getUserVaultSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const items = userId
      ? await ctx.db
          .query("vaultItems")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      : [];

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
    const userId = await getUserId(ctx);
    if (!userId) return [];
    if (!(await getOwnedDoc(ctx, userId, args.vaultItemId))) return [];
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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    let query = ctx.db
      .query("vaultTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
          // Listed in the history with its unknown cost or date shown as such
          isOpening: isOpeningTransaction(tx),
        };
      }),
    );

    return enrichedTransactions;
  },
});


// ═══════════════════════════════════════════════════════════════
// MUTATIONS - Vault Items
// ═══════════════════════════════════════════════════════════════

const openingArgs = {
  quantity: v.number(),
  purchasePricePerUnit: v.optional(v.number()),
  // New entries are asked for it (D3); without one the opening balance is
  // held since before any range, never dated at record creation
  purchaseDate: v.optional(v.string()),
  purchaseCurrency: v.optional(v.string()),
};

/**
 * Insert a vault item with its opening balance and the projection of that
 * ledger. Every item starts with an opening transaction, priced or not,
 * dated or not.
 */
async function createVaultItem(
  ctx: MutationCtx,
  userId: string,
  fields: Omit<
    VaultItemDoc,
    | "_id"
    | "_creationTime"
    | "userId"
    | "quantity"
    | "purchasePricePerUnit"
    | "purchaseDate"
    | "purchaseCurrency"
    | "createdAt"
    | "updatedAt"
  >,
  opening: {
    quantity: number;
    purchasePricePerUnit?: number;
    purchaseDate?: string;
    purchaseCurrency?: string;
  },
): Promise<Id<"vaultItems">> {
  validateInput({
    quantity: opening.quantity,
    pricePerUnit: opening.purchasePricePerUnit,
    transactionDate: opening.purchaseDate,
  });
  const now = Date.now();
  const currency = opening.purchaseCurrency ?? "EUR";
  const vaultItemId = await ctx.db.insert("vaultItems", {
    ...fields,
    userId,
    quantity: opening.quantity,
    purchasePricePerUnit: opening.purchasePricePerUnit,
    purchaseDate: opening.purchaseDate,
    purchaseCurrency: currency,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("vaultTransactions", {
    userId,
    vaultItemId,
    transactionType: "buy",
    quantity: opening.quantity,
    pricePerUnit: opening.purchasePricePerUnit,
    currency,
    pricePerUnitBase: await basePricePerUnit(ctx, {
      pricePerUnit: opening.purchasePricePerUnit,
      currency,
      transactionDate: opening.purchaseDate,
    }),
    transactionDate: opening.purchaseDate,
    isOpening: true,
    notes: "Initial purchase",
    createdAt: now,
  });
  await syncProjection(ctx, vaultItemId);
  await scheduleSnapshot(ctx, userId, "vault");
  return vaultItemId;
}

/**
 * Add item from catalog to user's vault
 */
export const addVaultItemFromCatalog = mutation({
  args: {
    catalogItemId: v.id("metalCatalog"),
    ...openingArgs,
    buyPremium: v.optional(v.number()), // Override default buy premium
    sellPremium: v.optional(v.number()), // Override default sell premium
    storageLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const catalogItem = await ctx.db.get(args.catalogItemId);
    if (!catalogItem) {
      throw new Error("Catalog item not found");
    }

    // Explicit premium, then the catalog default, then the legacy single
    // `defaultPremium` field on old catalog documents, then the shared default.
    const { buyPremium, sellPremium } = resolvePremiums({
      buy: [
        args.buyPremium,
        catalogItem.defaultBuyPremium,
        (catalogItem as { defaultPremium?: number }).defaultPremium,
      ],
      sell: [args.sellPremium, catalogItem.defaultSellPremium],
    });

    return await createVaultItem(
      ctx,
      userId,
      {
        catalogItemId: args.catalogItemId,
        metalType: catalogItem.metalType,
        category: catalogItem.category,
        purity: catalogItem.purity,
        weightGrams: catalogItem.weightGrams,
        fineWeightGrams: catalogItem.fineWeightGrams,
        buyPremium,
        sellPremium,
        storageLocation: args.storageLocation,
        notes: args.notes,
      },
      args,
    );
  },
});

/**
 * Add a custom item (not from catalog) to user's vault
 */
export const addCustomVaultItem = mutation({
  args: {
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
    ...openingArgs,
    buyPremium: v.number(),
    sellPremium: v.number(),
    storageLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!(args.weightGrams > 0) || !(args.purity > 0)) {
      throw new ConvexError("Weight and purity must be greater than 0");
    }
    return await createVaultItem(
      ctx,
      userId,
      {
        customName: args.customName,
        metalType: args.metalType,
        category: args.category,
        purity: args.purity,
        weightGrams: args.weightGrams,
        // Fine weight from total weight and purity (per mille)
        fineWeightGrams: args.weightGrams * (args.purity / 1000),
        buyPremium: args.buyPremium,
        sellPremium: args.sellPremium,
        storageLocation: args.storageLocation,
        notes: args.notes,
      },
      args,
    );
  },
});

/**
 * Update a vault item. Quantity, purchase price, date and currency are
 * ledger fields: they edit the item's opening balance (the quantity is the
 * new total held, the price is per unit in purchaseCurrency), and the
 * edit is rejected when the ledger would then hold a negative quantity.
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
    const {
      vaultItemId,
      quantity,
      purchasePricePerUnit,
      purchaseDate,
      purchaseCurrency,
      ...updates
    } = args;

    const userId = await requireUserId(ctx);
    const existing = await getOwnedDoc(ctx, userId, vaultItemId);
    if (!existing) {
      throw new Error("Vault item not found");
    }

    // Non-ledger fields: filter out undefined values
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

    const editsLedger =
      quantity !== undefined ||
      purchasePricePerUnit !== undefined ||
      purchaseDate !== undefined ||
      purchaseCurrency !== undefined;
    if (editsLedger) {
      const txs = await ensureOpeningTransaction(ctx, existing);
      const opening = txs.find(isOpeningTransaction);
      if (!opening) {
        throw new ConvexError(
          "This item has no opening balance; record a buy or sale instead",
        );
      }
      const toBaseAmount = toBaseAmountWith(await loadFxRates(ctx));
      let held: number;
      try {
        held = replayLedger(txs.map(asLedgerTransaction), toBaseAmount).quantity;
      } catch (error) {
        throw asUserError(error);
      }
      const openingQuantity =
        opening.quantity + (quantity === undefined ? 0 : quantity - held);
      const next = {
        quantity: openingQuantity,
        pricePerUnit: purchasePricePerUnit ?? opening.pricePerUnit,
        transactionDate: purchaseDate ?? opening.transactionDate,
      };
      validateInput(next);
      const currency = purchaseCurrency ?? opening.currency;
      // A quantity-only edit keeps the acquisition's EUR price: converting
      // again would reprice it at today's rate (undated openings)
      const pricePerUnitBase =
        retainedBasePrice(asLedgerTransaction(opening), { ...next, currency }) ??
        (await basePricePerUnit(ctx, { ...next, currency }));
      await ctx.db.patch(opening._id, {
        ...next,
        currency,
        pricePerUnitBase,
        isOpening: true,
      });
      if (purchaseDate !== undefined) {
        await ctx.db.patch(vaultItemId, { purchaseDate });
      }
      await syncProjection(ctx, vaultItemId, toBaseAmount);
    }

    await scheduleSnapshot(ctx, userId, "vault");
    return vaultItemId;
  },
});

/**
 * Delete a vault item and its transactions
 */
export const deleteVaultItem = mutation({
  args: { vaultItemId: v.id("vaultItems") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!(await getOwnedDoc(ctx, userId, args.vaultItemId))) {
      throw new Error("Vault item not found");
    }

    // Delete all related transactions first
    for (const tx of await itemTransactions(ctx, args.vaultItemId)) {
      await ctx.db.delete(tx._id);
    }

    // Delete the vault item
    await ctx.db.delete(args.vaultItemId);

    await scheduleSnapshot(ctx, userId, "vault");
    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS - Transactions
// ═══════════════════════════════════════════════════════════════

interface TransactionInput {
  transactionType: VaultTransactionDoc["transactionType"];
  quantity: number;
  pricePerUnit: number;
  currency: string;
  transactionDate: string;
  spotPriceAtTransaction?: number;
  notes?: string;
}

/**
 * Append a transaction to an item's ledger and rewrite its projection.
 * Throws when the input is invalid or the item would hold a negative
 * quantity at any date.
 */
async function recordTransaction(
  ctx: MutationCtx,
  userId: string,
  vaultItemId: Id<"vaultItems">,
  tx: TransactionInput,
  toBaseAmount: ToBaseAmount,
): Promise<Id<"vaultTransactions">> {
  // Every transaction but the opening balance is dated (D3)
  validateInput(tx, { requireDate: true });
  // Re-read: an earlier sale in the same mutation changed the projection
  const vaultItem = await getOwnedDoc(ctx, userId, vaultItemId);
  if (!vaultItem) {
    throw new Error("Vault item not found");
  }
  await ensureOpeningTransaction(ctx, vaultItem);
  const transactionId = await ctx.db.insert("vaultTransactions", {
    userId,
    vaultItemId,
    ...tx,
    pricePerUnitBase: await basePricePerUnit(ctx, tx),
    createdAt: Date.now(),
  });
  await syncProjection(ctx, vaultItemId, toBaseAmount);
  return transactionId;
}

/**
 * Add a transaction (supports backdated entries)
 */
export const addTransaction = mutation({
  args: {
    vaultItemId: v.id("vaultItems"),
    transactionType: transactionTypeValidator,
    quantity: v.number(),
    pricePerUnit: v.number(),
    currency: v.string(),
    transactionDate: v.string(), // Any past date allowed
    spotPriceAtTransaction: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { vaultItemId, ...tx } = args;
    const transactionId = await recordTransaction(
      ctx,
      userId,
      vaultItemId,
      tx,
      toBaseAmountWith(await loadFxRates(ctx)),
    );
    await scheduleSnapshot(ctx, userId, "vault");
    return transactionId;
  },
});

/**
 * Sell several items at once, in one transaction: either every sale is
 * recorded or none is.
 */
export const sellItems = mutation({
  args: {
    sales: v.array(
      v.object({
        vaultItemId: v.id("vaultItems"),
        quantity: v.number(),
        pricePerUnit: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
    currency: v.string(),
    transactionDate: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.sales.length === 0) {
      throw new ConvexError("Nothing to sell");
    }
    const toBaseAmount = toBaseAmountWith(await loadFxRates(ctx));
    const transactionIds: Id<"vaultTransactions">[] = [];
    for (const sale of args.sales) {
      transactionIds.push(
        await recordTransaction(
          ctx,
          userId,
          sale.vaultItemId,
          {
            transactionType: "sell",
            quantity: sale.quantity,
            pricePerUnit: sale.pricePerUnit,
            currency: args.currency,
            transactionDate: args.transactionDate,
            notes: sale.notes,
          },
          toBaseAmount,
        ),
      );
    }
    await scheduleSnapshot(ctx, userId, "vault");
    return transactionIds;
  },
});

/**
 * Delete a transaction. Rejected when the item would then hold a negative
 * quantity at any date (e.g. deleting a buy that a later sale relies on).
 */
export const deleteTransaction = mutation({
  args: {
    transactionId: v.id("vaultTransactions"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const transaction = await getOwnedDoc(ctx, userId, args.transactionId);
    if (!transaction) {
      throw new Error("Transaction not found");
    }
    const vaultItem = await getOwnedDoc(ctx, userId, transaction.vaultItemId);
    if (vaultItem) {
      await ensureOpeningTransaction(ctx, vaultItem);
    }

    await ctx.db.delete(args.transactionId);

    if (vaultItem) {
      await syncProjection(ctx, vaultItem._id);
    }

    await scheduleSnapshot(ctx, userId, "vault");
    return { success: true };
  },
});
