import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMetalsPrices, getSpotPrice } from "@/hooks/metals";
import {
  MetalsPrices,
  MetalItemWithValuation,
  MetalsSummary,
  MetalSummary,
  MetalsType,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import {
  calculateMarketValue,
  calculateMeltValue,
  calculatePremiumValue,
  calculateBuyPrice,
  calculateSellPrice,
  calculatePriceChange,
  gramsToTroyOunces,
} from "@/convex/lib/priceCalculations";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Return type for useMetals hook */
interface UseMetalsReturn {
  items: MetalItemWithValuation[] | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
  pricesError: Error | null;
  prices: MetalsPrices | undefined;
}

/** Return type for useMetalsSummary hook */
interface UseMetalsSummaryReturn {
  summary: MetalsSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
}

/** Return type for useMetalItem hook */
interface UseMetalItemReturn {
  item: MetalItemWithValuation | undefined;
  transactions:
    | typeof api.vault.getVaultItemTransactions._returnType
    | undefined;
  isLoading: boolean;
  isError: boolean;
  pricesLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Enrich a metal item with current valuations
 */
function enrichItemWithValuation(
  item: NonNullable<typeof api.vault.getUserVaultItems._returnType>[number],
  prices: MetalsPrices | undefined,
  currency: MetalsCurrency = "eur",
): MetalItemWithValuation {
  // Get spot price for this metal from /api/metals/prices/all/latest
  const spotPrice = prices
    ? getSpotPrice(prices, item.metalType as MetalsType, currency)
    : null;

  // Handle backward compatibility: use new premium fields or fall back to old premium
  const buyPremium = item.buyPremium ?? (item as any).premium ?? 0.03;
  const sellPremium = item.sellPremium ?? 0.0;

  // Calculate buy price (what you'd pay to acquire this today)
  const currentBuyPrice = spotPrice
    ? calculateBuyPrice(spotPrice, item.fineWeightGrams, buyPremium, 1)
    : 0;

  // Calculate sell price (what you'd receive selling today)
  const currentSellPrice = spotPrice
    ? calculateSellPrice(spotPrice, item.fineWeightGrams, sellPremium, 1)
    : 0;

  // Market value uses sell price (liquidation value)
  const marketValue = spotPrice
    ? calculateSellPrice(
        spotPrice,
        item.fineWeightGrams,
        sellPremium,
        item.quantity,
      )
    : 0;

  // Melt value is pure metal value at spot (no premium)
  const meltValue = spotPrice
    ? calculateMeltValue(spotPrice, item.fineWeightGrams, item.quantity)
    : 0;

  // Calculate premium values
  const buyPremiumValue = spotPrice
    ? calculatePremiumValue(
        spotPrice,
        item.fineWeightGrams,
        buyPremium,
        item.quantity,
      )
    : 0;

  const sellPremiumValue = spotPrice
    ? calculatePremiumValue(
        spotPrice,
        item.fineWeightGrams,
        sellPremium,
        item.quantity,
      )
    : 0;

  // Calculate P/L if we have purchase info
  // P/L is based on what you paid vs what you'd get selling (marketValue = sell price)
  const totalCost = item.purchasePricePerUnit
    ? item.purchasePricePerUnit * item.quantity
    : null;

  const profitLoss =
    totalCost !== null && marketValue > 0
      ? calculatePriceChange(marketValue, totalCost).absolute
      : null;

  const profitLossPercent =
    totalCost !== null && marketValue > 0
      ? calculatePriceChange(marketValue, totalCost).percentage
      : null;

  return {
    _id: item._id,
    userId: item.userId,
    catalogItemId: item.catalogItemId ?? undefined,
    customName: item.customName ?? undefined,
    metalType: item.metalType as MetalsType,
    category: item.category as "coin" | "bar" | "jewelry" | "scrap",
    purity: item.purity,
    weightGrams: item.weightGrams,
    fineWeightGrams: item.fineWeightGrams,
    quantity: item.quantity,
    buyPremium,
    sellPremium,
    purchasePricePerUnit: item.purchasePricePerUnit ?? undefined,
    purchaseDate: item.purchaseDate ?? undefined,
    purchaseCurrency: item.purchaseCurrency ?? undefined,
    storageLocation: item.storageLocation ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    displayName: item.displayName,
    catalogItem: item.catalogItem
      ? {
          name: item.catalogItem.name,
          country: item.catalogItem.country ?? undefined,
          mint: item.catalogItem.mint ?? undefined,
          imageUrl: item.catalogItem.imageUrl ?? undefined,
        }
      : undefined,
    currentBuyPrice,
    currentSellPrice,
    marketValue,
    meltValue,
    buyPremiumValue,
    sellPremiumValue,
    totalCost,
    profitLoss,
    profitLossPercent,
  };
}

/**
 * Calculate summary for a single metal type
 */
function calculateMetalSummary(
  items: MetalItemWithValuation[],
  metalType: MetalsType,
): MetalSummary {
  const metalItems = items.filter((item) => item.metalType === metalType);

  const totalFineWeightGrams = metalItems.reduce(
    (sum, item) => sum + item.fineWeightGrams * item.quantity,
    0,
  );

  const totalItems = metalItems.reduce((sum, item) => sum + item.quantity, 0);

  const marketValue = metalItems.reduce(
    (sum, item) => sum + item.marketValue,
    0,
  );

  const meltValue = metalItems.reduce((sum, item) => sum + item.meltValue, 0);

  // Only calculate cost/P&L if all items have purchase info
  const itemsWithCost = metalItems.filter((item) => item.totalCost !== null);
  const totalCost =
    itemsWithCost.length === metalItems.length && metalItems.length > 0
      ? itemsWithCost.reduce((sum, item) => sum + (item.totalCost ?? 0), 0)
      : null;

  const profitLoss =
    totalCost !== null
      ? calculatePriceChange(marketValue, totalCost).absolute
      : null;

  const profitLossPercent =
    totalCost !== null
      ? calculatePriceChange(marketValue, totalCost).percentage
      : null;

  return {
    totalFineWeightGrams,
    totalFineWeightOz: gramsToTroyOunces(totalFineWeightGrams),
    totalItems,
    itemCount: metalItems.length,
    marketValue,
    meltValue,
    totalCost,
    profitLoss,
    profitLossPercent,
  };
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Main metals hook - combines Convex data with Supabase prices
 *
 * Returns metal items enriched with current market valuations
 * calculated using live spot prices from Supabase.
 */
export function useMetals(
  userId: string,
  currency: MetalsCurrency = "eur",
): UseMetalsReturn {
  // Fetch metal items from Convex
  const metalItems = useQuery(api.vault.getUserVaultItems, { userId });

  // Fetch prices from Supabase
  const {
    data: prices,
    isLoading: pricesLoading,
    isError: pricesError,
    error,
  } = useMetalsPrices();

  // Enrich items with valuations
  const enrichedItems = metalItems?.map((item) =>
    enrichItemWithValuation(item, prices, currency),
  );

  return {
    items: enrichedItems,
    isLoading: metalItems === undefined,
    isError: metalItems === undefined && !pricesLoading,
    pricesLoading,
    pricesError: pricesError ? (error as Error) : null,
    prices,
  };
}

/**
 * Metals summary hook - aggregated portfolio statistics
 *
 * Calculates total portfolio value, per-metal breakdowns,
 * and allocation percentages using live Supabase prices.
 */
export function useMetalsSummary(
  userId: string,
  currency: MetalsCurrency = "eur",
): UseMetalsSummaryReturn {
  // Get all items with valuations
  const { items, isLoading, isError, pricesLoading } = useMetals(
    userId,
    currency,
  );

  // Calculate summary if we have items
  let summary: MetalsSummary | undefined;

  if (items) {
    const gold = calculateMetalSummary(items, "gold");
    const silver = calculateMetalSummary(items, "silver");
    const platinum = calculateMetalSummary(items, "platinum");
    const palladium = calculateMetalSummary(items, "palladium");

    const totalMarketValue =
      gold.marketValue +
      silver.marketValue +
      platinum.marketValue +
      palladium.marketValue;

    const totalMeltValue =
      gold.meltValue +
      silver.meltValue +
      platinum.meltValue +
      palladium.meltValue;

    // Calculate total cost only if all metals have complete cost data
    const allCostsAvailable = [gold, silver, platinum, palladium].every(
      (m) => m.totalCost !== null || m.itemCount === 0,
    );

    const totalCost = allCostsAvailable
      ? (gold.totalCost ?? 0) +
        (silver.totalCost ?? 0) +
        (platinum.totalCost ?? 0) +
        (palladium.totalCost ?? 0)
      : null;

    const totalProfitLoss =
      totalCost !== null
        ? calculatePriceChange(totalMarketValue, totalCost).absolute
        : null;

    const totalProfitLossPercent =
      totalCost !== null
        ? calculatePriceChange(totalMarketValue, totalCost).percentage
        : null;

    // Calculate allocation percentages
    const allocation = {
      gold:
        totalMarketValue > 0 ? (gold.marketValue / totalMarketValue) * 100 : 0,
      silver:
        totalMarketValue > 0
          ? (silver.marketValue / totalMarketValue) * 100
          : 0,
      platinum:
        totalMarketValue > 0
          ? (platinum.marketValue / totalMarketValue) * 100
          : 0,
      palladium:
        totalMarketValue > 0
          ? (palladium.marketValue / totalMarketValue) * 100
          : 0,
    };

    summary = {
      gold,
      silver,
      platinum,
      palladium,
      totalMarketValue,
      totalMeltValue,
      totalCost,
      totalProfitLoss,
      totalProfitLossPercent,
      allocation,
    };
  }

  return {
    summary,
    isLoading,
    isError,
    pricesLoading,
  };
}

/**
 * Single metal item hook with full details and transactions
 */
export function useMetalItem(
  itemId: Id<"vaultItems">,
  currency: MetalsCurrency = "eur",
): UseMetalItemReturn {
  // Fetch item details from Convex
  const item = useQuery(api.vault.getVaultItem, { vaultItemId: itemId });

  // Fetch transactions for this item
  const transactions = useQuery(api.vault.getVaultItemTransactions, {
    vaultItemId: itemId,
  });

  // Fetch prices from Supabase
  const { data: prices, isLoading: pricesLoading } = useMetalsPrices();

  // Enrich item with valuation
  const enrichedItem = item
    ? enrichItemWithValuation(
        item as NonNullable<
          typeof api.vault.getUserVaultItems._returnType
        >[number],
        prices,
        currency,
      )
    : undefined;

  return {
    item: enrichedItem,
    transactions,
    isLoading: item === undefined || transactions === undefined,
    isError: false,
    pricesLoading,
  };
}

// ═══════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════

/** Add item from catalog */
export function useAddMetalItemFromCatalog() {
  return useMutation(api.vault.addVaultItemFromCatalog);
}

/** Add custom item */
export function useAddCustomMetalItem() {
  return useMutation(api.vault.addCustomVaultItem);
}

/** Update metal item */
export function useUpdateMetalItem() {
  return useMutation(api.vault.updateVaultItem);
}

/** Delete metal item */
export function useDeleteMetalItem() {
  return useMutation(api.vault.deleteVaultItem);
}

/** Add transaction */
export function useAddMetalTransaction() {
  return useMutation(api.vault.addTransaction);
}

/** Delete transaction */
export function useDeleteMetalTransaction() {
  return useMutation(api.vault.deleteTransaction);
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION HOOKS
// ═══════════════════════════════════════════════════════════════

/** Transaction from Convex with item enrichment */
export type VaultTransaction = NonNullable<
  typeof api.vault.getUserTransactions._returnType
>[number];

/** Return type for useVaultTransactions hook */
interface UseVaultTransactionsReturn {
  transactions: VaultTransaction[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Get all transactions for a user (for history page)
 */
export function useVaultTransactions(
  userId: string,
  limit?: number,
): UseVaultTransactionsReturn {
  const transactions = useQuery(api.vault.getUserTransactions, {
    userId,
    limit,
  });

  return {
    transactions,
    isLoading: transactions === undefined,
    isError: false,
  };
}
